document.addEventListener('DOMContentLoaded', () => {
  const marquees = document.querySelectorAll('[data-story-tags-marquee]');
  if (!marquees.length) return;

  marquees.forEach((viewport) => {
    const track = viewport.querySelector('[data-story-tags-track]');
    if (!track) return;

    const originalItems = Array.from(track.children);
    if (!originalItems.length) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasGsap = typeof window.gsap !== 'undefined';
    const speed = 36; // px per second

    let repeatWidth = 0;
    let x = 0;
    let isDragging = false;
    let dragMoved = false;
    let dragStartX = 0;
    let dragStartOffset = 0;
    let autoplay = true;
    let resumeTimer = null;
    let activePointerId = null;
    let suppressClick = false;

    const cloneSet = () => {
      originalItems.forEach((item) => {
        const clone = item.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        clone.querySelectorAll('a, button').forEach((el) => el.setAttribute('tabindex', '-1'));
        track.appendChild(clone);
      });
    };

    const ensureLoopWidth = () => {
      const viewportWidth = viewport.getBoundingClientRect().width || 1;
      let guard = 0;
      while (track.scrollWidth < viewportWidth * 2 + 200 && guard < 20) {
        cloneSet();
        guard += 1;
      }
    };

    const measure = () => {
      ensureLoopWidth();
      const secondSetStart = track.children[originalItems.length];
      repeatWidth = secondSetStart
        ? secondSetStart.offsetLeft - track.children[0].offsetLeft
        : track.scrollWidth;
    };

    const setX = (value) => {
      if (repeatWidth <= 0) return;
      let wrapped = value % repeatWidth;
      if (wrapped > 0) wrapped -= repeatWidth;
      x = wrapped;
      track.style.transform = `translate3d(${x}px, 0, 0)`;
    };

    measure();
    window.addEventListener('resize', measure);

    if (!reduceMotion) {
      if (hasGsap) {
        gsap.ticker.add((time, deltaMs) => {
          if (!autoplay || isDragging) return;
          setX(x - (speed * deltaMs) / 1000);
        });
      } else {
        let last = performance.now();
        const tick = (now) => {
          const dt = (now - last) / 1000;
          last = now;
          if (autoplay && !isDragging) setX(x - speed * dt);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }

    // A drag ends with a click on whichever tag was under the pointer, so that
    // one click is swallowed. The flag is cleared on every pointerdown, so a
    // drag that never produces a click can't eat a later genuine one.
    track.addEventListener(
      'click',
      (event) => {
        if (!suppressClick) return;
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
      },
      true
    );

    const onPointerDown = (event) => {
      isDragging = true;
      dragMoved = false;
      suppressClick = false;
      autoplay = false;
      dragStartX = event.clientX;
      dragStartOffset = x;
      activePointerId = event.pointerId;
      viewport.classList.add('is-dragging');
    };

    const onPointerMove = (event) => {
      if (!isDragging) return;
      const delta = event.clientX - dragStartX;
      if (!dragMoved && Math.abs(delta) > 5) {
        dragMoved = true;
        // Capture only once this is a real drag. Capturing on pointerdown
        // retargets the following pointerup/mouseup to the viewport, which
        // makes the browser fire click on the viewport instead of the tag
        // anchor underneath it, so tag links never navigate.
        if (viewport.setPointerCapture) {
          viewport.setPointerCapture(event.pointerId);
        }
      }
      setX(dragStartOffset + delta);
    };

    const endDrag = () => {
      if (!isDragging) return;
      isDragging = false;
      viewport.classList.remove('is-dragging');
      if (activePointerId !== null && viewport.hasPointerCapture && viewport.hasPointerCapture(activePointerId)) {
        viewport.releasePointerCapture(activePointerId);
      }
      activePointerId = null;
      if (dragMoved) suppressClick = true;
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => {
        autoplay = true;
      }, 1000);
    };

    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointermove', onPointerMove);
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);
    viewport.addEventListener('pointerleave', () => {
      if (isDragging) endDrag();
    });
    viewport.addEventListener('dragstart', (event) => event.preventDefault());

    viewport.addEventListener('mouseenter', () => {
      if (!isDragging) autoplay = false;
    });
    viewport.addEventListener('mouseleave', () => {
      if (!isDragging) {
        window.clearTimeout(resumeTimer);
        autoplay = true;
      }
    });
  });
});
