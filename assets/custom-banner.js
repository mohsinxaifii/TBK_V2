document.addEventListener('DOMContentLoaded', () => {
  if (typeof gsap === 'undefined') return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const designMode = window.Shopify && window.Shopify.designMode;
  if (reduceMotion || designMode) return;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const desktopQuery = window.matchMedia('(min-width: 750px)');
  const PIN_DISTANCE_RATIO = 0.6; // extra scroll, relative to viewport height, the banner stays pinned for

  document.querySelectorAll('[data-custom-banner-pin]').forEach((pinSpace) => {
    const sticky = pinSpace.querySelector('[data-custom-banner-sticky]');
    if (!sticky) return;

    if (pinSpace.hasAttribute('data-custom-banner-no-parallax')) return;

    const media = pinSpace.querySelectorAll(
      '.custom-banner_desktop-image, .custom-banner_desktop-video, .custom-banner_mobile-image, .custom-banner_mobile-video'
    );
    const sectionWrapper = pinSpace.closest('.shopify-section');
    const nextSection = sectionWrapper ? sectionWrapper.nextElementSibling : null;

    if (nextSection) nextSection.classList.add('custom-banner-cover-section');

    let pinDistance = 0;

    // The pin/cover distances depend on the media's real rendered (uncropped) height,
    // which isn't known until layout — and for <img> without width/height attributes,
    // not until it's actually loaded. Recomputed on load, resize, and initial render.
    const layout = () => {
      if (!desktopQuery.matches) {
        pinSpace.style.height = '';
        if (nextSection) nextSection.style.marginTop = '';
        return;
      }

      const stickyHeight = sticky.getBoundingClientRect().height;
      pinDistance = window.innerHeight * PIN_DISTANCE_RATIO;
      pinSpace.style.height = `${stickyHeight + pinDistance}px`;
      if (nextSection) nextSection.style.marginTop = `-${stickyHeight}px`;
    };

    const reset = () => {
      gsap.set(media, { clearProps: 'scale,filter' });
      if (nextSection) gsap.set(nextSection, { clearProps: 'y' });
    };

    const update = () => {
      if (!desktopQuery.matches) {
        reset();
        return;
      }

      const pinRect = pinSpace.getBoundingClientRect();
      const pinProgress = pinDistance > 0 ? clamp(-pinRect.top / pinDistance, 0, 1) : 0;

      gsap.set(media, {
        scale: 1 + pinProgress * 0.12,
        filter: `brightness(${1 - pinProgress * 0.45})`,
      });

      if (nextSection) {
        const vh = window.innerHeight;
        const nextRect = nextSection.getBoundingClientRect();
        const revealProgress = clamp(1 - nextRect.top / vh, 0, 1);
        gsap.set(nextSection, {
          y: (1 - revealProgress) * 100,
        });
      }
    };

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    };

    const onResize = () => {
      layout();
      update();
    };

    media.forEach((el) => {
      if (el.tagName === 'IMG' && !el.complete) {
        el.addEventListener('load', onResize, { once: true });
      } else if (el.tagName === 'VIDEO') {
        el.addEventListener('loadedmetadata', onResize, { once: true });
      }
    });

    layout();
    update();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
  });
});
