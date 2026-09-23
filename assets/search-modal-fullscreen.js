document.addEventListener('DOMContentLoaded', () => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('.header__search').forEach((wrapper) => {
    const details = wrapper.querySelector('details');
    const modal = wrapper.querySelector('.search-modal--fullscreen');
    if (!details || !modal) return;

    const form = modal.querySelector('.search-modal__form');
    const popularLabel = modal.querySelector('.search-modal__popular-label');
    const popularLinks = modal.querySelectorAll('.search-modal__popular-link');
    const closeButton = modal.querySelector('.search-modal__close-button');

    function canAnimate() {
      return (
        typeof window.gsap !== 'undefined' &&
        !reduceMotion &&
        !(window.Shopify && window.Shopify.designMode)
      );
    }

    // overflow:hidden alone is well known to not reliably block touch-drag
    // scrolling on mobile browsers (iOS Safari in particular can still let
    // the page bleed/rubber-band underneath). Pinning body to position:fixed
    // removes it from scrolling entirely; the scroll offset is preserved as a
    // negative top so the page doesn't visibly jump when locked, and restored
    // on unlock.
    let scrollY = 0;

    function lockScroll() {
      scrollY = window.scrollY;
            document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      window.scrollLock.lock(modal);
    }

    function unlockScroll() {
            document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
      window.scrollLock.unlock(modal);
    }

    function playOpenAnimation() {
      lockScroll();
      if (!canAnimate()) return;

      // Curtain: the maroon panel itself slides down into place first.
      gsap.set(modal, { yPercent: -100 });
      // Content stays hidden until the curtain lands, then each group gets its
      // own entrance direction so the reveal doesn't feel like one repeated tween.
      gsap.set(form, { opacity: 0, y: 26 });
      gsap.set(popularLabel, { opacity: 0, y: 16 });
      gsap.set(popularLinks, { opacity: 0, x: -22 });
      gsap.set(closeButton, { opacity: 0, scale: 0.6 });

      // The panel switches from display:none to visible this same tick, so
      // its first layout/paint is still "cold". Starting the tween one frame
      // later lets the browser settle that before anything moves.
      requestAnimationFrame(() => {
        gsap
          .timeline()
          // "out" easing (fast start, decelerating into the landing) so the
          // curtain covers the header almost immediately instead of creeping
          // over it during a slow ease-in ramp-up.
          .to(modal, { yPercent: 0, duration: 0.6, ease: 'power4.out' })
          .to(form, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }, '-=0.25')
          .to(closeButton, { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(2)' }, '-=0.3')
          .to(popularLabel, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }, '-=0.15')
          .to(
            popularLinks,
            { opacity: 1, x: 0, duration: 0.4, stagger: 0.08, ease: 'power2.out' },
            '-=0.1'
          );
      });
    }

    // Mirror image of the open timeline, run backwards (content first, then
    // the curtain lifts away) so closing reads as a continuation of the same
    // motion instead of the native instant display:none.
    function playCloseAnimation(onComplete) {
      if (!canAnimate()) {
        unlockScroll();
        onComplete();
        return;
      }

      gsap
        .timeline({
          onComplete: () => {
            unlockScroll();
            onComplete();
          },
        })
        .to(popularLinks, { opacity: 0, x: -22, duration: 0.22, stagger: 0.03, ease: 'power2.in' })
        .to(popularLabel, { opacity: 0, y: 14, duration: 0.22, ease: 'power2.in' }, '-=0.12')
        .to(closeButton, { opacity: 0, scale: 0.6, duration: 0.2, ease: 'power2.in' }, '-=0.16')
        .to(form, { opacity: 0, y: 20, duration: 0.28, ease: 'power2.in' }, '-=0.12')
        .to(modal, { yPercent: -100, duration: 0.5, ease: 'power3.in' }, '-=0.08');
    }

    // Wrap close() on this specific <details-modal> instance so Escape and
    // clicking the overlay -- both of which look up `this.close` live at the
    // moment they fire -- play the reverse animation before the real close()
    // (which removes the open attribute and the body scroll-lock class) runs.
    // Scoped to this one instance only; doesn't touch DetailsModal itself, so
    // any other use of <details-modal> elsewhere in the theme is unaffected.
    const originalClose = wrapper.close.bind(wrapper);
    let closing = false;
    wrapper.close = function (focusToggle) {
      // The sticky header calls close() on every scroll-down past it, open
      // or not. Unlocking from here would restore a scrollY that lockScroll
      // never recorded (0) and throw the page back to the top.
      if (!details.hasAttribute('open')) return;
      if (closing) return;
      closing = true;
      playCloseAnimation(() => {
        closing = false;
        originalClose(focusToggle);
      });
    };

    // The close button's own listener was bound directly to the ORIGINAL
    // close() when <details-modal> first upgraded (`this.close.bind(this)`),
    // so it holds a fixed reference and never sees the wrapping above. Catch
    // its click in the capture phase -- which runs before the button's own
    // listener regardless of registration order -- and re-route through the
    // (now wrapped) wrapper.close() instead.
    if (closeButton) {
      modal.addEventListener(
        'click',
        (event) => {
          if (!event.target.closest('.search-modal__close-button')) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          // wrapper.close() (wrapped above) still closes correctly, just
          // without visible animation, when canAnimate() is false -- so
          // routing through it unconditionally keeps scroll/Lenis cleanup
          // consistent regardless of which path triggered the close.
          wrapper.close();
        },
        true
      );
    }

    // ---- Results panel height ------------------------------------------------
    // PredictiveSearch replaces the panel's innerHTML on every keystroke, so
    // its height jumps between renders (3 suggestions -> 1 -> 5). The panel is
    // in the flow now, so those jumps shove the "Search for ..." row and the
    // popular list around. Tween between the old and new heights instead, and
    // fade the fresh markup in over the top of it.
    const predictiveSearch = modal.querySelector('predictive-search');
    const resultsPanel = modal.querySelector('[data-predictive-search]');

    if (predictiveSearch && resultsPanel) {
      let heightTween = null;

      const clearHeight = () => {
        if (typeof window.gsap === 'undefined') return;
        heightTween?.kill();
        heightTween = null;
        gsap.set(resultsPanel, { clearProps: 'height,overflow' });
      };

      const morphHeight = () => {
        if (!canAnimate()) return;

        // Nothing to measure against while the panel is display:none.
        if (!predictiveSearch.hasAttribute('open') && !predictiveSearch.hasAttribute('loading')) {
          clearHeight();
          return;
        }

        const from = resultsPanel.offsetHeight;
        heightTween?.kill();
        gsap.set(resultsPanel, { height: 'auto' });
        const to = resultsPanel.offsetHeight;

        const fresh = resultsPanel.firstElementChild;
        if (fresh) {
          gsap.fromTo(fresh, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
        }

        // First paint of the panel: the CSS keyframe already handles the
        // entrance, so don't tween a height on top of it.
        if (from === 0 || Math.abs(to - from) < 2) {
          gsap.set(resultsPanel, { clearProps: 'height,overflow' });
          return;
        }

        heightTween = gsap.fromTo(
          resultsPanel,
          { height: from, overflow: 'hidden' },
          {
            height: to,
            duration: 0.4,
            ease: 'power3.out',
            onComplete: () => gsap.set(resultsPanel, { clearProps: 'height,overflow' }),
          }
        );
      };

      new MutationObserver(morphHeight).observe(resultsPanel, { childList: true });

      // closeResults() does resultsPanel.removeAttribute('style'), which would
      // wipe an in-flight tween's inline height out from under it and leave the
      // tween writing to a hidden element. Drop it as soon as the panel closes.
      new MutationObserver(() => {
        if (!predictiveSearch.hasAttribute('open') && !predictiveSearch.hasAttribute('loading')) clearHeight();
      }).observe(predictiveSearch, { attributes: true, attributeFilter: ['open', 'loading'] });
    }

    // Not using the native "toggle" event for detecting opens: per spec it
    // fires via a queued task, not synchronously with the open attribute
    // changing, which leaves a real gap for the browser to paint one frame of
    // the modal in its plain, fully-visible resting state first. A
    // MutationObserver callback runs as a microtask instead -- guaranteed to
    // run before the next paint, no matter what order scripts on the page
    // happened to load in.
    let wasOpen = details.hasAttribute('open');
    new MutationObserver(() => {
      const isOpen = details.hasAttribute('open');
      if (isOpen && !wasOpen) playOpenAnimation();
      wasOpen = isOpen;
    }).observe(details, { attributes: true, attributeFilter: ['open'] });
  });
});
