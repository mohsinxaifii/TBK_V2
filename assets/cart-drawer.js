class MiniCart extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    this.header = document.querySelector('sticky-header');
    this.drawer = document.querySelector('theme-cart-drawer');

    /*
      The source theme waited for an IntersectionObserver to fire before
      fetching the cart's markup. That never works here: the panel is
      position:fixed and translated fully off the right edge, so it does not
      intersect the viewport until it is already opening -- which meant the
      first open showed a spinner and then waited on a round trip before any
      cart appeared. Fetching it up front during idle time instead makes the
      first open as immediate as every one after it, and still keeps the
      request out of the way of the page's own load.
    */
    this.requestContents();
  }

  requestContents() {
    if (this.contentsRequested) return this.contentsPromise;
    this.contentsRequested = true;

    this.contentsPromise = fetch(this.dataset.url)
      .then((response) => response.text())
      .then((html) => {
        this.innerHTML = this.getSectionInnerHTML(html, '.shopify-section');
        document.dispatchEvent(new CustomEvent('cartdrawer:opened'));
      })
      .catch((e) => {
        // Let a later open try again rather than leaving the drawer empty.
        this.contentsRequested = false;
        console.error(e);
      });

    return this.contentsPromise;
  }

  open() {
    const detailsElement = this.drawer.querySelector('details');
    if (detailsElement.hasAttribute('open')) {
      return;
    }

    // If the idle fetch has not landed yet, the drawer still opens straight
    // away and fills in as soon as it does -- the spinner is the placeholder.
    this.requestContents();

    // Nothing has toggled <details> on this path -- there was no click on the
    // summary -- so `open` has to be set before the drawer is told to animate,
    // or `details[open] > .cart-drawer` never matches and the panel stays off
    // screen. On the click path the browser does this itself.
    detailsElement.setAttribute('open', '');
    this.drawer.openMenuDrawer();
  }

  renderContents(parsedState) {
    this.productId = parsedState.id;
    this.getSectionsToRender().forEach((section) => {
      const target = document.getElementById(section.id);
      const html = parsedState.sections?.[section.id];
      if (!target || !html) return;
      target.innerHTML = this.getSectionInnerHTML(html, section.selector);
    });

    // GoKwik's side-cart owns the add-to-cart drawer once it's active; opening
    // the native drawer too would stack both on top of each other.
    if (!window.kwikCartActive) {
      this.open();
    }
  }

  getSectionsToRender() {
    return [
      {
        id: 'mini-cart',
        section: 'mini-cart',
        selector: '.shopify-section'
      },
      {
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section'
      }
    ];
  }

  getSectionInnerHTML(html, selector = '.shopify-section') {
    return new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelector(selector).innerHTML;
  }

  setActiveElement(element) {
    this.activeElement = element;
  }
}

customElements.define('mini-cart', MiniCart);
