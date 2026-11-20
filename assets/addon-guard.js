/*
 * Add-on guard: each add-on only exists in a cart alongside one of its anchor
 * products (snippets/addon-anchors.liquid) -- Gathri with Paraat Bhujia, Jhola
 * with Paraat Bhujia or Handmade Bhujia.
 *
 * - Adding an add-on while none of its anchors is in the cart is refused before the
 *   request reaches Shopify, and the shopper is told why.
 * - After any cart change, add-ons left without an anchor (the anchor was removed
 *   or set to zero) are removed too, and the drawer / cart page re-render. The cart
 *   drawer's suggestions then drop them as well, since they are only suggested
 *   while an anchor is in the cart (snippets/cart-recommendations.liquid).
 * - A page that loads with such a cart (e.g. after the cart page's full-page
 *   remove link) cleans it up straight away.
 *
 * Every cart write in the theme goes through fetch(), so wrapping fetch covers the
 * product form, the + buttons on suggestion cards, the drawer's quantity controls
 * and the cart page in one place. Config comes from layout/theme.liquid as
 * window.TBKAddons; the add-on handles live in snippets/addon-products.liquid.
 */
(() => {
  const config = window.TBKAddons;
  const rules = ((config && config.rules) || [])
    .map((rule) => ({
      title: rule.title,
      variantIds: new Set((rule.variantIds || []).map(String).filter(Boolean)),
      anchorIds: new Set((rule.anchorVariantIds || []).map(String).filter(Boolean)),
      anchorTitles: (rule.anchorTitles || []).filter(Boolean),
    }))
    .filter((rule) => rule.variantIds.size);
  if (!rules.length) return;

  const root = (window.theme && theme.routes && theme.routes.root_url) || '/';
  const base = root.endsWith('/') ? root : `${root}/`;

  const ruleFor = (variantId) => rules.find((rule) => rule.variantIds.has(String(variantId)));

  const listTitles = (titles) =>
    titles.length > 1 ? `${titles.slice(0, -1).join(', ')} or ${titles[titles.length - 1]}` : titles[0] || 'its pairing';

  const messageFor = (rule) =>
    `${rule.title} comes with ${listTitles(rule.anchorTitles)}. Add ${
      rule.anchorTitles.length > 1 ? 'one' : rule.anchorTitles[0]
    } to your cart first.`;

  const nativeFetch = window.fetch.bind(window);
  const ADD_PATH = /\/cart\/add(\.js)?$/;
  const WRITE_PATH = /\/cart\/(add|change|update|clear)(\.js)?$/;

  const pathOf = (input) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : (input && input.url) || '';
    try {
      return new URL(raw, window.location.href).pathname;
    } catch (e) {
      return '';
    }
  };

  /* Variant ids an add request is about to add, whatever shape its body takes. */
  const variantIdsIn = (body) => {
    const ids = [];
    const takeEntries = (entries) => {
      for (const [key, value] of entries) {
        if (key === 'id' || /^items\[\d+\]\[id\]$/.test(key)) ids.push(String(value));
      }
    };

    if (!body) return ids;
    if (body instanceof FormData || body instanceof URLSearchParams) {
      takeEntries(body.entries());
      return ids;
    }
    if (typeof body === 'string') {
      try {
        const parsed = JSON.parse(body);
        if (parsed.id) ids.push(String(parsed.id));
        (parsed.items || []).forEach((item) => item && item.id && ids.push(String(item.id)));
      } catch (e) {
        takeEntries(new URLSearchParams(body).entries());
      }
    }
    return ids;
  };

  const getCart = () =>
    nativeFetch(`${base}cart.js`, { headers: { Accept: 'application/json' } }).then((response) => response.json());

  /* Variant ids in the cart, plus any about to be added alongside in the same request. */
  const anchored = (rule, variantIds) => [...variantIds].some((id) => rule.anchorIds.has(String(id)));

  const orphanAddons = (cart) => {
    const inCart = cart.items.map((item) => item.variant_id);
    return cart.items.filter((item) => {
      const rule = ruleFor(item.variant_id);
      return rule && !anchored(rule, inCart);
    });
  };

  /* ---- Notice ---------------------------------------------------------------- */

  let toast;
  let toastTimer;
  const notify = (text) => {
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'addon-guard-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      Object.assign(toast.style, {
        position: 'fixed',
        left: '50%',
        bottom: '2.4rem',
        transform: 'translate(-50%, 1rem)',
        zIndex: '2147483000',
        maxWidth: 'calc(100vw - 3.2rem)',
        padding: '1.2rem 2rem',
        background: '#181818',
        color: '#fff',
        fontFamily: 'var(--font-family-body, sans-serif)',
        fontSize: '1.4rem',
        lineHeight: '1.4',
        textAlign: 'center',
        boxShadow: '0 6px 24px rgba(0, 0, 0, 0.25)',
        opacity: '0',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
        pointerEvents: 'none',
      });
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translate(-50%, 0)';
    });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translate(-50%, 1rem)';
    }, 3500);
  };

  /* ---- Cleanup --------------------------------------------------------------- */

  const isCartPage = () => document.body.classList.contains('template-cart') || /\/cart\/?$/.test(location.pathname);

  const refreshCartUI = () => {
    if (isCartPage()) {
      window.location.reload();
      return;
    }
    document.dispatchEvent(new CustomEvent('cart:refresh', { detail: { open: false } }));
    if (window.publish && window.PUB_SUB_EVENTS) {
      publish(PUB_SUB_EVENTS.cartUpdate, { source: 'addon-guard' });
    }
  };

  /* One cleanup at a time. A cart change that lands while one is running marks it
     dirty, so it runs again against the newer cart instead of trusting a stale read. */
  let cleaning = null;
  let dirty = false;

  const cleanOnce = async () => {
    const cart = await getCart();
    const orphans = orphanAddons(cart);
    if (!orphans.length) return false;

    const updates = {};
    orphans.forEach((line) => {
      updates[line.key] = 0;
    });
    await nativeFetch(`${base}cart/update.js`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ updates }),
    });
    return true;
  };

  const cleanup = () => {
    dirty = true;
    if (cleaning) return cleaning;
    cleaning = (async () => {
      let changed = false;
      try {
        while (dirty) {
          dirty = false;
          if (await cleanOnce()) changed = true;
        }
        if (changed) refreshCartUI();
      } catch (error) {
        console.error('[addon-guard] cleanup failed:', error);
      } finally {
        cleaning = null;
      }
    })();
    return cleaning;
  };

  /* ---- fetch wrapper ------------------------------------------------------- */

  window.fetch = async function guardedFetch(input, init) {
    const path = pathOf(input);
    if (!WRITE_PATH.test(path)) return nativeFetch(input, init);

    if (ADD_PATH.test(path)) {
      const ids = variantIdsIn(init && init.body);
      const addonRules = ids.map(ruleFor).filter(Boolean);

      if (addonRules.length) {
        let inCart = [];
        try {
          inCart = (await getCart()).items.map((item) => item.variant_id);
        } catch (e) {
          inCart = [];
        }
        const available = inCart.concat(ids);
        const blocked = addonRules.find((rule) => !anchored(rule, available));
        if (blocked) {
          const message = messageFor(blocked);
          notify(message);
          // Same shape Shopify uses for a refused add, so existing callers treat it
          // as an ordinary error rather than crashing on an unexpected body.
          return new Response(JSON.stringify({ status: 422, message: 'Cart Error', description: message }), {
            status: 422,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    }

    const response = await nativeFetch(input, init);
    if (response.ok) cleanup();
    return response;
  };

  if (config.cleanupOnLoad) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', cleanup, { once: true });
    } else {
      cleanup();
    }
  }
})();
