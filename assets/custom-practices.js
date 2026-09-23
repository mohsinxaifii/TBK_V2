document.addEventListener('DOMContentLoaded', () => {
  if (!window.initScrollReveal) return;

  document.querySelectorAll('.custom-practices').forEach((section) => {
    // site-animations.js claims this section and runs the richer
    // signature reveal instead.
    if (section.dataset.haClaimed) return;
    const heading = section.querySelector('.custom-practices-heading');
    const body = section.querySelector('.custom-practices-body');
    const image = section.querySelector('.custom-practices-image .custom-inset-image-img, .custom-practices-image .placeholder-svg');
    const rows = section.querySelectorAll('.custom-practices-row');

    const textEls = [heading, body].filter(Boolean);
    if (textEls.length) {
      window.initScrollReveal(textEls[0], textEls, { stagger: 0.12, threshold: 0.3 });
    }

    if (image) {
      window.initScrollReveal(image, [image], {
        from: { opacity: 0, y: -56, scale: 1.04 },
        to: { scale: 1, duration: 1.1 },
        threshold: 0.2,
      });
    }

    rows.forEach((row) => {
      window.initScrollReveal(row, [row], {
        from: { opacity: 0, y: -24 },
        to: { duration: 0.7 },
        threshold: 0.4,
      });
    });
  });
});
