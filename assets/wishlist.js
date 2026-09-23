const WISHLIST_STORAGE_KEY = 'wishlist';
const HEART_PATH_D =
  'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z';
const HEART_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-accordion icon-heart" viewBox="0 0 24 24">' +
  `<path class="icon-heart__outline" d="${HEART_PATH_D}"/>` +
  `<path class="icon-heart__fill" d="${HEART_PATH_D}"/>` +
  '</svg>';
const LOADING_SPINNER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" class="spinner" viewBox="0 0 66 66"><circle stroke-width="6" cx="33" cy="33" r="30" fill="none" class="path"/></svg>';

function getWishlist() {
  try {
    const stored = JSON.parse(localStorage.getItem(WISHLIST_STORAGE_KEY));
    return Array.isArray(stored) ? stored : [];
  } catch (error) {
    return [];
  }
}

function setWishlist(items) {
  localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(items));
}

function isWishlisted(productId) {
  return getWishlist().some((item) => item.id === productId);
}

function toggleWishlistItem(button) {
  const card = JSON.parse(button.dataset.card);
  const items = getWishlist();
  const index = items.findIndex((item) => item.id === card.id);

  if (index > -1) {
    items.splice(index, 1);
  } else {
    items.push(card);
  }

  setWishlist(items);
  return index === -1;
}

function setButtonState(button, wishlisted) {
  button.classList.toggle('is-wishlisted', wishlisted);
  button.setAttribute('aria-pressed', String(wishlisted));
  button.setAttribute('aria-label', wishlisted ? window.wishlistStrings.remove : window.wishlistStrings.add);
}

function bindSizeSelect(select) {
  select.addEventListener('change', () => {
    const form = select.closest('form');
    if (!form) return;

    const option = select.options[select.selectedIndex];
    const idInput = form.querySelector('.shop-card__variant-id');
    const priceEl = form.querySelector('.shop-card__price');

    if (idInput) idInput.value = option.value;
    if (priceEl && option.dataset.price) priceEl.textContent = option.dataset.price;
  });
}

function buildCardElement(item) {
  const currentVariant = item.variants.find((variant) => variant.id === item.currentVariantId) || item.variants[0];
  const available = currentVariant ? currentVariant.available : false;

  const li = document.createElement('li');
  li.className = 'grid__item';
  li.innerHTML = `
    <product-component class="shop-card-wrapper">
      <div class="shop-card">
        <a class="shop-card__media" tabindex="-1" aria-hidden="true">
          <img class="shop-card__image" loading="lazy" sizes="(min-width: 750px) 40vw, 90vw">
        </a>
        ${item.bestseller ? '<span class="shop-card__badge">Bestseller</span>' : ''}
        <button type="button" class="shop-card__wishlist is-wishlisted" aria-pressed="true">${HEART_ICON_SVG}</button>
        <div class="shop-card__footer">
          <h3 class="shop-card__title"><a class="shop-card__title-link"></a></h3>
          <product-form>
            <form class="shop-card__form" novalidate="novalidate" data-type="add-to-cart-form" action="/cart/add" method="post">
              <input type="hidden" name="id" class="shop-card__variant-id" value="${currentVariant ? currentVariant.id : ''}" ${available ? '' : 'disabled'}>
              <div class="shop-card__meta">
                <span class="shop-card__price">${currentVariant ? currentVariant.price : ''}</span>
                ${
                  item.variantsCount > 1
                    ? `<select class="shop-card__size-select" aria-label="${window.wishlistStrings.variantsLabel}"></select>`
                    : '<span class="shop-card__size"></span>'
                }
              </div>
              <hr class="shop-card__divider">
              <button type="submit" name="add" class="shop-card__add" data-sold-out-message="true" ${available ? '' : 'disabled'}>
                <span>${available ? 'Add To Cart' : window.wishlistStrings.soldOut}</span>
                <span class="sold-out-message hidden">${window.wishlistStrings.soldOut}</span>
                <div class="loading__spinner hidden">${LOADING_SPINNER_SVG}</div>
              </button>
            </form>
          </product-form>
        </div>
      </div>
    </product-component>
  `;

  const mediaLink = li.querySelector('.shop-card__media');
  mediaLink.href = item.url;

  const img = li.querySelector('.shop-card__image');
  img.src = item.image533 || item.imageFull || '';
  img.alt = item.imageAlt || '';
  if (item.imageWidth) img.width = item.imageWidth;
  if (item.imageHeight) img.height = item.imageHeight;
  img.srcset = [
    item.image360 && `${item.image360} 360w`,
    item.image533 && `${item.image533} 533w`,
    item.image720 && `${item.image720} 720w`,
    item.imageFull && item.imageWidth && `${item.imageFull} ${item.imageWidth}w`,
  ]
    .filter(Boolean)
    .join(', ');

  const titleLink = li.querySelector('.shop-card__title-link');
  titleLink.href = item.url;
  titleLink.textContent = item.title;

  const wishlistButton = li.querySelector('.shop-card__wishlist');
  wishlistButton.dataset.card = JSON.stringify(item);
  wishlistButton.setAttribute('aria-label', window.wishlistStrings.remove);

  if (item.variantsCount > 1) {
    const select = li.querySelector('.shop-card__size-select');
    item.variants.forEach((variant) => {
      const option = document.createElement('option');
      option.value = variant.id;
      option.textContent = variant.title;
      option.dataset.price = variant.price;
      if (variant.id === item.currentVariantId) option.selected = true;
      if (!variant.available) option.disabled = true;
      select.appendChild(option);
    });
    bindSizeSelect(select);
  } else if (currentVariant) {
    li.querySelector('.shop-card__size').textContent = currentVariant.title;
  }

  return li;
}

function renderWishlistPage() {
  const list = document.querySelector('[data-wishlist-page]');
  if (!list) return;

  const items = getWishlist();
  const emptyState = document.querySelector('[data-wishlist-empty]');
  const shopMoreLink = document.querySelector('[data-wishlist-shop-more]');

  list.innerHTML = '';

  if (items.length === 0) {
    list.hidden = true;
    if (emptyState) emptyState.hidden = false;
    if (shopMoreLink) shopMoreLink.hidden = true;
    return;
  }

  list.hidden = false;
  if (emptyState) emptyState.hidden = true;
  if (shopMoreLink) shopMoreLink.hidden = false;

  items.forEach((item) => {
    const li = buildCardElement(item);
    list.appendChild(li);
    bindWishlistButton(li.querySelector('.shop-card__wishlist'));
  });
}

function bindWishlistButton(button) {
  const card = JSON.parse(button.dataset.card);
  setButtonState(button, isWishlisted(card.id));

  button.addEventListener('click', () => {
    const wishlisted = toggleWishlistItem(button);
    setButtonState(button, wishlisted);

    if (button.closest('[data-wishlist-page]')) {
      renderWishlistPage();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.shop-card__wishlist').forEach(bindWishlistButton);
  renderWishlistPage();
});
