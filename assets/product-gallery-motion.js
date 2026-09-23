// Adds light GSAP polish to the mobile product gallery: an entrance for the
// overlay arrows/thumbnail rail, tactile press feedback on the arrows, and a
// pop on whichever thumbnail becomes active. Purely additive — media-gallery.js
// still owns slide/thumbnail state, this only reacts to it.
document.addEventListener('DOMContentLoaded', () => {
  const hasGsap = typeof window.gsap !== 'undefined';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const designMode = window.Shopify && window.Shopify.designMode;
  if (!hasGsap || reduceMotion || designMode) return;

  document.querySelectorAll('media-gallery').forEach((gallery) => {
    const viewer = gallery.querySelector('[id^="GalleryViewer-"]');
    const thumbnails = gallery.querySelector('[id^="GalleryThumbnails-"]');
    const sliderButtons = gallery.querySelector('.slider-buttons');
    const entranceTargets = [sliderButtons, thumbnails].filter(Boolean);

    if (entranceTargets.length) {
      gsap.set(entranceTargets, { opacity: 0, y: 12 });
      gsap.to(entranceTargets, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: 'power2.out',
        delay: 0.15,
        stagger: 0.08,
      });
    }

    if (sliderButtons) {
      sliderButtons.querySelectorAll('.slider-button').forEach((button) => {
        const press = () => {
          if (button.disabled) return;
          gsap.to(button, { scale: 0.86, duration: 0.15, ease: 'power2.out' });
        };
        const release = () => {
          gsap.to(button, { scale: 1, duration: 0.3, ease: 'back.out(2)' });
        };
        button.addEventListener('pointerdown', press);
        ['pointerup', 'pointerleave', 'pointercancel'].forEach((evt) => button.addEventListener(evt, release));
      });
    }

    if (viewer && thumbnails) {
      viewer.addEventListener('slideChanged', (event) => {
        const mediaId = event.detail && event.detail.currentElement && event.detail.currentElement.dataset.mediaId;
        if (!mediaId) return;
        const activeThumb = thumbnails.querySelector(`[data-target="${mediaId}"] .thumbnail`);
        if (!activeThumb) return;
        gsap.fromTo(activeThumb, { scale: 0.82 }, { scale: 1, duration: 0.45, ease: 'back.out(2.5)' });
      });
    }
  });
});
