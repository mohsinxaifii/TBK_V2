document.addEventListener('DOMContentLoaded', () => {
  const banners = document.querySelectorAll('.page-top-banner-container');
  if (!banners.length) return;

  const hasGsap = typeof window.gsap !== 'undefined';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const designMode = window.Shopify && window.Shopify.designMode;
  if (!hasGsap || reduceMotion || designMode) return;

  banners.forEach((banner) => {
    // site-animations.js claims this banner and runs the richer
    // signature reveal instead.
    if (banner.dataset.haClaimed) return;
    const inner = banner.querySelector('.page-top-banner-container-inner');
    if (!inner) return;

    const texts = inner.querySelectorAll('p');
    const rule = inner.querySelector('hr');

    gsap.set(texts, { opacity: 0, y: 16 });
    if (rule) gsap.set(rule, { scaleX: 0, transformOrigin: 'left center' });

    const tl = gsap.timeline({ delay: 0.1 });
    if (texts[0]) tl.to(texts[0], { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' });
    if (rule) tl.to(rule, { scaleX: 1, duration: 0.7, ease: 'power2.out' }, '-=0.45');
    if (texts[1]) tl.to(texts[1], { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, '-=0.5');
  });
});
