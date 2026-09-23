document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.custom-inset-image-section').forEach((section) => {
    // site-animations.js claims this section and runs the richer
    // signature reveal instead.
    if (section.dataset.haClaimed) return;
    const image = section.querySelector('.custom-inset-image-img, .placeholder-svg');
    if (!image || !window.initScrollReveal) return;

    window.initScrollReveal(image, [image], {
      from: { opacity: 0, y: -56, scale: 1.04 },
      to: { scale: 1, duration: 1.1 },
      threshold: 0.2,
    });
  });
});
