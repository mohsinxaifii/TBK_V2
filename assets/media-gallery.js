if (!customElements.get('media-gallery')) {
  customElements.define(
    'media-gallery',
    class MediaGallery extends HTMLElement {
      constructor() {
        super();
        this.elements = {
          liveRegion: this.querySelector('[id^="GalleryStatus"]'),
          viewer: this.querySelector('[id^="GalleryViewer"]'),
          thumbnails: this.querySelector('[id^="GalleryThumbnails"]'),
        };
        this.mql = window.matchMedia('(min-width: 750px)');
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        if (!this.elements.thumbnails) return;

        this.elements.viewer.addEventListener('slideChanged', debounce(this.onSlideChanged.bind(this), 500));
        // In the one-image-at-a-time layouts (desktop thumbnails, mobile "show")
        // the viewer shows only the active item, so there is nothing for
        // slider-component to scroll. Catch the arrow clicks on the way down
        // (capture) and step through the media instead.
        this.elements.viewer.addEventListener('click', this.onArrowClick.bind(this), true);
        // slider-component also sets the arrows' disabled state, from scroll
        // maths that assume a row of visible slides. On mobile the list is a
        // scroll container, so any scroll or resize in it (a re-snap, the next
        // image being a different height) runs that maths against a one-image
        // row, and it disables the arrows -- which then can't be tapped to reach
        // updateArrows() and be put right. Its update() skips the toggling when
        // looping is on, so report looping while a single-image layout is in use
        // and leave the arrows to updateArrows(). The no-op setter absorbs the
        // `enableSliderLooping = false` in slider-component's constructor if it
        // upgrades after this.
        Object.defineProperty(this.elements.viewer, 'enableSliderLooping', {
          configurable: true,
          get: () => this.usesStage(),
          set() {},
        });
        this.mql.addEventListener('change', () => {
          this.settleMediaTransition();
          this.updateArrows();
        });
        this.updateArrows();
        this.bindSwipe();
        this.elements.thumbnails.querySelectorAll('[data-target]').forEach((mediaToSwitch) => {
          mediaToSwitch
            .querySelector('button')
            .addEventListener('click', this.setActiveMedia.bind(this, mediaToSwitch.dataset.target, false));
        });
        if (this.dataset.desktopLayout.includes('thumbnail') && this.mql.matches) this.removeListSemantic();
      }

      onSlideChanged(event) {
        // Single-image layouts set the thumbnail in setActiveMedia; slider-component's
        // scroll-based page maths don't describe a list with one visible item.
        if (this.usesStage()) return;
        const thumbnail = this.elements.thumbnails.querySelector(
          `[data-target="${event.detail.currentElement.dataset.mediaId}"]`
        );
        this.setActiveThumbnail(thumbnail);
      }

      setActiveMedia(mediaId, prepend) {
        const activeMedia =
          this.elements.viewer.querySelector(`[data-media-id="${mediaId}"]`) ||
          this.elements.viewer.querySelector('[data-media-id]');
        if (!activeMedia) {
          return;
        }
        const previousMedia = this.elements.viewer.querySelector('.product__media-item.is-active');
        const transition = this.captureMediaTransition(previousMedia, activeMedia);
        this.elements.viewer.querySelectorAll('[data-media-id]').forEach((element) => {
          element.classList.remove('is-active');
        });
        activeMedia?.classList?.add('is-active');
        this.updateArrows();

        if (prepend) {
          activeMedia.parentElement.firstChild !== activeMedia && activeMedia.parentElement.prepend(activeMedia);

          if (this.elements.thumbnails) {
            const activeThumbnail = this.elements.thumbnails.querySelector(`[data-target="${mediaId}"]`);
            activeThumbnail.parentElement.firstChild !== activeThumbnail && activeThumbnail.parentElement.prepend(activeThumbnail);
          }

          if (this.elements.viewer.slider) this.elements.viewer.resetPages();
        }

        if (transition) this.playMediaTransition(transition);

        // The thumbnail pop in product-gallery-motion.js listens for slideChanged,
        // which slider-component only raises on scroll. The mobile stage never
        // scrolls, so raise it here to keep the pop.
        if (previousMedia !== activeMedia && this.usesStage() && !this.mql.matches) {
          this.elements.viewer.dispatchEvent(new CustomEvent('slideChanged', { detail: { currentElement: activeMedia } }));
        }

        this.preventStickyHeader();
        window.setTimeout(() => {
          if (!this.mql.matches || this.elements.thumbnails) {
            activeMedia.parentElement.scrollTo({ left: activeMedia.offsetLeft });
          }
          const activeMediaRect = activeMedia.getBoundingClientRect();
          // Don't scroll if the image is already in view
          if (activeMediaRect.top > -0.5) return;
          const top = activeMediaRect.top + window.scrollY;
          window.scrollTo({ top: top, behavior: 'smooth' });
        });
        this.playActiveMedia(activeMedia);

        if (!this.elements.thumbnails) return;
        const activeThumbnail = this.elements.thumbnails.querySelector(`[data-target="${mediaId}"]`);
        this.setActiveThumbnail(activeThumbnail);
        this.announceLiveRegion(activeMedia, activeThumbnail.dataset.mediaPosition);
      }

      usesStage() {
        return this.mql.matches
          ? this.dataset.desktopLayout.includes('thumbnail')
          : this.dataset.mobileLayout === 'show';
      }

      canAnimate() {
        return typeof window.gsap !== 'undefined' && !this.reducedMotion.matches;
      }

      getViewerItems() {
        return Array.from(this.elements.viewer.querySelectorAll('.product__media-item[data-media-id]'));
      }

      getAdjacentMedia(step) {
        const items = this.getViewerItems();
        const current = items.findIndex((item) => item.classList.contains('is-active'));
        return current === -1 ? null : items[current + step];
      }

      onArrowClick(event) {
        const button = event.target.closest('.slider-buttons .slider-button');
        if (!button || !this.usesStage()) return;
        event.preventDefault();
        event.stopPropagation();

        const target = this.getAdjacentMedia(button.name === 'next' ? 1 : -1);
        if (target) this.setActiveMedia(target.dataset.mediaId, false);
      }

      updateArrows() {
        if (!this.usesStage()) return;
        const prev = this.elements.viewer.querySelector('.slider-buttons button[name="previous"]');
        const next = this.elements.viewer.querySelector('.slider-buttons button[name="next"]');
        if (!prev || !next) return;

        const items = this.getViewerItems();
        const current = items.findIndex((item) => item.classList.contains('is-active'));
        prev.toggleAttribute('disabled', current <= 0);
        next.toggleAttribute('disabled', current === -1 || current >= items.length - 1);
      }

      // Snapshot what the slide needs before the class swap hides the outgoing item.
      captureMediaTransition(outgoing, incoming) {
        if (!outgoing || outgoing === incoming || !this.usesStage() || !this.canAnimate()) return null;
        const items = this.getViewerItems();
        return {
          outgoing,
          incoming,
          direction: items.indexOf(incoming) > items.indexOf(outgoing) ? 1 : -1,
          box: { top: outgoing.offsetTop, left: outgoing.offsetLeft, width: outgoing.offsetWidth },
        };
      }

      // Directional slide: the incoming image travels in from the side it lives
      // on (right for next, left for previous) over the outgoing one, which
      // drifts the other way and fades. The outgoing item is pinned where it
      // sat, via .is-leaving, until the slide ends.
      playMediaTransition({ outgoing, incoming, direction, box }) {
        this.settleMediaTransition(outgoing);
        gsap.killTweensOf([outgoing, incoming]);

        // The theme's reveal-on-scroll fade replays whenever a hidden item is
        // shown again, and a CSS animation outranks GSAP's inline opacity.
        [outgoing, incoming].forEach((item) =>
          item.classList.remove('scroll-trigger', 'animate--fade-in', 'scroll-trigger--offscreen')
        );

        outgoing.classList.add('is-leaving');
        gsap.set(outgoing, { top: box.top, left: box.left, width: box.width });

        const timeline = gsap.timeline({
          defaults: { duration: 0.75, ease: 'power3.out' },
          onComplete: () => this.settleMediaTransition(),
        });
        timeline
          .to(outgoing, { xPercent: -30 * direction, opacity: 0 }, 0)
          .fromTo(incoming, { xPercent: 100 * direction }, { xPercent: 0 }, 0);

        this.mediaTransition = { timeline, outgoing, incoming };
      }

      // Ends the running slide at once. `carryOver` is an image the next slide
      // takes over mid-flight; it keeps its current offset so it doesn't jump.
      settleMediaTransition(carryOver) {
        const transition = this.mediaTransition;
        if (!transition) return;
        this.mediaTransition = null;
        transition.timeline.kill();
        transition.outgoing.classList.remove('is-leaving');
        gsap.set(transition.outgoing, { clearProps: 'transform,opacity,top,left,width' });
        if (transition.incoming !== carryOver) gsap.set(transition.incoming, { clearProps: 'transform' });
        this.updateArrows();
      }

      // Touch swipe for the single-image layouts. The image follows the finger
      // with some resistance; a long enough swipe steps to the neighbour with
      // the same slide as the arrows, a short one springs back.
      bindSwipe() {
        const list = this.elements.viewer.querySelector('.product__media-list');
        if (!list || this.closest('quick-add-modal')) return;
        let gesture = null;

        list.addEventListener('pointerdown', (event) => {
          this.suppressClick = false;
          if (event.pointerType === 'mouse' || !this.usesStage() || event.target.closest('model-viewer')) return;
          gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dragging: false };
        });

        list.addEventListener('pointermove', (event) => {
          if (!gesture || event.pointerId !== gesture.id) return;
          gesture.dx = event.clientX - gesture.x;
          if (!gesture.dragging) {
            if (Math.abs(gesture.dx) < 10) return;
            if (Math.abs(event.clientY - gesture.y) > Math.abs(gesture.dx)) {
              gesture = null;
              return;
            }
            gesture.dragging = true;
            if (this.canAnimate()) {
              this.settleMediaTransition();
              gsap.killTweensOf(this.getAdjacentMedia(0));
            }
          }
          if (!this.canAnimate()) return;
          const active = this.getAdjacentMedia(0);
          const resistance = this.getAdjacentMedia(gesture.dx < 0 ? 1 : -1) ? 0.35 : 0.12;
          gsap.set(active, { xPercent: (gesture.dx / list.clientWidth) * 100 * resistance });
        });

        const release = (event) => {
          if (!gesture || event.pointerId !== gesture.id) return;
          const { dx, dragging } = gesture;
          gesture = null;
          if (!dragging) return;

          this.suppressClick = true;
          const target = event.type === 'pointerup' && Math.abs(dx) > 40 && this.getAdjacentMedia(dx < 0 ? 1 : -1);
          if (target) {
            this.setActiveMedia(target.dataset.mediaId, false);
          } else if (this.canAnimate()) {
            gsap.to(this.getAdjacentMedia(0), { xPercent: 0, duration: 0.45, ease: 'power3.out', clearProps: 'transform' });
          }
        };
        list.addEventListener('pointerup', release);
        list.addEventListener('pointercancel', release);

        // A swipe that ends over the image must not also open the zoom modal.
        list.addEventListener(
          'click',
          (event) => {
            if (!this.suppressClick) return;
            this.suppressClick = false;
            event.preventDefault();
            event.stopPropagation();
          },
          true
        );
      }

      setActiveThumbnail(thumbnail) {
        if (!this.elements.thumbnails || !thumbnail) return;

        this.elements.thumbnails
          .querySelectorAll('button')
          .forEach((element) => element.removeAttribute('aria-current'));
        thumbnail.querySelector('button').setAttribute('aria-current', true);
        if (this.elements.thumbnails.isSlideVisible(thumbnail, 10)) return;

        this.elements.thumbnails.slider.scrollTo({ left: thumbnail.offsetLeft });
      }

      announceLiveRegion(activeItem, position) {
        const image = activeItem.querySelector('.product__modal-opener--image img');
        if (!image) return;
        image.onload = () => {
          this.elements.liveRegion.setAttribute('aria-hidden', false);
          this.elements.liveRegion.innerHTML = window.accessibilityStrings.imageAvailable.replace('[index]', position);
          setTimeout(() => {
            this.elements.liveRegion.setAttribute('aria-hidden', true);
          }, 2000);
        };
        image.src = image.src;
      }

      playActiveMedia(activeItem) {
        window.pauseAllMedia();
        const deferredMedia = activeItem.querySelector('.deferred-media');
        if (deferredMedia) deferredMedia.loadContent(false);
      }

      preventStickyHeader() {
        this.stickyHeader = this.stickyHeader || document.querySelector('sticky-header');
        if (!this.stickyHeader) return;
        this.stickyHeader.dispatchEvent(new Event('preventHeaderReveal'));
      }

      removeListSemantic() {
        if (!this.elements.viewer.slider) return;
        this.elements.viewer.slider.setAttribute('role', 'presentation');
        this.elements.viewer.sliderItems.forEach((slide) => slide.setAttribute('role', 'presentation'));
      }
    }
  );
}
