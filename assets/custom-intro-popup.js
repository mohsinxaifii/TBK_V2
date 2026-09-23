/*
 * First-visit introduction popup.
 *
 * Timing: the delay is counted from when the preloader finishes, not from page
 * load. Counting from load would spend most of the wait behind the red cover
 * (which sits at z-index 99999, above this) and the popup would be revealed
 * already open the instant the loader lifted. Waiting for the loader to leave
 * the DOM first means the visitor always gets the full delay on a page they
 * can actually see.
 *
 * Frequency: the "seen" flag is claimed when the popup opens, not when it is
 * dismissed — someone who opens it and navigates away has still seen it, and
 * should not meet it again on the next page.
 *
 * Note that each overlay is re-parented to <body> on init (see the stylesheet
 * header for why), so it is no longer inside its own section element. Every
 * theme-editor hook below therefore looks the overlay up by id rather than by
 * searching the section subtree, and the unload hook has to clean it up by
 * hand since removing the section no longer removes the overlay with it.
 */
(() => {
  const STORAGE_KEY = 'tbk-intro-popup-seen';
  const ID_PREFIX = 'CustomIntroPopup-';

  // overflow:hidden alone does not reliably block touch-drag scrolling on
  // mobile (iOS Safari can still rubber-band the page underneath). Pinning the
  // body to position:fixed removes it from scrolling entirely; the offset is
  // preserved as a negative top so the page doesn't jump, and restored on
  // unlock. Same approach as the fullscreen search modal.
  let scrollY = 0;

  function lockScroll() {
    scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    window.scrollLock.lock('intro-popup');
  }

  function unlockScroll() {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    window.scrollTo(0, scrollY);
    window.scrollLock.unlock('intro-popup');
  }

  function storageFor(frequency) {
    try {
      return frequency === 'session' ? window.sessionStorage : window.localStorage;
    } catch (e) {
      // Private mode or blocked storage.
      return null;
    }
  }

  function hasSeen(frequency) {
    const store = storageFor(frequency);
    if (!store) return false;
    try {
      return store.getItem(STORAGE_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function markSeen(frequency) {
    const store = storageFor(frequency);
    if (!store) return;
    try {
      store.setItem(STORAGE_KEY, '1');
    } catch (e) {
      // Quota or blocked storage — the popup just shows again next time.
    }
  }

  // The loader removes its own two layers from the DOM when it finishes, and
  // has a 5s hard cap of its own, so the fallback here only has to outlast it.
  function whenLoaderDone(callback) {
    const cover = document.getElementById('custom-loading-screen-bg');
    if (!cover || !cover.isConnected) {
      callback();
      return;
    }

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(fallback);
      callback();
    };

    const observer = new MutationObserver(() => {
      if (!cover.isConnected) settle();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const fallback = setTimeout(settle, 6000);
  }

  function init(root) {
    if (root.dataset.introPopupReady === 'true') return;
    root.dataset.introPopupReady = 'true';

    const dialog = root.querySelector('.custom-intro-popup__dialog');
    const closeButton = root.querySelector('[data-custom-intro-popup-close]');
    if (!dialog || !closeButton) return;

    // A theme-editor re-render hands us a fresh copy while the previous one is
    // still parked on <body>, orphaned from the section that owned it. Tear the
    // old one down properly rather than just removing it: its pending open timer
    // would otherwise still fire and lock the page's scroll on behalf of an
    // overlay that is no longer in the document.
    document.querySelectorAll(`body > #${CSS.escape(root.id)}`).forEach((stale) => {
      if (stale === root) return;
      if (stale.introPopup) stale.introPopup.destroy();
      else stale.remove();
    });

    // See the note at the top of the stylesheet: a transformed ancestor would
    // break position:fixed, so the overlay lives directly on <body>.
    if (root.parentElement !== document.body) document.body.appendChild(root);

    const designMode = Boolean(window.Shopify && window.Shopify.designMode);
    const frequency = root.dataset.frequency === 'session' ? 'session' : 'once';
    const delay = (parseFloat(root.dataset.delay) || 0) * 1000;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let isOpen = false;
    let lastFocused = null;
    let openTimer = null;

    function focusables() {
      return Array.from(dialog.querySelectorAll('a[href], button:not([disabled])')).filter(
        (el) => el.getClientRects().length > 0
      );
    }

    function onKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== 'Tab') return;

      // Keep focus inside the dialog while it is modal.
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function open() {
      if (isOpen) return;
      isOpen = true;

      // Claimed up front: opening is what counts as having seen it. Never
      // persisted in the theme editor, so merchants keep getting it on reload.
      if (!designMode) markSeen(frequency);

      lastFocused = document.activeElement;
      root.hidden = false;
      lockScroll();
      document.addEventListener('keydown', onKeydown);
      closeButton.focus({ preventScroll: true });

      if (typeof window.gsap === 'undefined' || reduceMotion) return;

      gsap.fromTo(root, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35, ease: 'power2.out' });
      gsap.fromTo(
        dialog,
        { autoAlpha: 0, y: 24, scale: 0.97 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.55, ease: 'power3.out', delay: 0.05 }
      );
    }

    // Everything that has to come undone whether the popup is being dismissed
    // or simply left behind by a CTA navigation.
    function release() {
      isOpen = false;
      unlockScroll();
      document.removeEventListener('keydown', onKeydown);
    }

    function close() {
      if (!isOpen) return;
      release();

      const finish = () => {
        root.hidden = true;
        if (lastFocused && typeof lastFocused.focus === 'function') {
          lastFocused.focus({ preventScroll: true });
        }
      };

      if (typeof window.gsap === 'undefined' || reduceMotion) {
        finish();
        return;
      }

      gsap.to(dialog, { autoAlpha: 0, y: 16, scale: 0.98, duration: 0.25, ease: 'power2.in' });
      gsap.to(root, {
        autoAlpha: 0,
        duration: 0.3,
        ease: 'power2.in',
        delay: 0.05,
        onComplete: () => {
          finish();
          // Clear what GSAP left inline, so reopening from the theme editor
          // doesn't start out invisible.
          gsap.set([root, dialog], { clearProps: 'opacity,visibility,transform' });
        },
      });
    }

    closeButton.addEventListener('click', close);

    // Clicking the blurred backdrop dismisses; clicks inside the dialog don't.
    root.addEventListener('click', (event) => {
      if (event.target === root) close();
    });

    // Following a CTA leaves the page anyway, so the popup stays on screen
    // through the navigation rather than flashing away — but the scroll lock
    // has to come off, or a back-navigation restoring this page from bfcache
    // would find the body still pinned.
    dialog.querySelectorAll('.custom-intro-popup__cta').forEach((cta) => {
      cta.addEventListener('click', () => {
        if (isOpen) release();
      });
    });

    root.introPopup = {
      open,
      destroy() {
        clearTimeout(openTimer);
        if (isOpen) release();
        root.remove();
      },
    };

    if (!designMode && hasSeen(frequency)) return;

    whenLoaderDone(() => {
      openTimer = setTimeout(open, delay);
    });
  }

  function initAll(scope) {
    (scope || document).querySelectorAll('[data-custom-intro-popup]').forEach(init);
  }

  function overlayFor(event) {
    const id = ID_PREFIX + (event.detail && event.detail.sectionId);
    return document.getElementById(id);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initAll(), { once: true });
  } else {
    initAll();
  }

  // Theme editor. The overlay for a section lives on <body>, not inside the
  // section element, so `load` still scans the re-rendered section (that copy
  // has not been moved yet) while `select`/`unload` look it up by id.
  document.addEventListener('shopify:section:load', (event) => initAll(event.target));

  document.addEventListener('shopify:section:select', (event) => {
    const root = overlayFor(event);
    if (root && root.introPopup) root.introPopup.open();
  });

  document.addEventListener('shopify:section:unload', (event) => {
    const root = overlayFor(event);
    if (root && root.introPopup) root.introPopup.destroy();
  });
})();
