document.addEventListener('DOMContentLoaded', () => {
  const players = document.querySelectorAll('.custom-audio-player-container[data-section-id]');

  // Shared live mouse position -- used only to POSITION the tag (and to
  // compute the drag tilt). Whether the pointer currently counts as
  // "hovering" the player (or one of its excluded controls) is decided
  // separately, via the browser's own :hover state (see tick() below), not
  // from these coordinates.
  let mouseX = -Infinity;
  let mouseY = -Infinity;
  let hasMouse = false;
  document.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    mouseX = event.clientX;
    mouseY = event.clientY;
    hasMouse = true;
  });

  players.forEach((container) => {
    const audio = container.querySelector('.custom-audio-player-audio');
    const playButton = container.querySelector('.custom-audio-player-playpause');
    const playIcon = container.querySelector('.custom-audio-player-icon-play');
    const pauseIcon = container.querySelector('.custom-audio-player-icon-pause');
    const progressBar = container.querySelector('.custom-audio-player-progress-bar');
    const progressFill = container.querySelector('.custom-audio-player-progress-fill');
    const progressHandle = container.querySelector('.custom-audio-player-progress-handle');
    const languagePill = container.querySelector('.custom-audio-player-language-pill');
    const languageButtons = container.querySelectorAll('.custom-audio-player-language-button');
    const transcript = container.querySelector('.custom-audio-player-transcript');
    const transcriptHi = container.querySelector('.custom-audio-player-transcript-hi');
    const transcriptEn = container.querySelector('.custom-audio-player-transcript-en');
    const transcriptScroll = container.querySelector('.custom-audio-player-transcript-scroll-inner');
    const transcriptContent = container.querySelector('.custom-audio-player-transcript-content');
    const transcriptArrowUp = container.querySelector('.custom-audio-player-transcript-arrow-up');
    const transcriptArrowDown = container.querySelector('.custom-audio-player-transcript-arrow-down');
    const cursorTag = container.querySelector('.custom-audio-player-cursor-tag');
    const cursorTagFlip = container.querySelector('.custom-audio-player-cursor-tag-flip');
    const cursorTagText = container.querySelector('.custom-audio-player-cursor-tag-text');

    if (!audio || !playButton) return;

    const hasGsap = typeof window.gsap !== 'undefined';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fx = hasGsap && !reduceMotion;

    // Whole-section click-to-toggle and the cursor tag share this exclusion
    // list so seeking, switching language or pressing the button itself
    // never also fires the section-wide toggle underneath them.
    const CURSOR_EXCLUDED_SELECTOR =
      '.custom-audio-player-playpause, .custom-audio-player-progress-bar, .custom-audio-player-language-switcher, .custom-audio-player-transcript-nav, .custom-audio-player-transcript-scroll';
    // ":hover" appended to the joined string would only bind to the LAST
    // comma-separated part — the first two selectors would then match
    // unconditionally (they're always in the DOM) and permanently suppress
    // the cursor tag. Each part needs its own ":hover".
    const CURSOR_EXCLUDED_HOVER_SELECTOR = CURSOR_EXCLUDED_SELECTOR.split(',')
      .map((selector) => `${selector.trim()}:hover`)
      .join(', ');

    let activeLanguage = container.dataset.defaultLanguage || 'hi';
    let currentAudioSrc = null;

    const audioSources = {
      hi: audio.dataset.srcHi || audio.dataset.srcEn || '',
      en: audio.dataset.srcEn || audio.dataset.srcHi || '',
    };

    const placePill = (button, animate) => {
      if (!languagePill || !button) return;
      const x = button.offsetLeft;
      const width = button.offsetWidth;
      if (animate && fx) {
        gsap.to(languagePill, { x, width, duration: 0.45, ease: 'power3.out' });
      } else {
        if (hasGsap) gsap.killTweensOf(languagePill);
        languagePill.style.transform = `translateX(${x}px)`;
        languagePill.style.width = `${width}px`;
      }
    };

    // Switching language mid-playback swaps the <audio> src but keeps the
    // same position and play state, so the story doesn't restart underneath
    // the reader — it just carries on in the other language.
    const switchAudioSource = (language) => {
      const nextSrc = audioSources[language];
      if (!nextSrc || nextSrc === currentAudioSrc) {
        currentAudioSrc = nextSrc || currentAudioSrc;
        return;
      }

      const wasPlaying = !audio.paused;
      const resumeAt = audio.currentTime;
      currentAudioSrc = nextSrc;
      audio.src = nextSrc;

      audio.addEventListener(
        'loadedmetadata',
        () => {
          if (resumeAt) audio.currentTime = resumeAt;
          if (wasPlaying) audio.play();
        },
        { once: true }
      );
    };

    // --- Notebook transcript: paper-cut scroll window ----------------------
    // The transcript sits inside a fixed-height "window" (see
    // .custom-audio-player-transcript-scroll in the CSS) over a paper-cut PNG,
    // like a page glimpsed through a torn notebook cover. Words fade in as
    // they scroll into the window and fade out as they scroll back out
    // (either edge, either direction) via IntersectionObserver — see
    // transcriptWordObserver below.

    // Devanagari (and other complex scripts) build letters from a base
    // character plus combining marks (matras) — a plain Array.from/split
    // would tear those apart into separate spans and visibly corrupt the
    // glyphs. Intl.Segmenter's grapheme granularity groups each base+mark
    // combo as one unit instead, so what gets wrapped per "letter" is what a
    // reader actually perceives as one letter, in both English and Hindi.
    const segmenter =
      typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
        : null;
    const graphemesOf = (text) => (segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text));

    // Walks actual Text nodes only (never touching element structure), so
    // the richtext block content's own <p>/<br>/<strong> tags survive intact
    // — only the visible characters get wrapped in word/char spans for the
    // reveal animation. Word spans keep a real space text node between them
    // so the browser still wraps lines at word boundaries, not mid-word.
    const splitTextForReveal = (root) => {
      if (!root) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      let node = walker.nextNode();
      while (node) {
        textNodes.push(node);
        node = walker.nextNode();
      }
      textNodes.forEach((textNode) => {
        const text = textNode.textContent;
        if (!text) return;
        const fragment = document.createDocumentFragment();
        text.split(/(\s+)/).forEach((token) => {
          if (!token) return;
          if (/^\s+$/.test(token)) {
            fragment.appendChild(document.createTextNode(token));
            return;
          }
          const wordSpan = document.createElement('span');
          wordSpan.className = 'custom-audio-player-transcript-word';
          graphemesOf(token).forEach((grapheme) => {
            const charSpan = document.createElement('span');
            charSpan.className = 'custom-audio-player-transcript-char';
            charSpan.textContent = grapheme;
            wordSpan.appendChild(charSpan);
          });
          fragment.appendChild(wordSpan);
        });
        textNode.replaceWith(fragment);
      });
    };

    splitTextForReveal(transcriptHi);
    splitTextForReveal(transcriptEn);

    // Each word is observed against transcriptScroll as its own root: as it
    // crosses into the box (from either edge, scrolling either direction)
    // its letters tween up to full opacity; as it crosses back out, they
    // tween back down. A word is therefore only ever EITHER fully revealed
    // (the settled state the instant it's confirmed inside) OR mid-tween
    // for the ~0.4s it takes to cross an edge -- nothing sits at a
    // permanent partial opacity while comfortably inside the visible
    // window, unlike a scroll-fraction-driven timeline where a global
    // progress value can leave text mid-fade anywhere in the box. threshold
    // 0.6 ("mostly in") keeps a word from flickering right at the boundary.
    const transcriptWordObserver =
      hasGsap && !reduceMotion && 'IntersectionObserver' in window
        ? new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                const chars = entry.target.querySelectorAll('.custom-audio-player-transcript-char');
                if (!chars.length) return;
                gsap.killTweensOf(chars);
                if (entry.isIntersecting) {
                  gsap.to(chars, { opacity: 1, y: 0, duration: 0.4, stagger: 0.012, ease: 'power2.out' });
                } else {
                  gsap.to(chars, { opacity: 0.25, y: 4, duration: 0.3, stagger: 0.012, ease: 'power1.in' });
                }
              });
            },
            { root: transcriptScroll, threshold: 0.6 }
          )
        : null;

    const buildTranscriptReveal = () => {
      if (!transcriptWordObserver) return;
      [transcriptHi, transcriptEn].forEach((textEl) => {
        if (!textEl) return;
        const chars = textEl.querySelectorAll('.custom-audio-player-transcript-char');
        if (!chars.length) return;
        gsap.set(chars, { opacity: 0.25, y: 4 });
        textEl
          .querySelectorAll('.custom-audio-player-transcript-word')
          .forEach((word) => transcriptWordObserver.observe(word));
      });
    };
    buildTranscriptReveal();

    const updateTranscriptArrows = () => {
      if (!transcriptScroll) return;
      const max = transcriptScroll.scrollHeight - transcriptScroll.clientHeight;
      if (transcriptArrowUp) transcriptArrowUp.classList.toggle('is-disabled', transcriptScroll.scrollTop <= 1);
      if (transcriptArrowDown) transcriptArrowDown.classList.toggle('is-disabled', transcriptScroll.scrollTop >= max - 1);
    };

    // Scrolling back to the top on a language swap re-triggers the
    // IntersectionObserver naturally (the newly-shown language's words
    // change intersection state as scrollTop resets), so there's nothing
    // to manually re-measure here beyond the arrows' disabled state.
    const resetTranscriptScroll = () => {
      if (!transcriptScroll) return;
      transcriptScroll.scrollTop = 0;
      requestAnimationFrame(updateTranscriptArrows);
    };

    if (transcriptScroll) {
      transcriptScroll.addEventListener('scroll', updateTranscriptArrows);
      updateTranscriptArrows();

      const TRANSCRIPT_ROWS_PER_CLICK = 3;
      const transcriptRowHeight = () => {
        const lineHeight = transcriptContent && parseFloat(window.getComputedStyle(transcriptContent).lineHeight);
        return Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 32;
      };
      const scrollTranscriptByRows = (direction) => {
        const max = Math.max(0, transcriptScroll.scrollHeight - transcriptScroll.clientHeight);
        const target = Math.min(
          max,
          Math.max(0, transcriptScroll.scrollTop + transcriptRowHeight() * TRANSCRIPT_ROWS_PER_CLICK * direction)
        );
        if (fx) {
          gsap.to(transcriptScroll, { scrollTop: target, duration: 0.5, ease: 'power2.out' });
        } else {
          transcriptScroll.scrollTop = target;
        }
      };

      if (transcriptArrowUp) transcriptArrowUp.addEventListener('click', () => scrollTranscriptByRows(-1));
      if (transcriptArrowDown) transcriptArrowDown.addEventListener('click', () => scrollTranscriptByRows(1));

      // data-lenis-prevent (see the liquid) hands wheel input over the
      // notebook to native scrolling, and overscroll-behavior: contain stops
      // that native scroll from chaining back out -- together they dead-end
      // the gesture the moment the transcript reaches its top or bottom edge.
      // So once it's at an edge, forward the leftover delta on to the page
      // and scrolling simply carries on past the notebook, the way it would
      // anywhere else on the site. No preventDefault (hence passive): the
      // browser is already refusing to chain, so nothing gets scrolled twice.
      const WHEEL_LINE_HEIGHT = 100 / 6; // the normalisation Lenis itself uses
      const wheelDeltaPixels = (event) => {
        if (event.deltaMode === 1) return event.deltaY * WHEEL_LINE_HEIGHT;
        if (event.deltaMode === 2) return event.deltaY * window.innerHeight;
        return event.deltaY;
      };

      // <= 0 / >= max - 1 instead of exact bounds: sub-pixel layout means
      // scrollTop rarely lands precisely on either end. A transcript shorter
      // than its window (max === 0) counts as both edges at once, so it never
      // traps the gesture either. Positive delta = scrolling down.
      const transcriptAtEdge = (delta) => {
        const max = Math.max(0, transcriptScroll.scrollHeight - transcriptScroll.clientHeight);
        return delta < 0 ? transcriptScroll.scrollTop <= 0 : transcriptScroll.scrollTop >= max - 1;
      };

      transcriptScroll.addEventListener(
        'wheel',
        (event) => {
          const delta = wheelDeltaPixels(event);
          if (!delta) return;
          if (!transcriptAtEdge(delta)) return;

          const lenis = window.lenis;
          if (lenis && typeof lenis.scrollTo === 'function' && !lenis.isStopped) {
            // The same call Lenis makes for its own wheel input, so taking
            // over mid-gesture keeps the site's smoothing rather than
            // snapping the page along natively. lerp/duration/easing have to
            // be passed explicitly: with programmatic: false Lenis defaults
            // all three to undefined instead of falling back to the instance
            // options, and an animation with none of them set jumps straight
            // to the target -- which reads as an instant, jerky hop.
            lenis.scrollTo(lenis.targetScroll + delta, {
              programmatic: false,
              lerp: lenis.options.lerp,
              duration: lenis.options.duration,
              easing: lenis.options.easing,
            });
          } else {
            // No Lenis means smooth-scroll.js bailed on prefers-reduced-motion
            // (or failed to load), so hand over instantly here too rather than
            // animating past a preference that asked for no animation.
            window.scrollBy(0, delta);
          }
        },
        { passive: true }
      );

      // Touch is the same dead-end as wheel, and needs its own hand-off: the
      // prevent() rule in smooth-scroll.js matches [data-lenis-prevent] for
      // touch as well, and overscroll-behavior: contain stops the native
      // scroll chaining out -- so on a phone the drag simply stopped at the
      // notebook's edge and the page never carried on.
      //
      // Forwarded natively rather than through lenis.scrollTo(): Lenis is
      // configured without syncTouch, so touch page-scrolling is native and
      // Lenis only mirrors it. Animating here would fight the finger instead
      // of tracking it 1:1.
      let transcriptTouchY = null;

      transcriptScroll.addEventListener(
        'touchstart',
        (event) => {
          transcriptTouchY = event.touches.length === 1 ? event.touches[0].clientY : null;
        },
        { passive: true }
      );

      transcriptScroll.addEventListener(
        'touchmove',
        (event) => {
          if (transcriptTouchY === null || event.touches.length !== 1) return;
          const y = event.touches[0].clientY;
          // A finger moving up pulls content upward, i.e. scrolls down --
          // the same sign convention as wheel deltaY.
          const delta = transcriptTouchY - y;
          transcriptTouchY = y;
          if (!delta || !transcriptAtEdge(delta)) return;
          window.scrollBy(0, delta);
        },
        { passive: true }
      );

      ['touchend', 'touchcancel'].forEach((eventName) => {
        transcriptScroll.addEventListener(
          eventName,
          () => {
            transcriptTouchY = null;
          },
          { passive: true }
        );
      });

      // Grab-to-scroll: a mouse drag pans the notebook instead of starting a
      // text selection underneath it. Same pointer-capture shape as the
      // progress bar's scrubbing above. Panning is left to the browser on
      // touch -- native touch scrolling already pans this element without
      // selecting text, so intercepting it here would only fight the
      // browser's own momentum scroll. (The touch listeners above don't pan;
      // they only hand the page the leftover distance at an edge.)
      let transcriptDragStartY = 0;
      let transcriptDragStartTop = 0;

      transcriptScroll.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'touch') return;
        transcriptDragStartY = event.clientY;
        transcriptDragStartTop = transcriptScroll.scrollTop;
        transcriptScroll.classList.add('is-dragging');
        transcriptScroll.setPointerCapture(event.pointerId);
        event.preventDefault();
      });

      transcriptScroll.addEventListener('pointermove', (event) => {
        if (!transcriptScroll.classList.contains('is-dragging')) return;
        transcriptScroll.scrollTop = transcriptDragStartTop - (event.clientY - transcriptDragStartY);
      });

      ['pointerup', 'pointercancel'].forEach((eventName) => {
        transcriptScroll.addEventListener(eventName, () => {
          transcriptScroll.classList.remove('is-dragging');
        });
      });
    }

    const crossfadeTranscript = (language, animate) => {
      if (!transcript) return;
      const outgoing = language === 'hi' ? transcriptEn : transcriptHi;
      const incoming = language === 'hi' ? transcriptHi : transcriptEn;

      if (animate && fx && outgoing && incoming && outgoing !== incoming) {
        gsap.killTweensOf([outgoing, incoming]);
        gsap.to(outgoing, {
          opacity: 0,
          y: -6,
          duration: 0.25,
          ease: 'power2.out',
          onComplete() {
            transcript.dataset.language = language;
            gsap.fromTo(incoming, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out' });
            resetTranscriptScroll();
          },
        });
      } else {
        transcript.dataset.language = language;
        if (hasGsap) gsap.set([transcriptHi, transcriptEn].filter(Boolean), { clearProps: 'opacity,transform' });
        resetTranscriptScroll();
      }
    };

    const updateLanguage = (language, animate = true) => {
      activeLanguage = language;
      let activeButton = null;

      languageButtons.forEach((button) => {
        const isActive = button.dataset.language === language;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        if (isActive) activeButton = button;
      });

      placePill(activeButton, animate);
      crossfadeTranscript(language, animate);
      switchAudioSource(language);
    };

    // 'timeupdate' only fires a handful of times a second, which makes a
    // width update driven purely by it look stepped. Polling audio.currentTime
    // on every animation frame while playing (via gsap.ticker) instead keeps
    // the fill gliding continuously, matching the audio clock itself.
    const renderProgress = () => {
      if (!audio.duration) return;
      const ratio = audio.currentTime / audio.duration;
      progressFill.style.width = `${ratio * 100}%`;
      if (progressHandle) progressHandle.style.left = `${ratio * 100}%`;
      progressBar.setAttribute('aria-valuenow', Math.round(ratio * 100));
    };
    const tickProgress = () => renderProgress();
    const startProgressTicker = () => hasGsap && gsap.ticker.add(tickProgress);
    const stopProgressTicker = () => hasGsap && gsap.ticker.remove(tickProgress);

    const morphIcon = (isPlaying) => {
      if (!fx || !playIcon || !pauseIcon) return;
      const showing = isPlaying ? pauseIcon : playIcon;
      const hiding = isPlaying ? playIcon : pauseIcon;
      gsap.killTweensOf([showing, hiding]);
      gsap.set(hiding, { display: 'none' });
      gsap.fromTo(
        showing,
        { display: 'flex', opacity: 0, scale: 0.5, rotate: isPlaying ? -35 : 35 },
        { opacity: 1, scale: 1, rotate: 0, duration: 0.35, ease: 'back.out(2.4)' }
      );
    };

    // Same masked-rise motion as the site's heading signature (see
    // .ha-mask/.ha-unit in site-animations.js, e.g. custom-story-text-heading)
    // — the mask clips while the label rises up into place. Run on demand
    // for a repeated text swap instead of that script's one-time scroll
    // reveal, since this label changes with playback state, not once on
    // scroll-enter: the outgoing label rises up and out, then the incoming
    // one rises up from below, in the same continuous upward direction.
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

    const setPlayState = (isPlaying) => {
      const wasPlaying = playButton.classList.contains('is-playing');
      playButton.classList.toggle('is-playing', isPlaying);
      playButton.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
      playButton.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
      playButton.dataset.playing = isPlaying ? 'true' : 'false';
      updateCursorTagLabel(isPlaying ? 'Pause audio' : 'Play audio');

      if (wasPlaying === isPlaying) return;
      if (isPlaying) startProgressTicker();
      else stopProgressTicker();
      morphIcon(isPlaying);
    };

    const bumpPlayButton = () => {
      if (!fx) return;
      gsap.killTweensOf(playButton);
      gsap.fromTo(playButton, { scale: 0.86 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.55)' });
    };

    const togglePlayback = () => {
      bumpPlayButton();
      if (audio.paused) {
        audio.play();
        setPlayState(true);
      } else {
        audio.pause();
        setPlayState(false);
      }
    };

    playButton.addEventListener('click', togglePlayback);

    languageButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.language === activeLanguage) return;
        updateLanguage(button.dataset.language);
      });
    });

    // --- Timeline scrubbing -------------------------------------------------
    if (progressBar) {
      const ratioFromEvent = (event) => {
        const rect = progressBar.getBoundingClientRect();
        if (!rect.width) return 0;
        return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      };

      const seekToRatio = (ratio) => {
        if (!audio.duration) return;
        audio.currentTime = ratio * audio.duration;
        renderProgress();
      };

      progressBar.addEventListener('pointerdown', (event) => {
        progressBar.classList.add('is-scrubbing');
        progressBar.setPointerCapture(event.pointerId);
        seekToRatio(ratioFromEvent(event));
      });

      progressBar.addEventListener('pointermove', (event) => {
        if (!progressBar.classList.contains('is-scrubbing')) return;
        seekToRatio(ratioFromEvent(event));
      });

      ['pointerup', 'pointercancel'].forEach((eventName) => {
        progressBar.addEventListener(eventName, () => {
          progressBar.classList.remove('is-scrubbing');
        });
      });

      progressBar.addEventListener('keydown', (event) => {
        if (!audio.duration) return;
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
          event.preventDefault();
          audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
          renderProgress();
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
          event.preventDefault();
          audio.currentTime = Math.max(0, audio.currentTime - 5);
          renderProgress();
        }
      });
    }

    // --- Cursor-attached "play/pause" tag -----------------------------------
    // Only enabled with GSAP + motion allowed + a fine hover-capable pointer,
    // so the section never depends on it — the play button above always works.
    const supportsFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    // Sits to the right of the real (still visible) cursor rather than
    // replacing it, offset by this many px from the pointer's own x.
    const CURSOR_TAG_OFFSET_X = 22;
    // Drag-inertia tilt: how far a frame's raw pointer movement can rotate
    // the tag, and the px-of-movement-to-degrees factor. Sign is inverted
    // from the movement direction so the tag reads as trailing/lagging
    // behind the cursor like it has weight, not rigidly glued to it.
    // Vertical movement is weighted heavier than horizontal: the tag is a
    // wide, short pill, so for the same px of movement, dragging it
    // vertically reads as more pronounced than dragging it sideways.
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
      container.classList.add('has-cursor-tag');

      // cursorTag (outer, position:fixed) only ever gets translated to
      // follow the pointer. cursorTagFlip (inner) only ever rotates.
      // Combining percentage-based translation (xPercent/yPercent below)
      // with 3D rotation on the SAME element produced a sheared
      // parallelogram instead of a clean flip — confirmed by tweening
      // rotationX alone with the drag-tilt fully zeroed out and still
      // seeing the shear. Splitting the two transforms across two
      // elements removes any interaction between them entirely.
      gsap.set(cursorTag, { xPercent: 0, yPercent: -50 });
      gsap.set(cursorTagFlip, {
        transformOrigin: 'center center',
        transformPerspective: 200,
        rotationX: -100,
        opacity: 0,
      });

      const moveX = gsap.quickTo(cursorTag, 'x', { duration: 0.55, ease: 'power3' });
      const moveY = gsap.quickTo(cursorTag, 'y', { duration: 0.55, ease: 'power3' });
      // 'rotation' (GSAP's canonical Z-rotation name), not 'rotate' — quickTo
      // needs to read/cache the property's current value, and its alias
      // resolution for the CSS-style 'rotate' name doesn't fully support
      // that path (logs "rotate not eligible for reset"). Plain to/fromTo
      // calls elsewhere in this file accept 'rotate' fine; quickTo doesn't.
      // power2 gives the reading toward each new target a bit of its own
      // roll-off instead of power1's near-linear snap, so it reads as a
      // fluid drag rather than a jittery twitch, while still being quick
      // enough to feel tied to the pointer.
      const setTilt = gsap.quickTo(cursorTagFlip, 'rotation', { duration: 0.3, ease: 'power2' });

      let suppressed = false;
      let isOpen = false;
      // True for the duration of the open/close tween itself — the drag
      // tilt is suppressed while this is true so it can't blend with the
      // rotationX flip and skew it into a parallelogram. Z stays pinned at
      // 0 through the whole flip and only resumes reacting to movement
      // once the tag is fully open and at rest.
      let isFlipping = false;
      let isOverContainer = false;
      let prevRawX = 0;
      let prevRawY = 0;
      // Smoothed pointer delta the tilt actually reads from.
      let tiltDeltaX = 0;
      let tiltDeltaY = 0;
      let closeTimer = null;

      // Backwards 3D flip open/close instead of a plain fade — hinges on
      // rotationX so it tilts back away from the viewer when hidden and
      // flips forward to face them when shown.
      //
      // killTweensOf before each open/close is load-bearing: GSAP 3 does
      // NOT auto-kill conflicting tweens. Without it, exiting within the
      // open tween's 0.6s window (routine during a fast scroll-through)
      // leaves BOTH tweens running -- the 0.4s close finishes at opacity
      // 0, then the still-alive open tween keeps ticking and drags
      // opacity right back to 1 with every flag already saying "closed",
      // so nothing ever closes it again. That was the "tag stays stuck
      // until re-hovered" bug.
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

      // Polled every animation frame, checked against the browser's own
      // native :hover state -- NOT against pointerenter/pointermove/
      // pointerleave events, and NOT against our own elementFromPoint
      // coordinate math either. Both of those were tried and both could
      // still get out of sync with fast scrolling. :hover is different:
      // the browser is required to keep it correct even when content
      // moves under a stationary cursor (that's why native CSS hover
      // effects, e.g. nav dropdowns, never get stuck open on scroll) -- it
      // has no dependency on any event actually firing, so there's
      // nothing left for scrolling to race against.
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
        togglePlayback();
      });
    }

    audio.addEventListener('loadedmetadata', renderProgress);

    audio.addEventListener('timeupdate', () => {
      setPlayState(!audio.paused);
      renderProgress();
    });

    audio.addEventListener('seeked', renderProgress);

    audio.addEventListener('ended', () => {
      setPlayState(false);
      renderProgress();
    });

    updateLanguage(activeLanguage, false);

    // Custom fonts can still reflow the layout after first paint -- the
    // language pill's initial placement (above, animate:false) measures
    // offsetLeft/offsetWidth at DOMContentLoaded time, which can land on
    // fallback-font metrics if the webfont hasn't swapped in yet, leaving
    // it misaligned until something else (a click, a resize) re-measures
    // it. Re-placing it once more on load re-measures against the
    // settled/final font metrics. The transcript reveal needs no equivalent
    // poke: IntersectionObserver already re-fires on layout changes like
    // this on its own.
    window.addEventListener('load', () => {
      const activeButton = container.querySelector('.custom-audio-player-language-button.active');
      placePill(activeButton, false);
      updateTranscriptArrows();
    });

    window.addEventListener('resize', () => {
      const activeButton = container.querySelector('.custom-audio-player-language-button.active');
      placePill(activeButton, false);
      updateTranscriptArrows();
    });
  });
});
