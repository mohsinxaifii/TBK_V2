// Shared scroll-reveal helper used by the story/about sections. Kept off
// permanently in the theme editor so merchants always see full content while
// customizing, matching how the theme's own animations.js treats design mode.
window.initScrollReveal = function initScrollReveal(root, elements, options = {}) {
  if (!root || !elements || elements.length === 0) return;

  const hasGsap = typeof window.gsap !== 'undefined';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const designMode = window.Shopify && window.Shopify.designMode;
  if (!hasGsap || reduceMotion || designMode) return;

  const { from = { opacity: 0, y: -40 }, to = {}, stagger = 0, threshold = 0.2 } = options;

  gsap.set(elements, from);

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        gsap.to(elements, {
          opacity: 1,
          y: 0,
          duration: 0.9,
          ease: 'power3.out',
          stagger,
          ...to,
        });
        obs.disconnect();
      });
    },
    // rootMargin fires the reveal a bit before root actually enters the
    // viewport, so the observer isn't the last thing standing between a
    // lazy-loaded image and a blank flash while the user is still scrolling.
    { threshold, rootMargin: '0px 0px 200px 0px' }
  );
  observer.observe(root);
};
