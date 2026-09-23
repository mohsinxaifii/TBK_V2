(function () {
  function splitChars(items) {
    items.forEach((item) => {
      const textNode = Array.from(item.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
      if (!textNode) return;

      const word = document.createElement('span');
      word.className = 'bullets-scroller-word';

      Array.from(textNode.textContent).forEach((char) => {
        const charSpan = document.createElement('span');
        charSpan.className = 'bullets-scroller-char';
        charSpan.textContent = char === ' ' ? ' ' : char;
        word.appendChild(charSpan);
      });

      item.replaceChild(word, textNode);
    });
  }

  function createScroller(container) {
    const reveal = container.querySelector('.bullets-scroller-reveal');
    const track = container.querySelector('.bullets-scroller-track');
    const items = Array.from(container.querySelectorAll('.bullets-scroller-item'));

    splitChars(items);
    const chars = Array.from(container.querySelectorAll('.bullets-scroller-char, .bullets-scroller-dot'));
    chars.forEach((el) => {
      el._scale = 1;
      el._tilt = 0;
      el._depth = 0;
      el._opacity = 1;
      el._push = 0;
      // Measured once, at rest, before any transform is ever applied — used
      // to work out how much room a scaled-up char/space needs to push its
      // neighbours by.
      el._baseWidth = el.getBoundingClientRect().width;
    });
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const baseSpeed = parseFloat(container.dataset.speed) || 70; // px per second
    const direction = container.dataset.direction === 'reverse' ? -1 : 1;
    const maxScale = 1.3;
    const maxTilt = 68; // degrees of rotateY at the lens edge
    const maxDepth = 42; // px of translateZ bulge at the lens center
    const maxBoost = baseSpeed * 11;

    let lensRadius = 220;
    function updateLensRadius() {
      const width = container.getBoundingClientRect().width || window.innerWidth;
      lensRadius = Math.max(220, width * 0.46);
    }
    updateLensRadius();
    window.addEventListener('resize', updateLensRadius);

    let offset = 0;
    let currentSpeed = 0;
    let boost = 0;
    let isScrolling = false;
    let scrollStopTimer = null;
    let lastScrollY = window.scrollY;
    let inView = false;
    let lastFrameTime = null;
    let rafId = null;

    let isDragging = false;
    let dragPointerId = null;
    let dragStartX = 0;
    let dragStartOffset = 0;
    let pointerX = null;

    function resetChars() {
      chars.forEach((el) => {
        el._scale = 1;
        el._tilt = 0;
        el._depth = 0;
        el._opacity = 1;
        el._push = 0;
        el.style.transform = 'translateX(0px) perspective(560px) rotateY(0deg) translateZ(0px) scale(1)';
        el.style.opacity = '1';
      });
    }

    function handleScroll() {
      const currentY = window.scrollY;
      const delta = Math.abs(currentY - lastScrollY);
      lastScrollY = currentY;
      boost = Math.min(boost + delta * 8, maxBoost);

      isScrolling = true;
      clearTimeout(scrollStopTimer);
      scrollStopTimer = setTimeout(() => {
        isScrolling = false;
      }, 160);
    }

    // Per-letter lens effect: direct style writes on transform/opacity only
    // (compositor-friendly, no layout reflow). A running cumulative offset
    // (also transform-only, via translateX) gives scaled-up chars — including
    // the space chars between words — real breathing room from whatever
    // follows them, without ever touching a real layout property like width
    // or margin.
    function updateLens(dt, centerX) {
      const tau = 0.12;
      const factor = 1 - Math.exp(-dt / tau);
      const active = (isScrolling || isDragging) && !reducedMotion;

      // Push decays as it travels along the sequence instead of accumulating
      // indefinitely — bounded to roughly a word's width, so it still spans
      // a duplicated-set boundary correctly when a zoom is actually happening
      // there (no overlap), but never carries a large, asymmetric total all
      // the way around the loop (no seam hitch either).
      const pushDecay = 0.78;
      let cumulativePush = 0;

      chars.forEach((el) => {
        let targetScale = 1;
        let targetOpacity = 1;
        let targetTilt = 0;
        let targetDepth = 0;

        if (active) {
          const rect = el.getBoundingClientRect();
          const elCenter = rect.left + rect.width / 2;
          const signedOffset = elCenter - centerX;
          const distance = Math.abs(signedOffset);
          const t = Math.max(0, 1 - distance / lensRadius);
          const eased = t * t * (3 - 2 * t);
          const side = signedOffset === 0 ? 0 : Math.sign(signedOffset);

          targetScale = 1 + eased * (maxScale - 1);
          targetOpacity = 0.65 + eased * 0.35;
          targetTilt = side * (1 - eased) * maxTilt;
          targetDepth = eased * maxDepth;
        }

        el._scale += (targetScale - el._scale) * factor;
        el._opacity += (targetOpacity - el._opacity) * factor;
        el._tilt += (targetTilt - el._tilt) * factor;
        el._depth += (targetDepth - el._depth) * factor;
        el._push += (cumulativePush - el._push) * factor;

        el.style.transform =
          `translateX(${el._push.toFixed(2)}px) perspective(560px) rotateY(${el._tilt.toFixed(2)}deg) ` +
          `translateZ(${el._depth.toFixed(2)}px) scale(${el._scale.toFixed(3)})`;
        el.style.opacity = el._opacity.toFixed(3);

        const extra = Math.max(0, el._scale - 1) * (el._baseWidth || 10);
        cumulativePush = cumulativePush * pushDecay + extra;
      });
    }

    function frame(timestamp) {
      if (!inView) {
        rafId = null;
        return;
      }
      if (lastFrameTime === null) lastFrameTime = timestamp;
      let dt = (timestamp - lastFrameTime) / 1000;
      dt = Math.min(dt, 0.05);
      lastFrameTime = timestamp;

      if (!reducedMotion) {
        if (isDragging) {
          currentSpeed = 0;
          boost = 0;
        } else {
          const targetSpeed = baseSpeed + boost;
          currentSpeed += (targetSpeed - currentSpeed) * (1 - Math.exp(-dt / 0.12));
          offset += currentSpeed * dt * direction;
          boost *= Math.pow(0.92, dt * 60);
          if (boost < 0.5) boost = 0;
        }

        // A single continuously-integrated float, wrapped by exact pixel
        // modulo every frame — this is what guarantees a mathematically
        // seamless loop (no tween-repeat cycle to fall out of sync).
        const halfWidth = track.scrollWidth / 2 || 1;
        offset = ((offset % halfWidth) + halfWidth) % halfWidth;
        track.style.transform = `translate3d(${-offset}px, 0, 0)`;
      }

      let centerX;
      if (isDragging && pointerX !== null) {
        centerX = pointerX;
      } else {
        const rect = container.getBoundingClientRect();
        centerX = rect.left + rect.width / 2;
      }

      updateLens(dt, centerX);

      rafId = requestAnimationFrame(frame);
    }

    function startFrameLoop() {
      if (rafId === null) {
        lastFrameTime = null;
        rafId = requestAnimationFrame(frame);
      }
    }

    function startDrag(event) {
      if (reducedMotion || !inView) return;
      isDragging = true;
      dragPointerId = event.pointerId;
      dragStartX = event.clientX;
      dragStartOffset = offset;
      pointerX = event.clientX;
      isScrolling = true; // keeps the lens active for the duration of the grab
      container.classList.add('is-dragging');
      container.setPointerCapture(event.pointerId);
    }

    function moveDrag(event) {
      if (!isDragging || event.pointerId !== dragPointerId) return;
      pointerX = event.clientX;
      const deltaX = event.clientX - dragStartX;
      offset = dragStartOffset - deltaX;
    }

    function endDrag(event) {
      if (!isDragging || (dragPointerId !== null && event.pointerId !== dragPointerId)) return;
      isDragging = false;
      dragPointerId = null;
      pointerX = null;
      container.classList.remove('is-dragging');
      clearTimeout(scrollStopTimer);
      scrollStopTimer = setTimeout(() => {
        isScrolling = false;
      }, 160);
    }

    if (!reducedMotion) {
      container.addEventListener('pointerdown', startDrag);
      container.addEventListener('pointermove', moveDrag);
      container.addEventListener('pointerup', endDrag);
      container.addEventListener('pointercancel', endDrag);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          inView = entry.isIntersecting;
          if (entry.isIntersecting) {
            reveal.classList.add('is-visible');
            lastScrollY = window.scrollY;
            if (!reducedMotion) {
              window.addEventListener('scroll', handleScroll, { passive: true });
              startFrameLoop();
            }
          } else {
            window.removeEventListener('scroll', handleScroll);
            clearTimeout(scrollStopTimer);
            isScrolling = false;
            isDragging = false;
            resetChars();
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(container);
  }

  function initBulletsScrollers(root) {
    root.querySelectorAll('[data-bullets-scroller]').forEach((container) => {
      if (container.bulletsScrollerInitialized) return;
      container.bulletsScrollerInitialized = true;
      createScroller(container);
    });
  }

  document.addEventListener('DOMContentLoaded', () => initBulletsScrollers(document));
  document.addEventListener('shopify:section:load', (event) => initBulletsScrollers(event.target));
})();
