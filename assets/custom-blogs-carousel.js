document.addEventListener('DOMContentLoaded', () => {
  const carousels = document.querySelectorAll('.custom-blogs-carousel-container[data-section-id]');

  carousels.forEach((root) => {
    const slides = Array.from(root.querySelectorAll('.custom-blogs-carousel-slide'));
    if (slides.length === 0) return;

    const viewport = root.querySelector('.custom-blogs-carousel-viewport');
    const prevButton = root.querySelector('.custom-blogs-carousel-nav-prev');
    const nextButton = root.querySelector('.custom-blogs-carousel-nav-next');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasGsap = typeof window.gsap !== 'undefined';
    const mobileHeightQuery = window.matchMedia('(max-width: 749px)');

    let currentIndex = slides.findIndex((slide) => slide.classList.contains('is-active'));
    if (currentIndex === -1) currentIndex = 0;
    let isAnimating = false;

    // On mobile, slides stay position:absolute (so the crossfade still
    // works), but that means the viewport (height: auto, no in-flow
    // children) collapses to 0 — which in turn forces every slide's own
    // box to 0 via inset:0, squeezing their flex content before we ever
    // get to measure it. Briefly taking the slide out of absolute
    // positioning breaks that circular constraint so its true natural
    // height can be read, then position is restored before anything paints.
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
      image: slide.querySelector('.custom-blogs-carousel-image'),
      tags: Array.from(slide.querySelectorAll('.custom-blogs-carousel-tag')),
      meta: slide.querySelector('.custom-blogs-carousel-meta'),
      heading: slide.querySelector('.custom-blogs-carousel-heading'),
      description: slide.querySelector('.custom-blogs-carousel-description'),
      cta: slide.querySelector('.custom-blogs-carousel-cta'),
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

      gsap.set(incoming.image, { scale: 1.12, opacity: 0 });
      gsap.set(incoming.tags, { opacity: 0, y: 16 });
      gsap.set(incoming.meta, { opacity: 0, y: 12 });
      gsap.set(incoming.heading, { opacity: 0, y: 30, x: xShift });
      gsap.set(incoming.description, { opacity: 0, y: 16 });
      gsap.set(incoming.cta, { opacity: 0, y: 10 });

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
        .to(outgoing.tags, { opacity: 0, y: -14, duration: 0.35, stagger: 0.04 }, 0)
        .to(outgoing.meta, { opacity: 0, y: -10, duration: 0.3 }, 0)
        .to(outgoing.heading, { opacity: 0, y: -22, duration: 0.45 }, 0.02)
        .to(outgoing.description, { opacity: 0, y: 12, duration: 0.3 }, 0.05)
        .to(outgoing.cta, { opacity: 0, duration: 0.25 }, 0.05)
        .to(incoming.image, { scale: 1, opacity: 1, duration: 1.1, ease: 'power2.out' }, 0.25)
        .to(incoming.meta, { opacity: 1, y: 0, duration: 0.5 }, 0.4)
        .to(incoming.heading, { opacity: 1, y: 0, x: 0, duration: 0.8 }, 0.55)
        .to(incoming.tags[0] || [], { opacity: 1, y: 0, duration: 0.6 }, 0.55)
        .to(incoming.tags[1] || [], { opacity: 1, y: 0, duration: 0.6 }, 0.68)
        .to(incoming.tags[2] || [], { opacity: 1, y: 0, duration: 0.6 }, 0.81)
        .to(incoming.description, { opacity: 1, y: 0, duration: 0.6 }, 0.75)
        .to(incoming.cta, { opacity: 1, y: 0, duration: 0.5 }, 0.92);
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
