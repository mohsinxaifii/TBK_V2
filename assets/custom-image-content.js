// Crossfading carousel for the image + content section, built on the same
// shape as custom-blogs-carousel.js: slides are stacked absolutely and only
// their inner parts animate, so both slides can be on screen through the
// transition without either one moving the layout.
document.addEventListener('DOMContentLoaded', () => {
  const carousels = document.querySelectorAll('.custom-image-content-container[data-section-id]');

  carousels.forEach((root) => {
    const slides = Array.from(root.querySelectorAll('.custom-image-content-slide'));
    if (slides.length === 0) return;

    const viewport = root.querySelector('.custom-image-content-viewport');
    const prevButton = root.querySelector('.custom-image-content-nav-prev');
    const nextButton = root.querySelector('.custom-image-content-nav-next');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasGsap = typeof window.gsap !== 'undefined';
    // Matches the breakpoint where the section stops being an aspect-ratio
    // box and starts taking its height from the content.
    const mobileHeightQuery = window.matchMedia('(max-width: 989px)');

    let currentIndex = slides.findIndex((slide) => slide.classList.contains('is-active'));
    if (currentIndex === -1) currentIndex = 0;
    let isAnimating = false;

    // Below 990px every slide is still position:absolute (that is what makes
    // the crossfade possible), which leaves the viewport with no in-flow
    // child to take a height from. Briefly putting the active slide back in
    // flow reads its true height, which is then pinned on the viewport.
    const syncViewportHeight = (slide = slides[currentIndex]) => {
      if (!viewport || !slide) return;
      if (!mobileHeightQuery.matches) {
        viewport.style.height = '';
        return;
      }
      const prevPosition = slide.style.position;
      slide.style.position = 'static';
      const height = slide.scrollHeight;
      slide.style.position = prevPosition;
      viewport.style.height = `${height}px`;
    };

    const parts = (slide) => ({
      el: slide,
      image: slide.querySelector('.custom-image-content-image img'),
      header: slide.querySelector('.custom-image-content-inner-container > p'),
      heading: slide.querySelector('.custom-image-content-inner-container h3'),
      body: Array.from(slide.querySelectorAll('.custom-image-content-description p')),
    });

    const snapTo = (index) => {
      slides.forEach((slide, i) => slide.classList.toggle('is-active', i === index));
      syncViewportHeight(slides[index]);
    };

    const animateInstant = (outgoing, incoming) => {
      outgoing.el.classList.remove('is-active');
      incoming.el.classList.add('is-active');
      syncViewportHeight(incoming.el);
      isAnimating = false;
    };

    const animateWithGsap = (outgoing, incoming, direction) => {
      const xShift = direction === 'next' ? 28 : -28;

      incoming.el.classList.add('is-active');
      incoming.el.style.zIndex = 2;
      outgoing.el.style.zIndex = 1;
      syncViewportHeight(incoming.el);

      // Cleared again on complete: site-animations.js runs the section's
      // scroll-in reveal on the first slide's own parts, and leaving inline
      // values behind would fight it.
      gsap.set(incoming.image, { scale: 1.12, opacity: 0 });
      gsap.set(incoming.header, { opacity: 0, y: 16 });
      gsap.set(incoming.heading, { opacity: 0, y: 30, x: xShift });
      gsap.set(incoming.body, { opacity: 0, y: 16 });

      gsap.timeline({
        defaults: { ease: 'power3.out' },
        onComplete() {
          outgoing.el.classList.remove('is-active');
          outgoing.el.style.zIndex = '';
          incoming.el.style.zIndex = '';
          isAnimating = false;
        },
      })
        .to(outgoing.image, { scale: 1.08, opacity: 0, duration: 0.9, ease: 'power2.inOut' }, 0)
        .to(outgoing.header, { opacity: 0, y: -12, duration: 0.3 }, 0)
        .to(outgoing.heading, { opacity: 0, y: -22, duration: 0.45 }, 0.02)
        .to(outgoing.body, { opacity: 0, y: 12, duration: 0.3 }, 0.05)
        .to(incoming.image, { scale: 1, opacity: 1, duration: 1.1, ease: 'power2.out' }, 0.25)
        .to(incoming.header, { opacity: 1, y: 0, duration: 0.5 }, 0.4)
        .to(incoming.heading, { opacity: 1, y: 0, x: 0, duration: 0.8 }, 0.55)
        .to(incoming.body, { opacity: 1, y: 0, duration: 0.6, stagger: 0.08 }, 0.72);
    };

    const goTo = (index, direction) => {
      if (isAnimating || index === currentIndex) return;
      const outgoing = parts(slides[currentIndex]);
      const incoming = parts(slides[index]);

      isAnimating = true;
      currentIndex = index;

      if (hasGsap && !reduceMotion) {
        animateWithGsap(outgoing, incoming, direction);
      } else {
        animateInstant(outgoing, incoming);
      }
    };

    const next = () => goTo((currentIndex + 1) % slides.length, 'next');
    const prev = () => goTo((currentIndex - 1 + slides.length) % slides.length, 'prev');

    if (nextButton) nextButton.addEventListener('click', next);
    if (prevButton) prevButton.addEventListener('click', prev);

    if (slides.length > 1) {
      root.setAttribute('tabindex', '0');
      root.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight') next();
        if (event.key === 'ArrowLeft') prev();
      });

      let touchStartX = null;
      root.addEventListener(
        'touchstart',
        (event) => {
          touchStartX = event.touches[0].clientX;
        },
        { passive: true }
      );
      root.addEventListener(
        'touchend',
        (event) => {
          if (touchStartX === null) return;
          const delta = event.changedTouches[0].clientX - touchStartX;
          if (Math.abs(delta) > 40) {
            if (delta < 0) next();
            else prev();
          }
          touchStartX = null;
        },
        { passive: true }
      );
    }

    snapTo(currentIndex);

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => syncViewportHeight(), 150);
    });

    if (typeof mobileHeightQuery.addEventListener === 'function') {
      mobileHeightQuery.addEventListener('change', () => syncViewportHeight());
    } else if (typeof mobileHeightQuery.addListener === 'function') {
      // Safari < 14 fallback
      mobileHeightQuery.addListener(() => syncViewportHeight());
    }

    root.addEventListener('shopify:block:select', (event) => {
      const index = slides.indexOf(event.target);
      if (index === -1 || index === currentIndex) return;
      isAnimating = false;
      currentIndex = index;
      snapTo(index);
    });
  });
});
