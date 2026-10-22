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

    // One <video> per breakpoint, each holding its URL in data-src until it is
    // needed. Only the one whose data-media matches is ever given a src, so a
    // phone never downloads the desktop clip and vice versa.
    const videos = Array.from(root.querySelectorAll('.custom-intro-popup__video'));
    const mobileQuery = window.matchMedia('(max-width: 749px)');

    function activeVideo() {
      return videos.find((video) => window.matchMedia(video.dataset.media).matches);
    }

    function loadVideo() {
      const video = activeVideo();
      if (video && !video.getAttribute('src')) {
        video.preload = 'auto';
        video.src = video.dataset.src;
      }
      return video;
    }

    // Reduced motion still gets the clip loaded, so its first frame shows, but
    // it is never set playing — unless the visitor asks for sound, which is
    // an explicit request to play.
    function playVideo(force) {
      const video = loadVideo();
      if (!video || (reduceMotion && !force)) return;
      video.muted = isMuted;
      const playing = video.play();
      if (playing) {
        playing.catch(() => {
          // Unmuted playback refused (no user gesture behind it, e.g. after a
          // breakpoint swap): fall back to muted, which is always allowed.
          if (!video.muted) {
            setMuted(true);
            const retry = video.play();
            if (retry) retry.catch(() => {});
          }
        });
      }
    }

    function pauseVideos() {
      videos.forEach((video) => video.pause());
    }

    // Rotating a tablet or resizing across 750 swaps which clip is on screen.
    function onBreakpointChange() {
      if (!isOpen) return;
      pauseVideos();
      playVideo();
    }
    mobileQuery.addEventListener('change', onBreakpointChange);

    // --- Sound -----------------------------------------------------------------
    // The same control as the home banner's (custom-banner-audio.js): a round
    // toggle, plus on desktop a tag that follows the cursor over the film and
    // makes the whole film clickable. Films always start muted (autoplay
    // policy), and every unmute comes straight from a click, which is the
    // gesture browsers require before playing with sound.
    const media = root.querySelector('.custom-intro-popup__media');
    const muteButton = root.querySelector('[data-custom-intro-popup-mute]');
    const muteIconMuted = root.querySelector('.custom-intro-popup__mute-icon--muted');
    const muteIconUnmuted = root.querySelector('.custom-intro-popup__mute-icon--unmuted');
    const cursorTag = root.querySelector('.custom-intro-popup__cursor-tag');
    const cursorTagFlip = root.querySelector('.custom-intro-popup__cursor-tag-flip');
    const cursorTagText = root.querySelector('.custom-intro-popup__cursor-tag-text');
    const fx = typeof window.gsap !== 'undefined' && !reduceMotion;
    let isMuted = true;

    const updateCursorTagLabel = (text) => {
      if (!cursorTagText || cursorTagText.textContent === text) return;
      if (!fx) {
        cursorTagText.textContent = text;
        return;
      }
      gsap
        .timeline()
        .to(cursorTagText, { yPercent: -120, duration: 0.3, ease: 'power3.in' })
        .call(() => {
          cursorTagText.textContent = text;
        })
        .set(cursorTagText, { yPercent: 120 })
        .to(cursorTagText, { yPercent: 0, duration: 0.5, ease: 'power4.out' });
    };

    const morphMuteIcon = (muted) => {
      if (!fx || !muteIconMuted || !muteIconUnmuted) return;
      const showing = muted ? muteIconMuted : muteIconUnmuted;
      const hiding = muted ? muteIconUnmuted : muteIconMuted;
      gsap.killTweensOf([showing, hiding]);
      gsap.set(hiding, { display: 'none' });
      gsap.fromTo(
        showing,
        { display: 'flex', opacity: 0, scale: 0.5, rotate: muted ? -35 : 35 },
        { opacity: 1, scale: 1, rotate: 0, duration: 0.35, ease: 'back.out(2.4)' }
      );
    };

    const bumpMuteButton = () => {
      if (!fx || !muteButton) return;
      gsap.killTweensOf(muteButton);
      gsap.fromTo(muteButton, { scale: 0.86 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.55)' });
    };

    // Muting fades the volume out and only cuts audio once it is silent;
    // unmuting flips muted off at once and fades the volume in. `instant`
    // skips both the fades and the icon morph, for closing the popup.
    function setMuted(muted, instant) {
      if (muted === isMuted) return;
      isMuted = muted;

      if (muteButton) {
        muteButton.classList.toggle('is-unmuted', !muted);
        muteButton.setAttribute('aria-pressed', muted ? 'true' : 'false');
        muteButton.setAttribute('aria-label', muted ? 'Unmute video' : 'Mute video');
      }
      if (!instant) morphMuteIcon(muted);
      else if (fx && muteIconMuted && muteIconUnmuted) gsap.set([muteIconMuted, muteIconUnmuted], { clearProps: 'all' });
      updateCursorTagLabel(muted ? 'Unmute Video' : 'Mute Video');

      videos.forEach((video) => {
        if (fx) gsap.killTweensOf(video);
        if (!fx || instant) {
          video.muted = muted;
          video.volume = 1;
          return;
        }
        if (muted) {
          gsap.to(video, {
            volume: 0,
            duration: 0.5,
            ease: 'power2.out',
            onComplete: () => {
              video.muted = true;
              video.volume = 1;
            },
          });
        } else {
          video.muted = false;
          gsap.fromTo(video, { volume: 0 }, { volume: 1, duration: 0.5, ease: 'power2.out' });
        }
      });
    }

    function toggleSound() {
      bumpMuteButton();
      setMuted(!isMuted);
      if (!isMuted) playVideo(true);
    }

    if (muteButton) muteButton.addEventListener('click', toggleSound);

    // Cursor tag: GSAP, motion allowed and a fine hover-capable pointer only,
    // as on the banner — the round button works regardless.
    const supportsFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let tagTick = null;
    let closeTag = () => {};

    if (media && cursorTag && cursorTagFlip && fx && supportsFinePointer) {
      cursorTag.classList.add('is-enabled');
      media.classList.add('has-cursor-tag');

      const TAG_OFFSET_X = 22;
      const TILT_MAX = 28;
      const TILT_FACTOR = 0.85;
      const TILT_VERTICAL_BOOST = 1.6;
      const TILT_SMOOTHING = 0.35;

      gsap.set(cursorTag, { xPercent: 0, yPercent: -50 });
      gsap.set(cursorTagFlip, { transformOrigin: 'center center', transformPerspective: 200, rotationX: -100, opacity: 0 });

      const moveX = gsap.quickTo(cursorTag, 'x', { duration: 0.55, ease: 'power3' });
      const moveY = gsap.quickTo(cursorTag, 'y', { duration: 0.55, ease: 'power3' });
      const setTilt = gsap.quickTo(cursorTagFlip, 'rotation', { duration: 0.3, ease: 'power2' });

      let mouseX = 0;
      let mouseY = 0;
      let prevX = 0;
      let prevY = 0;
      let tiltX = 0;
      let tiltY = 0;
      let overMedia = false;
      let overButton = false;
      let tagOpen = false;
      let flipping = false;

      const flip = (open) => {
        if (open === tagOpen) return;
        tagOpen = open;
        flipping = true;
        gsap.killTweensOf(cursorTagFlip, 'rotationX,opacity');
        gsap.set(cursorTagFlip, { rotation: 0 });
        gsap.to(cursorTagFlip, {
          rotationX: open ? 0 : -100,
          opacity: open ? 1 : 0,
          duration: open ? 0.6 : 0.4,
          ease: open ? 'back.out(1.15)' : 'power2.inOut',
          onComplete: () => {
            flipping = false;
          },
        });
      };
      closeTag = () => flip(false);

      media.addEventListener('pointerenter', (event) => {
        if (event.pointerType !== 'mouse') return;
        overMedia = true;
        mouseX = prevX = event.clientX;
        mouseY = prevY = event.clientY;
        tiltX = tiltY = 0;
        gsap.set(cursorTag, { x: mouseX + TAG_OFFSET_X, y: mouseY });
        if (!overButton) flip(true);
      });

      media.addEventListener('pointermove', (event) => {
        if (event.pointerType !== 'mouse') return;
        mouseX = event.clientX;
        mouseY = event.clientY;
        // The round button is its own control; the tag steps aside over it.
        const nowOverButton = !!(muteButton && muteButton.contains(event.target));
        if (nowOverButton !== overButton) {
          overButton = nowOverButton;
          flip(!overButton);
        }
      });

      media.addEventListener('pointerleave', () => {
        overMedia = false;
        overButton = false;
        flip(false);
      });

      media.addEventListener('click', (event) => {
        if (muteButton && muteButton.contains(event.target)) return;
        toggleSound();
      });

      tagTick = () => {
        if (!overMedia) return;
        moveX(mouseX + TAG_OFFSET_X);
        moveY(mouseY);
        if (!flipping) {
          tiltX += (mouseX - prevX - tiltX) * TILT_SMOOTHING;
          tiltY += (mouseY - prevY - tiltY) * TILT_SMOOTHING;
          const raw = -tiltX + tiltY * TILT_VERTICAL_BOOST;
          setTilt(gsap.utils.clamp(-TILT_MAX, TILT_MAX, raw * TILT_FACTOR));
        }
        prevX = mouseX;
        prevY = mouseY;
      };
      gsap.ticker.add(tagTick);
    }

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
      playVideo();

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

      // Sound off straight away rather than fading over the closing animation,
      // and back to muted so a reopen (theme editor) starts silent again.
      setMuted(true, true);
      closeTag();

      const finish = () => {
        root.hidden = true;
        pauseVideos();
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
        mobileQuery.removeEventListener('change', onBreakpointChange);
        if (tagTick) gsap.ticker.remove(tagTick);
        pauseVideos();
        root.remove();
      },
    };

    if (!designMode && hasSeen(frequency)) return;

    // The clip starts buffering when the loader lifts, so the delay before the
    // popup opens is spent downloading it rather than the visitor watching a
    // blank panel.
    whenLoaderDone(() => {
      loadVideo();
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
