document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.custom-highlight-banner-container').forEach((section) => {
    // site-animations.js claims this section and runs the richer
    // signature reveal instead.
    if (section.dataset.haClaimed) return;
    const eyebrow = section.querySelector('.custom-highlight-banner-eyebrow');
    const heading = section.querySelector('.custom-highlight-banner-heading');
    const body = section.querySelector('.custom-highlight-banner-body');
    const elements = [eyebrow, heading, body].filter(Boolean);
    if (!elements.length || !window.initScrollReveal) return;

    window.initScrollReveal(elements[0], elements, {
      from: { opacity: 0, y: -36 },
      stagger: 0.12,
      threshold: 0.35,
    });
  });
});
