document.addEventListener('DOMContentLoaded', () => {
  const banners = document.querySelectorAll('[data-custom-banner-pin]');
  if (!banners.length) return;

  // Shared live mouse position -- same convention as custom-audio-player.js's
  // cursor tag: only used to POSITION the tag. Whether it counts as hovering
  // the video is decided separately via the browser's own :hover state (see
  // tick() below), not from these coordinates.
  let mouseX = -Infinity;
  let mouseY = -Infinity;
  let hasMouse = false;
  document.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    mouseX = event.clientX;
    mouseY = event.clientY;
    hasMouse = true;
  });

  banners.forEach((pinSpace) => {
    const container = pinSpace.querySelector('.custom-banner-container');
    const muteButton = pinSpace.querySelector('.custom-banner-mute-toggle');
    const videos = Array.from(
      pinSpace.querySelectorAll('.custom-banner_desktop-video, .custom-banner_mobile-video')
    );

    if (!container || !muteButton || !videos.length) return;

    const muteIconMuted = muteButton.querySelector('.custom-banner-mute-icon-muted');
    const muteIconUnmuted = muteButton.querySelector('.custom-banner-mute-icon-unmuted');
    const cursorTag = container.querySelector('.custom-banner-cursor-tag');
    const cursorTagFlip = container.querySelector('.custom-banner-cursor-tag-flip');
    const cursorTagText = container.querySelector('.custom-banner-cursor-tag-text');

    const hasGsap = typeof window.gsap !== 'undefined';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fx = hasGsap && !reduceMotion;

    // Videos render muted (autoplay policies require it); this is the
    // in-memory mirror of that state.
    let isMuted = true;

    // Same masked-rise motion as custom-audio-player.js's cursor tag label
    // swap (see .ha-mask/.ha-unit in site-animations.js for the shared
    // signature): the mask clips while the label rises into place.
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
      if (!fx) return;
      gsap.killTweensOf(muteButton);
      gsap.fromTo(muteButton, { scale: 0.86 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.55)' });
    };

    // Muting fades the volume down and only actually cuts audio (muted=true)
    // once it's silent, in the tween's onComplete -- setting muted=true up
    // front would make the fade inaudible since it starts from already-silent.
    // Unmuting flips muted=false immediately (autoplay policy allows this
    // because every caller here is a direct click handler, a trusted user
    // gesture) and fades volume up from 0.
    const setMuted = (muted) => {
      if (muted === isMuted) return;
      isMuted = muted;

      muteButton.classList.toggle('is-unmuted', !muted);
      muteButton.setAttribute('aria-pressed', muted ? 'true' : 'false');
      muteButton.setAttribute('aria-label', muted ? 'Unmute video' : 'Mute video');
      morphMuteIcon(muted);
      updateCursorTagLabel(muted ? 'Unmute Video' : 'Mute Video');

      videos.forEach((video) => {
        if (!fx) {
          video.muted = muted;
          video.volume = muted ? 0 : 1;
          return;
        }
        gsap.killTweensOf(video);
        if (muted) {
          gsap.to(video, {
            volume: 0,
            duration: 0.5,
            ease: 'power2.out',
            onComplete: () => {
              video.muted = true;
            },
          });
        } else {
          video.muted = false;
          gsap.fromTo(video, { volume: 0 }, { volume: 1, duration: 0.5, ease: 'power2.out' });
        }
      });
    };

    muteButton.addEventListener('click', () => {
      bumpMuteButton();
      setMuted(!isMuted);
    });

    // --- Cursor-attached "mute/unmute" tag -----------------------------------
    // Only enabled with GSAP + motion allowed + a fine hover-capable pointer,
    // matching custom-audio-player.js's cursor tag exactly -- the physical
    // button above always works regardless, so the section never depends on
    // this for its core function.
    const supportsFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const CURSOR_EXCLUDED_SELECTOR = '.custom-banner-mute-toggle';
    const CURSOR_EXCLUDED_HOVER_SELECTOR = `${CURSOR_EXCLUDED_SELECTOR}:hover`;

    const CURSOR_TAG_OFFSET_X = 22;
    const CURSOR_TILT_MAX = 28;
    const CURSOR_TILT_FACTOR = 0.85;
    const CURSOR_TILT_VERTICAL_BOOST = 1.6;
    // Eased rather than the raw per-frame delta: a short, slow movement's real
    // signal is only a pixel or two, so on its own it is mostly the noise of
    // pointer coalescing landing unevenly across frames -- some frames get no
    // delta and the next one gets it all. Chasing that raw value tilts in
    // jerks; easing it lets a real stop decay out instead of snapping flat.
    const CURSOR_TILT_SMOOTHING = 0.35;
    // The pointer clips outside `:hover` for a frame or two on nearly every
    // pass -- crossing a gap, or content shifting under a stationary cursor.
    // Closing on the spot reads as the tag breaking; holding it open for a
    // beat and only closing if the pointer really has left lets it keep
    // gliding with the cursor through that instead.
    const CURSOR_CLOSE_DELAY = 180;

    if (cursorTag && cursorTagFlip && fx && supportsFinePointer) {
      // Moved to a direct child of <body> rather than left in place (unlike
      // custom-audio-player-cursor-tag, which stays put): site-animations.js
      // runs a "cinematic open" intro on .custom-banner-container itself
      // (gsap.fromTo(ctx.frame, {scale:1.06}, {scale:1, ...})) and, like GSAP
      // tweens generally, leaves the inline transform on it afterwards even
      // though the end value is scale(1). ANY transform on an ancestor --
      // even a visually-identity one -- makes that ancestor the containing
      // block for position:fixed descendants instead of the viewport, so the
      // tag was positioning itself relative to the (transformed) video
      // container rather than the cursor once that intro finished, landing
      // far from the pointer. Re-parenting to <body>, which nothing here
      // ever transforms, guarantees position:fixed resolves against the
      // viewport regardless of what any other script does to this section.
      document.body.appendChild(cursorTag);
      cursorTag.classList.add('is-enabled');

      gsap.set(cursorTag, { xPercent: 0, yPercent: -50 });
      gsap.set(cursorTagFlip, {
        transformOrigin: 'center center',
        transformPerspective: 200,
        rotationX: -100,
        opacity: 0,
      });

      const moveX = gsap.quickTo(cursorTag, 'x', { duration: 0.55, ease: 'power3' });
      const moveY = gsap.quickTo(cursorTag, 'y', { duration: 0.55, ease: 'power3' });
      const setTilt = gsap.quickTo(cursorTagFlip, 'rotation', { duration: 0.3, ease: 'power2' });

      let suppressed = false;
      let isOpen = false;
      let isFlipping = false;
      let isOverContainer = false;
      let prevRawX = 0;
      let prevRawY = 0;
      // Smoothed pointer delta the tilt actually reads from.
      let tiltDeltaX = 0;
      let tiltDeltaY = 0;
      let closeTimer = null;

      const openTag = () => {
        if (isOpen) return;
        isOpen = true;
        isFlipping = true;
        gsap.killTweensOf(cursorTagFlip, 'rotationX,opacity');
        gsap.set(cursorTagFlip, { rotation: 0 });
        gsap.to(cursorTagFlip, {
          rotationX: 0,
          opacity: 1,
          duration: 0.6,
          ease: 'back.out(1.15)',
          onComplete: () => {
            isFlipping = false;
          },
        });
      };

      const closeTag = () => {
        if (!isOpen) return;
        isOpen = false;
        isFlipping = true;
        gsap.killTweensOf(cursorTagFlip, 'rotationX,opacity');
        gsap.set(cursorTagFlip, { rotation: 0 });
        gsap.to(cursorTagFlip, {
          rotationX: -100,
          opacity: 0,
          duration: 0.4,
          ease: 'power2.inOut',
          onComplete: () => {
            isFlipping = false;
          },
        });
      };

      const tick = () => {
        if (!hasMouse) return;

        const nowOver = container.matches(':hover');

        if (nowOver) {
          // Back over the section before the grace period ran out: the tag
          // was never really left, so there is nothing to cancel back out of.
          if (closeTimer) {
            clearTimeout(closeTimer);
            closeTimer = null;
          }

          if (!isOverContainer) {
            isOverContainer = true;
            prevRawX = mouseX;
            prevRawY = mouseY;
            tiltDeltaX = 0;
            tiltDeltaY = 0;
            gsap.set(cursorTag, { x: mouseX + CURSOR_TAG_OFFSET_X, y: mouseY });
          }
        } else if (isOverContainer && !closeTimer) {
          closeTimer = setTimeout(() => {
            closeTimer = null;
            isOverContainer = false;
            closeTag();
          }, CURSOR_CLOSE_DELAY);
        }

        // Still true through the grace window, so the tag keeps gliding with
        // the pointer instead of freezing where :hover happened to drop.
        if (!isOverContainer) return;

        moveX(mouseX + CURSOR_TAG_OFFSET_X);
        moveY(mouseY);

        // Only while the pointer is genuinely inside. Nothing is hovered
        // during the grace window, so re-running this there would read as
        // "just left the excluded control" and flip the tag open on the way
        // out, a beat before the close lands.
        if (nowOver) {
          const overExcluded = !!container.querySelector(CURSOR_EXCLUDED_HOVER_SELECTOR);
          if (overExcluded !== suppressed) {
            suppressed = overExcluded;
            if (suppressed) closeTag();
            else openTag();
          } else if (!suppressed && !isOpen) {
            openTag();
          }
        }

        if (!isFlipping) {
          const deltaX = mouseX - prevRawX;
          const deltaY = mouseY - prevRawY;
          tiltDeltaX += (deltaX - tiltDeltaX) * CURSOR_TILT_SMOOTHING;
          tiltDeltaY += (deltaY - tiltDeltaY) * CURSOR_TILT_SMOOTHING;
          const raw = -tiltDeltaX + tiltDeltaY * CURSOR_TILT_VERTICAL_BOOST;
          setTilt(gsap.utils.clamp(-CURSOR_TILT_MAX, CURSOR_TILT_MAX, raw * CURSOR_TILT_FACTOR));
        }
        prevRawX = mouseX;
        prevRawY = mouseY;
      };

      gsap.ticker.add(tick);

      container.addEventListener('click', (event) => {
        if (event.target.closest(CURSOR_EXCLUDED_SELECTOR)) return;
        bumpMuteButton();
        setMuted(!isMuted);
      });
    }

    // --- Fade out + mute once the section has fully scrolled out of view ---
    // threshold:0 fires exactly when the pin space crosses from any overlap
    // with the viewport to none -- "completely scrolled out", either above or
    // below. Scrolling back in does NOT auto-resume sound: browsers only
    // allow unmuted playback to start from a trusted user gesture, and a
    // scroll callback isn't one, so setMuted(true) here is the only direction
    // that would reliably work anyway.
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) return;
            setMuted(true);
          });
        },
        { threshold: 0 }
      );
      observer.observe(pinSpace);
    }
  });
});
