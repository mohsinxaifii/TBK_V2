document.addEventListener('DOMContentLoaded', () => {
  const heroes = document.querySelectorAll('.archive-article__hero');
  if (!heroes.length) return;

  const hasGsap = typeof window.gsap !== 'undefined';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const designMode = window.Shopify && window.Shopify.designMode;
  if (!hasGsap || reduceMotion || designMode) return;

  heroes.forEach((hero) => {
    const media = hero.querySelector('.archive-article__hero-media');
    const veil = hero.querySelector('.archive-article__hero-veil');
    const caption = hero.querySelector('.archive-article__hero-caption');
    // .archive-article__content is the sheet that scrolls up over the pinned hero.
    const content = hero.nextElementSibling;
    if (!media || !content) return;

    // Media zoom-while-covered is gated behind the entrance tween finishing so the
    // two never fight over the same `scale` property at the same time.
    let coverZoomReady = false;

    gsap.fromTo(
      media,
      { autoAlpha: 0, scale: 1.18 },
      {
        autoAlpha: 1,
        scale: 1,
        duration: 1.8,
        ease: 'power3.out',
        onComplete() {
          coverZoomReady = true;
        },
      }
    );

    // xPercent replaces the CSS "translateX(-50%) !important" centering so GSAP owns
    // the whole transform going forward instead of fighting a competing !important rule.
    // Entrance uses scale (not y), leaving y free for the scroll-driven drift below.
    if (caption) {
      gsap.set(caption, { xPercent: -50 });
      gsap.fromTo(
        caption,
        { autoAlpha: 0, scale: 0.94 },
        { autoAlpha: 1, scale: 1, duration: 1, ease: 'power3.out', delay: 0.6 }
      );
    }

    const setMediaScale = gsap.quickTo(media, 'scale', { duration: 0.5, ease: 'power2.out' });
    const setVeilOpacity = veil ? gsap.quickTo(veil, 'opacity', { duration: 0.4, ease: 'power2.out' }) : null;
    const setCaptionY = caption ? gsap.quickTo(caption, 'y', { duration: 0.4, ease: 'power2.out' }) : null;

    const updateCover = () => {
      const heroHeight = hero.getBoundingClientRect().height;
      if (heroHeight <= 0) return;

      // 0 = content sheet sits right at the hero's bottom edge (nothing covered yet).
      // 1 = content sheet has risen all the way to the top (hero fully covered).
      const contentTop = content.getBoundingClientRect().top;
      let progress = (heroHeight - contentTop) / heroHeight;
      progress = Math.max(0, Math.min(1, progress));

      if (coverZoomReady) setMediaScale(1 + progress * 0.14);
      if (setVeilOpacity) setVeilOpacity(progress * 0.6);
      if (setCaptionY) setCaptionY(progress * 36);
    };

    updateCover();

    if (window.lenis) {
      window.lenis.on('scroll', updateCover);
    } else {
      window.addEventListener('scroll', updateCover, { passive: true });
    }
    window.addEventListener('resize', updateCover);
  });
});
