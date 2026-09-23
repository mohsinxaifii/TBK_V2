document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.custom-bg-heading-container').forEach((section) => {
    // home-animations.js claims this section on the index page and runs a
    // richer ScrollTrigger reveal instead.
    if (section.dataset.haClaimed) return;
    const heading = section.querySelector('.custom-bg-heading');
    if (!heading || !window.initScrollReveal) return;

    window.initScrollReveal(heading, [heading], {
      from: { opacity: 0, y: -28 },
      to: { duration: 0.85 },
      threshold: 0.4,
    });
  });
});
