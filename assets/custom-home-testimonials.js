document.addEventListener('DOMContentLoaded', () => {
  const sections = document.querySelectorAll('.custom-home-testimonials-container[data-section-id]');

  sections.forEach((root) => {
    const viewport = root.querySelector('.custom-home-testimonials-viewport');
    const track = root.querySelector('.custom-home-testimonials-track');
    const carousel = root.querySelector('.custom-home-testimonials-carousel');
    const originalCards = Array.from(root.querySelectorAll('.custom-home-testimonials-card'));
    const prevButton = root.querySelector('.custom-home-testimonials-nav-prev');
    const nextButton = root.querySelector('.custom-home-testimonials-nav-next');
    if (!viewport || !track || originalCards.length === 0) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasGsap = typeof window.gsap !== 'undefined';
    const revealEnabled = root.dataset.animationsEnabled === 'true' && !reduceMotion && hasGsap;
    const autoScrollEnabled = root.dataset.autoplay === 'true' && !reduceMotion;
    const autoplayInterval = (parseFloat(root.dataset.autoplaySpeed) || 3) * 1000;

    const realCount = originalCards.length;
    // Reads --cards-per-view straight off the carousel instead of keeping a
    // second, hand-maintained copy of the CSS breakpoints in JS — those two
    // silently drifting apart (CSS showing one card count, JS assuming
    // another) is what caused cards to overlap/clip at various widths.
    const getCardsPerView = () => {
      if (!carousel) return 1;
      const raw = getComputedStyle(carousel).getPropertyValue('--cards-per-view');
      const value = parseFloat(raw);
      return Number.isFinite(value) && value > 0 ? value : 1;
    };

    const canLoop = realCount > getCardsPerView();

    // Extra copies so stepping can continue in either direction; once we've
    // drifted a full copy away from the middle we silently jump back one
    // copy-width — the content there is identical, so the wrap is invisible.
    const COPIES = 5;
    const START_COPY = 2;

    function initReveal() {
      gsap.set(originalCards, { opacity: 0, y: -60, scale: 0.94 });
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            gsap.to(originalCards, {
              opacity: 1,
              y: 0,
              scale: 1,
              duration: 0.9,
              ease: 'back.out(1.4)',
              stagger: 0.15,
            });
            observer.disconnect();
          });
        },
        // rootMargin fires this a bit before viewport actually enters the
        // screen, giving cards a head start over the blank-space flash.
        { threshold: 0.25, rootMargin: '0px 0px 200px 0px' }
      );
      observer.observe(viewport);
    }

    const updateNav = () => {
      const hide = !canLoop;
      if (prevButton) prevButton.style.display = hide ? 'none' : '';
      if (nextButton) nextButton.style.display = hide ? 'none' : '';
    };
    updateNav();

    if (!canLoop) {
      if (revealEnabled) initReveal();
      return;
    }

    if (canLoop) {
      for (let i = 1; i < COPIES; i += 1) {
        originalCards.forEach((card) => {
          const clone = card.cloneNode(true);
          Array.from(clone.attributes).forEach((attr) => {
            if (attr.name.startsWith('data-shopify')) clone.removeAttribute(attr.name);
          });
          track.appendChild(clone);
        });
      }
    }

    let setWidth = track.scrollWidth / COPIES;
    let cardStep = setWidth / realCount;
    viewport.scrollLeft = setWidth * START_COPY;

    let isDragging = false;
    let dragStartScrollLeft = 0;

    // iOS Safari fires `scroll` events sparsely/inconsistently during a
    // native scrollBy/scrollTo(behavior:'smooth') animation, so guessing
    // "animation done" from a settle timer (below) fires while WebKit's own
    // smooth-scroll is still mid-flight — it and correctBounds/snap then
    // fight over scrollLeft, seen as a jump/stutter on iOS only. Driving the
    // animation ourselves via rAF makes "done" exact instead of guessed.
    let scrollAnimationFrame = null;
    const stopScrollAnimation = () => {
      if (scrollAnimationFrame) cancelAnimationFrame(scrollAnimationFrame);
      scrollAnimationFrame = null;
    };
    const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
    const SCROLL_DURATION = 500;
    const animateScrollTo = (target, { duration = SCROLL_DURATION, onComplete } = {}) => {
      stopScrollAnimation();
      if (reduceMotion || duration <= 0) {
        viewport.scrollLeft = target;
        if (onComplete) onComplete();
        return;
      }
      const start = viewport.scrollLeft;
      const distance = target - start;
      const startTime = performance.now();
      const tick = (now) => {
        const progress = Math.min((now - startTime) / duration, 1);
        viewport.scrollLeft = start + distance * easeInOutQuad(progress);
        if (progress < 1) {
          scrollAnimationFrame = requestAnimationFrame(tick);
        } else {
          scrollAnimationFrame = null;
          if (onComplete) onComplete();
        }
      };
      scrollAnimationFrame = requestAnimationFrame(tick);
    };

    const correctBounds = () => {
      // Cancel first: a resize or drag can interrupt mid-animation, and a
      // stale rAF loop would otherwise keep overwriting scrollLeft next
      // frame with a target computed against pre-correction coordinates.
      stopScrollAnimation();
      if (viewport.scrollLeft >= setWidth * (COPIES - 2)) {
        viewport.scrollLeft -= setWidth;
        if (isDragging) dragStartScrollLeft -= setWidth;
      } else if (viewport.scrollLeft < setWidth) {
        viewport.scrollLeft += setWidth;
        if (isDragging) dragStartScrollLeft += setWidth;
      }
    };

    const stepForward = () => {
      animateScrollTo(viewport.scrollLeft + cardStep, { onComplete: correctBounds });
    };
    const stepBackward = () => {
      animateScrollTo(viewport.scrollLeft - cardStep, { onComplete: correctBounds });
    };

    // Free-form dragging/touch/wheel scrolling can come to rest mid-card;
    // snap onto the same card grid stepForward/stepBackward use so Next/Prev
    // stay in sync. Handled entirely in JS (no CSS scroll-snap) so there's
    // no race between a native snap correction and this smooth animation.
    const snapToNearestCard = (instant = false) => {
      const nearestIndex = Math.round(viewport.scrollLeft / cardStep);
      animateScrollTo(nearestIndex * cardStep, { duration: instant ? 0 : SCROLL_DURATION });
    };

    // Correct once scrolling has settled, so a native touch-momentum
    // animation never gets cut short mid-flight. Skipped while our own rAF
    // animation is running — that path already knows exactly when it ends
    // (see animateScrollTo's onComplete) and doesn't need a guess.
    let settleTimer = null;
    viewport.addEventListener('scroll', () => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        if (scrollAnimationFrame) return;
        correctBounds();
        if (!isDragging) snapToNearestCard();
      }, 120);
    });

    let autoplayTimer = null;
    let isInView = false;
    let editorBlockSelected = false;
    const stopAutoplay = () => {
      if (autoplayTimer) clearInterval(autoplayTimer);
      autoplayTimer = null;
    };
    const startAutoplay = () => {
      if (!autoScrollEnabled || !isInView || editorBlockSelected) return;
      stopAutoplay();
      autoplayTimer = setInterval(stepForward, autoplayInterval);
    };

    // Only tick while the carousel is on screen, so the first card gets its
    // full interval on first view instead of having already advanced while
    // the visitor was still further up the page. isInView also gates the
    // hover/drag resume timers, so they can't restart it off screen.
    if (autoScrollEnabled) {
      const autoplayObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            isInView = entry.intersectionRatio >= 0.5;
            if (isInView) startAutoplay();
            else stopAutoplay();
          });
        },
        { threshold: 0.5 }
      );
      autoplayObserver.observe(viewport);
    }

    let resumeTimer = null;
    const pauseAutoplay = () => {
      stopAutoplay();
      stopScrollAnimation();
      if (resumeTimer) clearTimeout(resumeTimer);
    };
    const scheduleResume = (delay = 2000) => {
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(startAutoplay, delay);
    };

    // Native touch scrolling already gives smooth momentum; only add custom
    // dragging for mouse/pen input, which has no built-in drag-to-scroll.
    let dragStartX = 0;

    viewport.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch') return;
      isDragging = true;
      pauseAutoplay();
      dragStartX = event.clientX;
      dragStartScrollLeft = viewport.scrollLeft;
      viewport.classList.add('is-dragging');
      viewport.setPointerCapture(event.pointerId);
    });

    viewport.addEventListener('pointermove', (event) => {
      if (!isDragging) return;
      viewport.scrollLeft = dragStartScrollLeft - (event.clientX - dragStartX);
    });

    const endDrag = () => {
      if (!isDragging) return;
      isDragging = false;
      viewport.classList.remove('is-dragging');
      clearTimeout(settleTimer);
      snapToNearestCard();
      scheduleResume();
    };
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);

    viewport.addEventListener('touchstart', pauseAutoplay, { passive: true });
    viewport.addEventListener('touchend', () => scheduleResume(1200), { passive: true });

    viewport.addEventListener('mouseenter', pauseAutoplay);
    viewport.addEventListener('mouseleave', () => {
      if (!isDragging) scheduleResume(500);
    });

    if (nextButton) {
      nextButton.addEventListener('click', () => {
        pauseAutoplay();
        stepForward();
        scheduleResume();
      });
    }
    if (prevButton) {
      prevButton.addEventListener('click', () => {
        pauseAutoplay();
        stepBackward();
        scheduleResume();
      });
    }

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        // scrollLeft is a raw pixel value from before the resize; card width
        // is a percentage, so it no longer lines up with a card boundary
        // under the new cardStep unless we explicitly re-snap it — without
        // this, every resize leaves the row visually offset, showing
        // overlapping/cut-off cards instead of a clean set of whole ones.
        setWidth = track.scrollWidth / COPIES;
        cardStep = setWidth / realCount;
        correctBounds();
        snapToNearestCard(true);
      }, 150);
    });

    if (revealEnabled) initReveal();

    root.addEventListener('shopify:block:select', (event) => {
      const index = originalCards.indexOf(event.target);
      if (index === -1) return;
      // The editor scrolls the block into view after selecting it, which
      // would otherwise let the visibility observer restart autoplay and
      // slide the selected card away.
      editorBlockSelected = true;
      pauseAutoplay();
      if (revealEnabled) gsap.set(originalCards, { opacity: 1, y: 0, scale: 1 });
      viewport.scrollLeft = setWidth * START_COPY + index * cardStep;
    });
    root.addEventListener('shopify:block:deselect', () => {
      editorBlockSelected = false;
      startAutoplay();
    });
  });
});
