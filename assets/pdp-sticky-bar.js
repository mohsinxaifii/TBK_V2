if (!customElements.get('pdp-sticky-bar')) {
  customElements.define(
    'pdp-sticky-bar',
    class PdpStickyBar extends HTMLElement {
      // Below this width the bar can show; matches this store's own custom
      // breakpoint convention (distinct from Dawn's stock 749/750px).
      static MEDIA_QUERY = '(max-width: 767px)';

      // position: fixed anchors to the LAYOUT viewport. Chrome's and Safari's
      // collapsing address bars, and the on-screen keyboard, move the VISUAL
      // viewport independently of it -- so bottom:0 can land above the real
      // bottom edge and leave a strip of page showing under the bar. Track the
      // visual viewport's bottom and translate the bar onto it.
      trackVisualViewport() {
        const viewport = window.visualViewport;
        if (!viewport) return;

        let frame = null;
        const apply = () => {
          frame = null;
          const layoutBottom = document.documentElement.clientHeight;
          const visualBottom = viewport.offsetTop + viewport.height;
          // Rounded, and only written when it actually changes, so the
          // toolbar's own animation doesn't thrash style recalcs.
          const shift = Math.round(visualBottom - layoutBottom);
          if (shift === this._pdpStickyBarShift) return;
          this._pdpStickyBarShift = shift;
          this.style.setProperty('--pdp-sticky-bar-shift', `${shift}px`);
        };
        const queue = () => {
          if (frame === null) frame = requestAnimationFrame(apply);
        };

        viewport.addEventListener('resize', queue);
        viewport.addEventListener('scroll', queue);
        window.addEventListener('orientationchange', queue);
        apply();

        return () => {
          if (frame !== null) cancelAnimationFrame(frame);
          viewport.removeEventListener('resize', queue);
          viewport.removeEventListener('scroll', queue);
          window.removeEventListener('orientationchange', queue);
        };
      }

      connectedCallback() {
        this._pdpStickyBarViewportCleanup = this.trackVisualViewport();
        const sectionId = this.dataset.sectionId;
        const realRow = document.querySelector('.product-form__quantity-cart-row');
        const realInput = document.getElementById(`Quantity-${sectionId}`);
        const realButton = document.getElementById(`ProductSubmitButton-${sectionId}`);
        const stickyInput = this.querySelector('.pdp-sticky-bar__quantity .quantity__input');
        const stickyButton = this.querySelector('.pdp-sticky-bar__buttons button');

        if (!realRow || !realButton || !stickyButton) return;

        const hasGsap = typeof window.gsap !== 'undefined';
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const fx = hasGsap && !reduceMotion;

        if (fx) gsap.set(this, { autoAlpha: 0, yPercent: 100, scale: 0.96 });

        // --- Quantity sync (loop-guarded: a forwarded change's own dispatch
        // re-enters this pair, but the value-equality check breaks it after
        // one hop). Dispatching 'change' on the real input — not just
        // copying its value — lets <quantity-input>'s own change handler
        // (assets/global.js) re-run its min/max button-disable validation,
        // so that logic never needs to be duplicated here. ------------------
        if (realInput && stickyInput) {
          const forward = (from, to) => {
            if (to.value === from.value) return;
            to.value = from.value;
            to.dispatchEvent(new Event('change', { bubbles: true }));
          };
          realInput.addEventListener('change', () => forward(realInput, stickyInput));
          stickyInput.addEventListener('change', () => forward(stickyInput, realInput));
        }

        // --- Buy Now proxy: forward intent to the real, fully-tested submit
        // path (assets/product-form.js) instead of duplicating its fetch/
        // error-handling/cart-drawer logic. ---------------------------------
        stickyButton.addEventListener('click', () => {
          if (realInput && stickyInput && realInput.value !== stickyInput.value) {
            realInput.value = stickyInput.value;
            realInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
          realButton.click();
        });

        // --- Mirror the real button's disabled/loading/label state, so a
        // variant going sold-out (or a request in flight) is reflected on
        // the sticky copy too, and so tapping it gives feedback even though
        // the real button/spinner are off-screen while this bar is shown. --
        const stickyButtonText = stickyButton.querySelector('span');
        const realButtonText = realButton.querySelector('span');
        const stickySpinner = stickyButton.querySelector('.loading__spinner');
        const realSpinner = realButton.querySelector('.loading__spinner');

        const syncButtonState = () => {
          stickyButton.disabled = realButton.disabled;
          if (realButton.hasAttribute('aria-disabled')) {
            stickyButton.setAttribute('aria-disabled', realButton.getAttribute('aria-disabled'));
          } else {
            stickyButton.removeAttribute('aria-disabled');
          }
          stickyButton.classList.toggle('loading', realButton.classList.contains('loading'));
          if (stickyButtonText && realButtonText) stickyButtonText.textContent = realButtonText.textContent;
          if (stickySpinner) stickySpinner.classList.toggle('hidden', !realSpinner || realSpinner.classList.contains('hidden'));
        };
        syncButtonState();
        const buttonObserver = new MutationObserver(syncButtonState);
        buttonObserver.observe(realButton, {
          attributes: true,
          attributeFilter: ['disabled', 'aria-disabled', 'class'],
          childList: true,
          characterData: true,
          subtree: true,
        });

        // --- Show/hide, gated to mobile only. A real row that's never
        // shown a sticky substitute (i.e. on desktop) must never be marked
        // aria-hidden, so the observer/aria toggling only exists while the
        // media query actually matches. ------------------------------------
        let isVisible = false;

        const setRealRowHidden = (hidden) => {
          if (hidden) realRow.setAttribute('aria-hidden', 'true');
          else realRow.removeAttribute('aria-hidden');
        };

        const setInstant = (show) => {
          isVisible = show;
          this.classList.toggle('is-visible', show);
          if (!fx) return;
          gsap.killTweensOf(this);
          gsap.set(this, show ? { autoAlpha: 1, yPercent: 0, scale: 1 } : { autoAlpha: 0, yPercent: 100, scale: 0.96 });
        };

        const showBar = () => {
          if (isVisible) return;
          isVisible = true;
          this.classList.add('is-visible');
          if (!fx) return;
          gsap.killTweensOf(this);
          gsap.to(this, { autoAlpha: 1, yPercent: 0, scale: 1, duration: 0.5, ease: 'power4.out' });
        };

        const hideBar = () => {
          if (!isVisible) return;
          isVisible = false;
          this.classList.remove('is-visible');
          if (!fx) return;
          gsap.killTweensOf(this);
          gsap.to(this, { autoAlpha: 0, yPercent: 100, scale: 0.96, duration: 0.35, ease: 'power2.out' });
        };

        let intersectionObserver = null;

        const enable = () => {
          if (intersectionObserver) return;
          let first = true;
          intersectionObserver = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                const shouldShow = !entry.isIntersecting;
                // First callback after observe() reflects scroll position at
                // the moment the bar was enabled (e.g. a resize/rotation
                // just crossed the breakpoint) — snap instantly rather than
                // playing a slide animation that wasn't triggered by scroll.
                if (first) {
                  first = false;
                  setInstant(shouldShow);
                } else if (shouldShow) {
                  showBar();
                } else {
                  hideBar();
                }
                setRealRowHidden(shouldShow);
              });
            },
            { threshold: 0 }
          );
          intersectionObserver.observe(realRow);
        };

        const disable = () => {
          if (!intersectionObserver) return;
          intersectionObserver.disconnect();
          intersectionObserver = null;
          setInstant(false);
          setRealRowHidden(false);
        };

        const mediaQuery = window.matchMedia(PdpStickyBar.MEDIA_QUERY);
        const syncMedia = (event) => (event.matches ? enable() : disable());
        syncMedia(mediaQuery);
        mediaQuery.addEventListener('change', syncMedia);

        this._pdpStickyBarCleanup = () => {
          mediaQuery.removeEventListener('change', syncMedia);
          if (intersectionObserver) intersectionObserver.disconnect();
          buttonObserver.disconnect();
          setRealRowHidden(false);
        };
      }

      disconnectedCallback() {
        if (this._pdpStickyBarCleanup) this._pdpStickyBarCleanup();
        if (this._pdpStickyBarViewportCleanup) this._pdpStickyBarViewportCleanup();
      }
    }
  );
}
