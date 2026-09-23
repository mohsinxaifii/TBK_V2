document.addEventListener('DOMContentLoaded', () => {
  const hasGsap = typeof window.gsap !== 'undefined';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Native <details> has no transition of its own — toggling just snaps
  // open/closed, and the CSS icon rotation (driven by the [open] attribute)
  // has nothing to stay in sync with. Without GSAP (or under reduced
  // motion), leave the element to its native instant behavior — that's
  // still fully functional and accessible, just untransitioned.
  if (!hasGsap || reduceMotion) return;

  document.querySelectorAll('.policy-page__nav-mobile').forEach((details) => {
    const summary = details.querySelector('.policy-page__nav-mobile-summary');
    const list = details.querySelector('.policy-page__nav-mobile-list');
    const icon = details.querySelector('.policy-page__nav-mobile-icon');
    if (!summary || !list) return;

    // Marks this instance as JS-owned so the CSS fallback rotation rule
    // (`.policy-page__nav-mobile[open]:not(.policy-page__nav-mobile--js)`)
    // stops matching — otherwise it would flip the icon's transform via
    // its own CSS transition at the same time GSAP tweens it below.
    details.classList.add('policy-page__nav-mobile--js');

    let animating = false;
    gsap.set(list, { height: 0, overflow: 'hidden' });
    if (icon) gsap.set(icon, { rotate: 0 });

    const open = () => {
      animating = true;
      details.open = true;
      const targetHeight = list.scrollHeight;
      gsap.fromTo(
        list,
        { height: 0 },
        {
          height: targetHeight,
          duration: 0.35,
          ease: 'power2.out',
          onComplete: () => {
            // auto (not the measured px value) so content that reflows
            // later — a resize, a font swap — doesn't get clipped.
            gsap.set(list, { height: 'auto' });
            animating = false;
          },
        }
      );
      if (icon) gsap.to(icon, { rotate: 180, duration: 0.35, ease: 'power2.out' });
    };

    const close = () => {
      animating = true;
      gsap.to(list, {
        height: 0,
        duration: 0.3,
        ease: 'power2.inOut',
        onComplete: () => {
          // Flips the open attribute only once the list is already at
          // zero height, so the native display: none it triggers lands
          // on something already visually collapsed — no snap.
          details.open = false;
          animating = false;
        },
      });
      if (icon) gsap.to(icon, { rotate: 0, duration: 0.3, ease: 'power2.inOut' });
    };

    summary.addEventListener('click', (event) => {
      event.preventDefault();
      if (animating) return;
      if (details.open) close();
      else open();
    });

    window.addEventListener('resize', () => {
      if (details.open && !animating) gsap.set(list, { height: 'auto' });
    });
  });
});
