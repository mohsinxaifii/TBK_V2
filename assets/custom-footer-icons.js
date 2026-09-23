/*
 * Idle loop for the footer's three icons — same choreography as the
 * middle/side icons in the full-page preloader (custom-loading-screen.js),
 * minus the opening x-offset snap-in: these icons never leave their resting
 * position, they only rotate in place.
 */
document.addEventListener('DOMContentLoaded', () => {
  const icons = document.querySelector('.custom-footer__icons');
  if (!icons) return;

  const iconOne = icons.querySelector('.custom-footer__icon--one');
  const iconTwo = icons.querySelector('.custom-footer__icon--two');
  const iconThree = icons.querySelector('.custom-footer__icon--three');
  if (!iconOne || !iconTwo || !iconThree) return;

  const hasGsap = typeof window.gsap !== 'undefined';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!hasGsap || reduceMotion) return;

  // Middle icon: constant, uninterrupted spin in place.
  const spinTl = gsap.to(iconTwo, {
    rotation: '+=360',
    duration: 2.4,
    ease: 'none',
    repeat: -1,
    paused: true,
  });

  // Left/right icons: call-and-response rotation, strictly sequential,
  // never translating — same angles/timing as the loader's side icons.
  const SIDE_ANGLE = 18;
  const sideTl = gsap.timeline({ repeat: -1, repeatDelay: 0.12, paused: true });
  sideTl
    .to(iconOne, { rotation: SIDE_ANGLE, duration: 0.24, ease: 'back.out(2)' }, 0)
    .to(iconThree, { rotation: -SIDE_ANGLE, duration: 0.24, ease: 'back.out(2)' }, '+=0.12')
    .to(iconOne, { rotation: 0, duration: 0.24, ease: 'back.out(2)' }, '+=0.12')
    .to(iconThree, { rotation: 0, duration: 0.24, ease: 'back.out(2)' }, '+=0.12');

  // Only spend cycles animating while the footer is actually on screen.
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          spinTl.play();
          sideTl.play();
        } else {
          spinTl.pause();
          sideTl.pause();
        }
      });
    },
    { threshold: 0.1 }
  );
  observer.observe(icons);
});
