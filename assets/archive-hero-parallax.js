document.addEventListener('DOMContentLoaded', () => {
  const heroes = document.querySelectorAll('.archive-article__hero');
  if (!heroes.length) return;

  const hasGsap = typeof window.gsap !== 'undefined';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const designMode = window.Shopify && window.Shopify.designMode;
  if (!hasGsap || reduceMotion || designMode) return;

  heroes.forEach((hero) => {
    const media = hero.querySelector('.archive-article__hero-media');
    const caption = hero.querySelector('.archive-article__hero-caption');
    if (!media) return;

    gsap.fromTo(
      media,
      { autoAlpha: 0, scale: 1.18 },
      { autoAlpha: 1, scale: 1, duration: 1.8, ease: 'power3.out' }
    );

    // xPercent replaces the CSS "translateX(-50%) !important" centering so GSAP owns
    // the whole transform instead of fighting a competing !important rule.
    if (caption) {
      gsap.set(caption, { xPercent: -50 });
      gsap.fromTo(
        caption,
        { autoAlpha: 0, scale: 0.94 },
        { autoAlpha: 1, scale: 1, duration: 1, ease: 'power3.out', delay: 0.6 }
      );
    }
  });
});
