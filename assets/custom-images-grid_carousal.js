document.addEventListener('DOMContentLoaded', () => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Matches the CSS breakpoint where the row turns into a swipeable strip.
  const stripQuery = window.matchMedia('(max-width: 768px)');
  const AUTOPLAY_INTERVAL = 5000;
  const SLIDE_DURATION = 600;
  const COPIES_PER_SIDE = 2;
  const supportsScrollEnd = 'onscrollend' in window;
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

  document.querySelectorAll('.custom-images-grid_carousal-container').forEach((container) => {
    // Queried before the loop clones exist, so only the originals are revealed.
    const images = container.querySelectorAll('img, video');

    // home-animations.js claims this section on the index page and runs a
    // richer ScrollTrigger reveal instead.
    if (!container.dataset.haClaimed && images.length && window.initScrollReveal) {
      window.initScrollReveal(container, images, {
        from: { opacity: 0, y: -32 },
        stagger: 0.1,
        threshold: 0.15,
      });
    }

    const originals = Array.from(container.querySelectorAll('.custom-images-grid_carousal-item'));
    if (originals.length < 2) return;

    // ---- Mobile infinite loop ----
    // Two copies of the set sit on either side of the originals. Once a
    // swipe or autoplay step has settled, the strip is shifted by exactly one
    // set width back onto the originals -- the content there is identical, so
    // the jump is invisible and there is always room to keep going either
    // way. The copies are display:none outside the strip breakpoint (CSS).
    const makeClone = (item) => {
      const clone = item.cloneNode(true);
      Array.from(clone.attributes).forEach((attr) => {
        if (attr.name.startsWith('data-shopify')) clone.removeAttribute(attr.name);
      });
      clone.classList.add('custom-images-grid_carousal-item--clone');
      clone.setAttribute('aria-hidden', 'true');
      if (clone.tagName === 'A') clone.setAttribute('tabindex', '-1');
      // The reveal scripts have already parked the originals' media at their
      // hidden start state (inline clip-path/opacity). Nothing animates the
      // copies in, so they mustn't inherit it.
      clone.querySelectorAll('img, video').forEach((media) => media.removeAttribute('style'));
      return clone;
    };

    const before = document.createDocumentFragment();
    const after = document.createDocumentFragment();
    for (let i = 0; i < COPIES_PER_SIDE; i += 1) {
      originals.forEach((item) => {
        before.appendChild(makeClone(item));
        after.appendChild(makeClone(item));
      });
    }
    const firstCopyAfter = after.firstElementChild;
    container.insertBefore(before, originals[0]);
    container.appendChild(after);
    const items = Array.from(container.querySelectorAll('.custom-images-grid_carousal-item'));

    const isStrip = () => stripQuery.matches && container.scrollWidth > container.clientWidth + 1;
    const itemLeft = (item) =>
      item.getBoundingClientRect().left - container.getBoundingClientRect().left + container.scrollLeft;

    const wrapToOriginals = () => {
      if (!isStrip()) return;
      const start = itemLeft(originals[0]);
      const setWidth = itemLeft(firstCopyAfter) - start;
      if (setWidth <= 0) return;
      let offset = (((container.scrollLeft - start) % setWidth) + setWidth) % setWidth;
      if (setWidth - offset < 2) offset = 0;
      const target = start + offset;
      if (Math.abs(target - container.scrollLeft) > 1) container.scrollLeft = target;
    };

    const jumpToOriginals = () => {
      if (isStrip()) container.scrollLeft = itemLeft(originals[0]);
    };
    jumpToOriginals();

    // Autoplay steps are animated frame by frame rather than with
    // scrollTo({ behavior: 'smooth' }): iOS fires scroll events too sparsely
    // during a native smooth scroll to tell reliably when it has finished,
    // and wrapping mid-flight would cut it short. Mandatory snapping would
    // also re-snap every frame of a manual animation, so it's switched off
    // for the slide and restored once the strip lands on the next item.
    let slideFrame = null;
    const stopSlide = () => {
      if (slideFrame) cancelAnimationFrame(slideFrame);
      slideFrame = null;
      container.style.scrollSnapType = '';
    };
    const slideTo = (target) => {
      stopSlide();
      const from = container.scrollLeft;
      const distance = target - from;
      const startTime = performance.now();
      container.style.scrollSnapType = 'none';
      const tick = (now) => {
        const progress = Math.min((now - startTime) / SLIDE_DURATION, 1);
        container.scrollLeft = from + distance * easeInOutCubic(progress);
        if (progress < 1) {
          slideFrame = requestAnimationFrame(tick);
        } else {
          slideFrame = null;
          container.style.scrollSnapType = '';
          wrapToOriginals();
        }
      };
      slideFrame = requestAnimationFrame(tick);
    };

    // Swipes are left to native scrolling and snapping; wrap once they've
    // come to rest (never mid-gesture, which would kill the momentum).
    let isTouching = false;
    let settleTimer = null;
    const onSettled = () => {
      if (slideFrame || isTouching) return;
      wrapToOriginals();
    };
    const scheduleSettle = () => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(onSettled, 200);
    };
    if (supportsScrollEnd) {
      container.addEventListener('scrollend', onSettled);
    } else {
      container.addEventListener('scroll', scheduleSettle, { passive: true });
    }

    // ---- Mobile autoplay ----
    let autoplayTimer = null;
    let resumeTimer = null;
    let isInView = false;
    let editorBlockSelected = false;

    const stepForward = () => {
      if (!isStrip() || isTouching) return;
      const current = container.scrollLeft;
      const next = items.find((item) => itemLeft(item) > current + 2);
      if (next) slideTo(itemLeft(next));
    };

    const stopAutoplay = () => {
      if (autoplayTimer) clearInterval(autoplayTimer);
      autoplayTimer = null;
    };
    const startAutoplay = () => {
      if (reduceMotion || !stripQuery.matches || !isInView || editorBlockSelected) return;
      stopAutoplay();
      autoplayTimer = setInterval(stepForward, AUTOPLAY_INTERVAL);
    };
    const pauseAutoplay = () => {
      stopAutoplay();
      if (resumeTimer) clearTimeout(resumeTimer);
    };
    const scheduleResume = (delay) => {
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(startAutoplay, delay);
    };

    // Only tick while the strip is on screen, so the first image gets its
    // full interval on first view -- same approach as the home testimonials.
    new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isInView = entry.intersectionRatio >= 0.5;
          if (isInView) startAutoplay();
          else stopAutoplay();
        });
      },
      { threshold: 0.5 }
    ).observe(container);

    stripQuery.addEventListener('change', () => {
      stopSlide();
      if (stripQuery.matches) {
        jumpToOriginals();
        startAutoplay();
      } else {
        pauseAutoplay();
      }
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(onSettled, 150);
    });

    // A swipe hands control to the visitor; the interval restarts from
    // scratch once they let go, so the next step never lands mid-gesture.
    container.addEventListener(
      'touchstart',
      () => {
        isTouching = true;
        stopSlide();
        pauseAutoplay();
      },
      { passive: true }
    );
    const endTouch = () => {
      isTouching = false;
      scheduleResume(1200);
      // A drag that stops dead fires no further scroll events to settle on.
      if (!supportsScrollEnd) scheduleSettle();
    };
    container.addEventListener('touchend', endTouch, { passive: true });
    container.addEventListener('touchcancel', endTouch, { passive: true });

    container.addEventListener('shopify:block:select', (event) => {
      const item = originals.find((el) => el === event.target);
      if (!item) return;
      editorBlockSelected = true;
      pauseAutoplay();
      stopSlide();
      if (isStrip()) container.scrollLeft = itemLeft(item);
    });
    container.addEventListener('shopify:block:deselect', () => {
      editorBlockSelected = false;
      startAutoplay();
    });
  });
});
