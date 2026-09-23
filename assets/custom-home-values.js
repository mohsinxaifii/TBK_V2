// Mirrors custom-audio-player.js's cursor-attached tag exactly (same pointer
// offset, same 3D flip open/close, same drag-inertia tilt, same :hover-polling
// detection), scoped to each .custom-home_values-item independently instead
// of once per section, and showing that block's own "floater" text instead
// of a play/pause label. The item's real title is never touched -- nothing
// is cloned or hidden.
document.addEventListener('DOMContentLoaded', () => {
  const hasGsap = typeof window.gsap !== 'undefined';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const supportsFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const fx = hasGsap && !reduceMotion && supportsFinePointer;
  if (!fx) return;

  // Sits to the right of the real (still visible) cursor rather than
  // replacing it, offset by this many px from the pointer's own x.
  const CURSOR_TAG_OFFSET_X = 22;
  // Drag-inertia tilt: how far a frame's raw pointer movement can rotate the
  // tag, and the px-of-movement-to-degrees factor. Sign is inverted from the
  // movement direction so the tag reads as trailing/lagging behind the
  // cursor like it has weight, not rigidly glued to it. Vertical movement is
  // weighted heavier than horizontal: the tag is a wide, short pill, so for
  // the same px of movement, dragging it vertically reads as more
  // pronounced than dragging it sideways.
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

  // Shared live mouse position -- used only to POSITION the tag (and to
  // compute the drag tilt). Whether an item currently counts as "hovered"
  // is decided separately, via the browser's own :hover state (see tick()
  // below), not from these coordinates.
  let mouseX = -Infinity;
  let mouseY = -Infinity;
  let hasMouse = false;
  document.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    mouseX = event.clientX;
    mouseY = event.clientY;
    hasMouse = true;
  });

  document.querySelectorAll('.custom-home_values-item').forEach((item) => {
    const cursorTag = item.querySelector('.custom-home_values-cursor-tag');
    const cursorTagFlip = item.querySelector('.custom-home_values-cursor-tag-flip');
    if (!cursorTag || !cursorTagFlip) return;

    // Moved to <body> (not left nested in .custom-home_values-item) so its
    // position:fixed is always relative to the viewport itself -- nested
    // deep in the item, an ancestor could give it an unrelated containing
    // block and send it drifting far from the cursor the further down the
    // page the item sits.
    document.body.appendChild(cursorTag);
    cursorTag.classList.add('is-active');

    // cursorTag (outer, position:fixed) only ever gets translated to follow
    // the pointer. cursorTagFlip (inner) only ever rotates -- combining
    // percentage-based translation with 3D rotation on the same element
    // produces a sheared parallelogram instead of a clean flip (see
    // custom-audio-player.js), so the two transforms are split across two
    // elements here too.
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

    let isOpen = false;
    // True for the duration of the open/close tween itself -- the drag tilt
    // is suppressed while this is true so it can't blend with the
    // rotationX flip and skew it into a parallelogram.
    let isFlipping = false;
    let isOverItem = false;
    let prevRawX = 0;
    let prevRawY = 0;
    // Smoothed pointer delta the tilt actually reads from.
    let tiltDeltaX = 0;
    let tiltDeltaY = 0;
    let closeTimer = null;

    // Backwards 3D flip open/close instead of a plain fade -- hinges on
    // rotationX so it tilts back away from the viewer when hidden and flips
    // forward to face them when shown.
    //
    // killTweensOf before each open/close is load-bearing: GSAP 3 does NOT
    // auto-kill conflicting tweens. Without it, exiting within the open
    // tween's 0.6s window (routine during a fast scroll-through) leaves
    // BOTH tweens running -- the 0.4s close finishes at opacity 0, then
    // the still-alive open tween keeps ticking and drags opacity right
    // back to 1 with every flag already saying "closed", so nothing ever
    // closes it again. That was the "tag stays stuck until re-hovered"
    // bug.
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
    // still get out of sync with fast scrolling. :hover is different: the
    // browser is required to keep it correct even when content moves
    // under a stationary cursor (that's why native CSS hover effects,
    // e.g. nav dropdowns, never get stuck open on scroll) -- it has no
    // dependency on any event actually firing, so there's nothing left
    // for scrolling to race against.
    const tick = () => {
      if (!hasMouse) return;

      const nowOver = item.matches(':hover');

      if (nowOver) {
        // Back over the item before the grace period ran out: the tag was
        // never really left, so there is nothing to cancel back out of.
        if (closeTimer) {
          clearTimeout(closeTimer);
          closeTimer = null;
        }

        if (!isOverItem) {
          isOverItem = true;
          prevRawX = mouseX;
          prevRawY = mouseY;
          tiltDeltaX = 0;
          tiltDeltaY = 0;
          gsap.set(cursorTag, { x: mouseX + CURSOR_TAG_OFFSET_X, y: mouseY });
          openTag();
        }
      } else if (isOverItem && !closeTimer) {
        closeTimer = setTimeout(() => {
          closeTimer = null;
          isOverItem = false;
          closeTag();
        }, CURSOR_CLOSE_DELAY);
      }

      // Still true through the grace window, so the tag keeps gliding with
      // the pointer instead of freezing where :hover happened to drop.
      if (!isOverItem) return;

      moveX(mouseX + CURSOR_TAG_OFFSET_X);
      moveY(mouseY);

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
  });
});
