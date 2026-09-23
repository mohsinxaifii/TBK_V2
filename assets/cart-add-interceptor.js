/*
 * Global add-to-cart guard.
 *
 * Every add-to-cart in this theme must go through AJAX and open the cart
 * drawer -- never a native form POST, which Shopify answers with a redirect to
 * /cart and drops the shopper out of whatever they were doing.
 *
 * Dawn routes add-to-cart through <product-form>, and that path already does
 * the right thing. But a plain {% form 'product' %} that is not wrapped in one
 * -- a custom section, a third-party snippet, an app block, anything added
 * later -- submits natively and redirects. This listens at the document so it
 * catches those without each template having to opt in.
 *
 * It deliberately stands aside when <product-form> owns the form AND has
 * actually upgraded. If the element is present but its script never ran, the
 * form would otherwise submit natively, so this takes it in that case too.
 */
(() => {
  const ADD_PATH = /\/cart\/add(\.js)?(\?|$)/;

  const drawer = () => document.querySelector('cart-drawer, mini-cart');

  const ownedByProductForm = (form) => {
    const host = form.closest('product-form');
    if (!host) return false;
    const ctor = customElements.get('product-form');
    // Present but not upgraded: its submit handler does not exist, so the
    // browser would post the form for real.
    return Boolean(ctor && host instanceof ctor);
  };

  const postsToCartAdd = (form) => {
    const action = form.getAttribute('action') || '';
    const method = (form.getAttribute('method') || 'get').toLowerCase();
    return method === 'post' && ADD_PATH.test(action);
  };

  const setBusy = (form, busy) => {
    const button = form.querySelector('[type="submit"], button[name="add"]');
    if (!button) return;
    button.classList.toggle('loading', busy);
    button.toggleAttribute('aria-busy', busy);
    const spinner = button.querySelector('.loading__spinner, .loading-overlay__spinner');
    if (spinner) spinner.classList.toggle('hidden', !busy);
  };

  const onSubmit = (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (!postsToCartAdd(form) || ownedByProductForm(form)) return;

    event.preventDefault();
    event.stopPropagation();

    const cart = drawer();
    const body = new FormData(form);
    // Ask for the cart sections in the same request, so the drawer and the
    // header count are current the moment it opens.
    if (cart && typeof cart.getSectionsToRender === 'function') {
      body.append('sections', cart.getSectionsToRender().map((section) => section.id));
      body.append('sections_url', window.location.pathname);
    }

    const addUrl = (window.theme && theme.routes && theme.routes.cart_add_url) || '/cart/add';
    setBusy(form, true);

    fetch(`${addUrl}.js`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body,
    })
      .then((response) => response.json())
      .then((parsed) => {
        if (parsed.status) {
          // Shopify reports sold out / unavailable here. Surfacing it in place
          // is the point: a redirect would lose it.
          console.warn('[cart] add rejected:', parsed.description || parsed.message);
          return;
        }
        if (cart && typeof cart.renderContents === 'function') {
          cart.renderContents(parsed);
        } else {
          document.dispatchEvent(new CustomEvent('cart:refresh', { detail: { open: true } }));
        }
        if (window.publish && window.PUB_SUB_EVENTS) {
          publish(PUB_SUB_EVENTS.cartUpdate, { source: 'cart-add-interceptor' });
        }
      })
      .catch((error) => {
        // Still no navigation: the shopper keeps their place and can retry.
        console.error('[cart] add failed:', error);
      })
      .finally(() => setBusy(form, false));
  };

  // Capture, so this runs before any handler that might let the default through.
  document.addEventListener('submit', onSubmit, true);
})();
