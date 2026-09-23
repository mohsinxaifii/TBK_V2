document.addEventListener('DOMContentLoaded', () => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || typeof window.Lenis === 'undefined') return;

  const lenis = new Lenis({
    duration: 1.1,
    easing: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    wheelMultiplier: 1,
    touchMultiplier: 1.1,
    // Drawers (the burger menu included), modals and other overlays keep
    // native scroll so their own internal scroll containers aren't hijacked
    // by the page-level smoothing -- or blocked while Lenis is stopped.
    prevent: (node) =>
      node.closest('[data-lenis-prevent], .drawer, .menu-drawer, .search-modal, [role="dialog"], dialog, .modal'),
  });

  window.lenis = lenis;

  // An overlay (the loading screen, typically) may have taken the shared
  // lock before Lenis existed to be stopped.
  if (window.scrollLock && window.scrollLock.isLocked()) lenis.stop();

  if (typeof window.gsap !== 'undefined') {
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  } else {
    requestAnimationFrame(function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    });
  }

  if (window.Shopify && Shopify.designMode) {
    document.addEventListener('shopify:section:load', () => lenis.resize());
    document.addEventListener('shopify:section:unload', () => lenis.resize());
  }
});
