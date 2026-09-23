document.addEventListener('DOMContentLoaded', () => {
  const roots = document.querySelectorAll('.blog-listing-header[data-section-id]');

  roots.forEach((root) => {
    const link = root.querySelector('[data-read-more-link]');
    if (!link) return;

    // The header has no knowledge of the grid section's blog setting, so instead
    // of duplicating a blog picker here, we just walk forward through the
    // Shopify section wrappers that follow this one (each section renders inside
    // its own #shopify-section-* div, so the grid is never a direct sibling of
    // .blog-listing-header itself) until we find the blog-listing-grid and point
    // this link at its first post -- whatever blog/article that grid renders.
    let sectionWrapper = root.closest('[id^="shopify-section-"]') || root.parentElement;
    let grid = null;
    let sibling = sectionWrapper ? sectionWrapper.nextElementSibling : null;
    while (sibling) {
      grid = sibling.matches('.blog-listing-grid') ? sibling : sibling.querySelector('.blog-listing-grid');
      if (grid) break;
      sibling = sibling.nextElementSibling;
    }

    const firstPostLink = grid ? grid.querySelector('.blog-listing-grid-item-link[href]') : null;
    if (firstPostLink) {
      link.href = firstPostLink.getAttribute('href');
      link.hidden = false;
    } else {
      link.hidden = true;
    }
  });
});
