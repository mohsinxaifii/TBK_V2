/*
 * Behaviour for the minimal "shop" product card.
 *
 * Everything here is delegated from `document` rather than bound to each card
 * on DOMContentLoaded. The collection page and search results re-render through
 * facets.js, which replaces #ProductGridContainer.innerHTML wholesale on every
 * filter or sort — any listener bound directly to a card is thrown away with
 * the old markup. Delegation survives that, and needs no re-init hook.
 *
 * (The size-select binding below used to be a DOMContentLoaded loop, so the
 * price stopped following the size picker after the first filter change.)
 */
(() => {
  const TRACK = '[data-shop-card-track]';

  function slide(button) {
    const wrap = button.closest('.shop-card__media-wrap');
    const track = wrap && wrap.querySelector(TRACK);
    if (!track) return;

    const count = track.querySelectorAll('.shop-card__image').length;
    if (count < 2) return;

    const step = Number(button.dataset.shopCardNav) || 1;
    const current = Number(track.style.getPropertyValue('--shop-card-index')) || 0;
    // Wraps in both directions, so neither arrow is ever a dead end.
    const next = (((current + step) % count) + count) % count;

    track.style.setProperty('--shop-card-index', next);
  }

  function syncVariant(select) {
    const form = select.closest('form');
    if (!form) return;

    const option = select.options[select.selectedIndex];
    const idInput = form.querySelector('.shop-card__variant-id');
    const priceEl = form.querySelector('.shop-card__price');

    if (idInput) idInput.value = option.value;
    if (priceEl && option.dataset.price) priceEl.textContent = option.dataset.price;
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-shop-card-nav]');
    if (!button) return;

    // These cards sit inside a scroll-snap slider on the featured-collection
    // section, so the click must not bubble out and move that too.
    event.preventDefault();
    event.stopPropagation();
    slide(button);
  });

  document.addEventListener('change', (event) => {
    const select = event.target.closest('.shop-card__size-select');
    if (select) syncVariant(select);
  });
})();
