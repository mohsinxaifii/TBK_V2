/*
 * Full-page preloader. Runs immediately, not on DOMContentLoaded — this
 * script is loaded with `defer`, which already guarantees the DOM (including
 * the overlay markup below) is fully parsed by the time it executes.
 * Waiting for the DOMContentLoaded event on top of that meant waiting for
 * every OTHER deferred script on the page to finish first too, which was
 * the actual cause of the animation's slow start.
 *
 * Icon motion is kept collision-safe by construction: side icons rest only
 * 15px apart, so every bounce/overshoot amount below is sized against its
 * own travel distance to stay well inside that margin — none of it can
 * swing an icon into its neighbor.
 *
 * Sequence:
 *   1. Opening — left/right icons start held apart at a distance and snap
 *      inward to their resting position with a bouncy overshoot, twisting
 *      back to 0 rotation as they land.
 *   2. Loop, while the page is still loading:
 *      - Middle icon advances in one direction in quick bouncy snapped
 *        increments (never a smooth/linear spin) — always progressing the
 *        same way overall.
 *      - Left/right icons take turns, strictly one at a time: left out and
 *        holds, right out and holds, left back and holds, right back and
 *        holds, repeat.
 * Once the page has actually finished loading (plus a brief minimum so a
 * fast/cached load doesn't just flash the loader for a frame), both loops
 * are killed and the red layer + icons fade out together.
 *
 * It plays once per browsing session. The skip decision itself is made by a
 * small inline script in the <head> so repeat loads never flash the red
 * cover during the frames it takes this deferred script to run; the check
 * here is the same test, for the case where that class is already set.
 */
(() => {
  const bg = document.getElementById('custom-loading-screen-bg');
  const iconsLayer = document.getElementById('custom-loading-screen-icons');
  if (!bg || !iconsLayer) return;

  const iconOne = iconsLayer.querySelector('.custom-loading-screen__icon--one');
  const iconTwo = iconsLayer.querySelector('.custom-loading-screen__icon--two');
  const iconThree = iconsLayer.querySelector('.custom-loading-screen__icon--three');
  if (!iconOne || !iconTwo || !iconThree) {
    bg.remove();
    iconsLayer.remove();
    return;
  }

  // The editor reloads this layout on every page/template switch inside its
  // iframe — a blocking cover would fight merchants on every click.
  if (window.Shopify && window.Shopify.designMode) {
    bg.remove();
    iconsLayer.remove();
    return;
  }

  // Already played this session (the <head> script hid the cover before
  // paint), so there is nothing to animate — just drop the markup.
  if (document.documentElement.classList.contains('custom-loading-screen-skip')) {
    bg.remove();
    iconsLayer.remove();
    return;
  }

  // Claim the session slot up front rather than on reveal: someone who
  // navigates away mid-animation has still seen it once.
  try {
    sessionStorage.setItem('tbk-loading-screen-shown', '1');
  } catch (e) {
    // Private mode or blocked storage — the loader just plays every load.
  }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    document.documentElement.classList.remove('custom-loading-screen-lock');
    if (window.lenis && window.lenis.start) window.lenis.start();
    bg.remove();
    iconsLayer.remove();
  };

  document.documentElement.classList.add('custom-loading-screen-lock');
  if (window.lenis && window.lenis.stop) window.lenis.stop();

  // Last-resort insurance: whatever else goes wrong, the site must never
  // stay covered forever.
  setTimeout(finish, 5000);

  let pageLoaded = document.readyState === 'complete';
  const onLoaded = (cb) => {
    if (pageLoaded) {
      cb();
      return;
    }
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(safety);
      pageLoaded = true;
      cb();
    };
    window.addEventListener('load', settle, { once: true });
    // `load` waits on every image on the page, including ones far below the
    // fold, which on image-heavy templates was the bulk of the wait. Cap it:
    // the DOM and stylesheets are already there by the time this runs, so
    // falling through early costs nothing visible.
    const safety = setTimeout(settle, 1600);
  };

  const hasGsap = typeof window.gsap !== 'undefined';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!hasGsap || reduceMotion) {
    onLoaded(() => {
      bg.style.transition = 'opacity 0.35s ease';
      iconsLayer.style.transition = 'opacity 0.35s ease';
      bg.style.opacity = '0';
      iconsLayer.style.opacity = '0';
      bg.addEventListener('transitionend', finish, { once: true });
    });
    return;
  }

  const icons = [iconOne, iconTwo, iconThree];

  // 1 — Opening: held apart at a distance small enough that even the
  // bounce's overshoot can't cross the resting 15px gap, then snapped in.
  const OPEN_DISTANCE = 72;
  gsap.set(iconOne, { x: -OPEN_DISTANCE, rotation: -30, autoAlpha: 1 });
  gsap.set(iconThree, { x: OPEN_DISTANCE, rotation: 30, autoAlpha: 1 });
  gsap.set(iconTwo, { rotation: 0, autoAlpha: 1 });

  const OPENING_DURATION = 0.4;
  gsap.to([iconOne, iconThree], { x: 0, rotation: 0, duration: OPENING_DURATION, ease: 'back.out(1.4)' });

  // 2a — Middle icon: advances in one direction, always, in quick bouncy
  // snapped increments — that anticipation-then-overshoot ease briefly
  // rotates it backward before each forward snap, which broke "constantly
  // rotating" and read as janky rather than bouncy. A plain fast, linear,
  // uninterrupted spin actually suits it better anyway.
  const spinTl = gsap.to(iconTwo, { rotation: '+=360', duration: 2.4, ease: 'none', repeat: -1 });

  // 2b — Left/right icons: call-and-response, strictly sequential — never
  // both moving at once. Starts right as the opening move ends, so its
  // rotation tween never overlaps the opening tween on the same property.
  const SIDE_ANGLE = 18;
  const sideTl = gsap.timeline({ repeat: -1, repeatDelay: 0.12, delay: OPENING_DURATION });
  sideTl
    .to(iconOne, { rotation: SIDE_ANGLE, duration: 0.24, ease: 'back.out(2)' }, 0)
    .to(iconThree, { rotation: -SIDE_ANGLE, duration: 0.24, ease: 'back.out(2)' }, '+=0.12')
    .to(iconOne, { rotation: 0, duration: 0.24, ease: 'back.out(2)' }, '+=0.12')
    .to(iconThree, { rotation: 0, duration: 0.24, ease: 'back.out(2)' }, '+=0.12');

  // Brief minimum so a fast/cached load can't cut the loader off after a
  // single frame.
  let minTimeElapsed = false;
  let loadConfirmed = false;
  const tryReveal = () => {
    if (minTimeElapsed && loadConfirmed) reveal();
  };

  setTimeout(() => {
    minTimeElapsed = true;
    tryReveal();
  }, 450);

  onLoaded(() => {
    loadConfirmed = true;
    tryReveal();
  });

  function reveal() {
    spinTl.kill();
    sideTl.kill();

    // Interactive as soon as the reveal begins, not only once it completes.
    bg.style.pointerEvents = 'none';

    // No mask, no scale — the red layer and the icons just fade out together.
    gsap.to([bg, ...icons], { autoAlpha: 0, duration: 0.4, ease: 'power2.in', onComplete: finish });
  }
})();
