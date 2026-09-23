document.addEventListener('DOMContentLoaded', () => {
  const roots = document.querySelectorAll('.blog-listing-grid[data-section-id]');

  const GRID_PATTERN = [
    { col: '1', aspect: '3 / 4' },
    { col: '2', aspect: '16 / 10' },
    { col: '1 / -1', aspect: '21 / 9' },
  ];

  roots.forEach((root) => {
    // The alternating layout is driven entirely by CSS nth-child rules.
    if (root.dataset.gridLayout === 'alternating') return;

    const items = Array.from(root.querySelectorAll('.blog-listing-grid-item'));
    if (!items.length) return;

    // Repeating three-up rhythm: tall, wide, full-bleed. A trailing post with
    // nothing to pair with takes the full-bleed slot rather than sitting in a
    // narrow column on its own.
    const total = items.length;
    items.forEach((item, index) => {
      const isUnpairedLast = index === total - 1 && index % 3 === 0;
      const patternIndex = isUnpairedLast ? 2 : index % 3;
      const { col, aspect } = GRID_PATTERN[patternIndex];
      item.style.setProperty('--grid-col', col);
      item.style.setProperty('--grid-aspect', aspect);
    });
  });
});
