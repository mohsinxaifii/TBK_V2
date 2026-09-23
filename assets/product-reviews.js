if (!customElements.get('product-reviews-carousel')) {
  customElements.define(
    'product-reviews-carousel',
    class ProductReviewsCarousel extends HTMLElement {
      static AUTOPLAY_MS = 3000;

      connectedCallback() {
        this.items = Array.from(this.querySelectorAll('.product-reviews__item'));
        this.list = this.querySelector('.product-reviews__list');
        this.prevButton = this.querySelector('.product-reviews__nav--prev');
        this.nextButton = this.querySelector('.product-reviews__nav--next');
        this.currentEl = this.querySelector('.product-reviews__pagination-current');

        if (!this.items.length || !this.prevButton || !this.nextButton) return;

        this.items.forEach((item) => item.removeAttribute('hidden'));

        this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.hasGsap = typeof window.gsap !== 'undefined';
        this.index = 0;
        this.isAnimating = false;
        this.autoplayId = null;

        this.items[this.index].classList.add('is-active');

        this.prevButton.addEventListener('click', () => {
          this.show(this.index - 1);
          this.restartAutoplay();
        });
        this.nextButton.addEventListener('click', () => {
          this.show(this.index + 1);
          this.restartAutoplay();
        });

        if (this.items.length > 1) {
          this.addEventListener('mouseenter', () => this.stopAutoplay());
          this.addEventListener('mouseleave', () => this.startAutoplay());
          this.addEventListener('focusin', () => this.stopAutoplay());
          this.addEventListener('focusout', () => this.startAutoplay());
          document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.stopAutoplay();
            else this.startAutoplay();
          });

          this.startAutoplay();
        }
      }

      parts(item) {
        return {
          el: item,
          quote: item.querySelector('.product-reviews__quote'),
          stars: Array.from(item.querySelectorAll('.product-reviews__star')),
          author: item.querySelector('.product-reviews__author'),
        };
      }

      startAutoplay() {
        if (this.items.length <= 1 || this.reduceMotion) return;
        this.stopAutoplay();
        this.autoplayId = window.setInterval(() => {
          this.show(this.index + 1, 'next');
        }, ProductReviewsCarousel.AUTOPLAY_MS);
      }

      stopAutoplay() {
        if (this.autoplayId) {
          window.clearInterval(this.autoplayId);
          this.autoplayId = null;
        }
      }

      restartAutoplay() {
        if (this.autoplayId) this.startAutoplay();
      }

      show(index) {
        const total = this.items.length;
        const nextIndex = ((index % total) + total) % total;

        if (this.isAnimating || nextIndex === this.index) return;

        const outgoing = this.parts(this.items[this.index]);
        const incoming = this.parts(this.items[nextIndex]);

        this.isAnimating = true;
        this.index = nextIndex;

        if (this.currentEl) this.currentEl.textContent = this.index + 1;

        if (this.hasGsap && !this.reduceMotion) {
          this.animateWithGsap(outgoing, incoming);
        } else {
          outgoing.el.classList.remove('is-active');
          incoming.el.classList.add('is-active');
          this.isAnimating = false;
        }
      }

      // Opacity-only crossfade — no translate or scale, per feedback that
      // the previous motion (position slide + scale pop) read as too loud.
      // The list's height tweens from the outgoing review to the incoming one
      // in the same timeline, so a longer or shorter review never jumps the
      // section or leaves blank space under it.
      animateWithGsap(outgoing, incoming) {
        const list = this.list;
        const from = list ? list.getBoundingClientRect().height : 0;

        // Pin the current height first: the swap below takes the outgoing
        // review out of flow, which would otherwise snap the list straight to
        // the new size. overflow:hidden lets the box reveal/trim the reviews
        // cleanly while it resizes.
        if (list) gsap.set(list, { height: from, overflow: 'hidden' });

        gsap.set(outgoing.el, { opacity: 1 });
        outgoing.el.classList.remove('is-active');
        outgoing.el.classList.add('is-leaving');
        outgoing.el.style.zIndex = 1;

        incoming.el.classList.add('is-active');
        incoming.el.style.zIndex = 2;
        gsap.set([incoming.el, incoming.quote, incoming.stars, incoming.author], { opacity: 0 });

        // Measured after the swap, now that the incoming review is the one in flow.
        const to = incoming.el.getBoundingClientRect().height;

        const tl = gsap.timeline({
          defaults: { ease: 'power2.out' },
          onComplete: () => {
            outgoing.el.classList.remove('is-leaving');
            outgoing.el.style.zIndex = '';
            incoming.el.style.zIndex = '';
            gsap.set(outgoing.el, { clearProps: 'opacity' });
            gsap.set([incoming.el, incoming.quote, incoming.stars, incoming.author], {
              clearProps: 'opacity',
            });
            // Back to auto, so the list keeps following its review on resize.
            if (list) gsap.set(list, { clearProps: 'height,overflow' });
            this.isAnimating = false;
          },
        });

        if (list) tl.to(list, { height: to, duration: 0.6, ease: 'power2.inOut' }, 0);

        tl
          .to(outgoing.el, { opacity: 0, duration: 0.35 }, 0)
          .to(incoming.el, { opacity: 1, duration: 0.1 }, 0.2)
          .to(incoming.quote, { opacity: 1, duration: 0.45 }, 0.2)
          .to(incoming.stars, { opacity: 1, duration: 0.4, stagger: 0.04 }, 0.25)
          .to(incoming.author, { opacity: 1, duration: 0.4 }, 0.3);
      }
    }
  );
}

// Trust-badge row: stays a single static line whenever the text fits: only
// switches into a cloned, auto-scrolling marquee once it doesn't, instead of
// ever wrapping onto a second line. Re-evaluated on resize in both
// directions, so a shrink can turn it on and a subsequent widen turns it
// back off.
document.addEventListener('DOMContentLoaded', () => {
  const rows = document.querySelectorAll('[data-product-reviews-trust-marquee]');
  if (!rows.length) return;

  rows.forEach((viewport) => {
    const track = viewport.querySelector('[data-product-reviews-trust-track]');
    const originalSet = track && track.querySelector('.product-reviews__trust-set');
    if (!track || !originalSet) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasGsap = typeof window.gsap !== 'undefined';
    const speed = 30; // px per second

    let repeatWidth = 0;
    let x = 0;
    let autoplay = true;
    let active = false;
    let tickerFn = null;

    const clearClones = () => {
      track.querySelectorAll('.product-reviews__trust-set:not(:first-child)').forEach((el) => el.remove());
    };

    const cloneSet = () => {
      const clone = originalSet.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild(clone);
    };

    const setX = (value) => {
      if (repeatWidth <= 0) return;
      let wrapped = value % repeatWidth;
      if (wrapped > 0) wrapped -= repeatWidth;
      x = wrapped;
      track.style.transform = `translate3d(${x}px, 0, 0)`;
    };

    const stop = () => {
      if (!active) return;
      active = false;
      if (hasGsap && tickerFn) gsap.ticker.remove(tickerFn);
      tickerFn = null;
      viewport.classList.remove('is-marquee');
      track.style.transform = '';
      clearClones();
    };

    const start = () => {
      if (active) return;
      active = true;
      viewport.classList.add('is-marquee');

      // .is-marquee turns each .trust-set into a real (non-shrinking) flex
      // box instead of display:contents — clone enough copies to cover at
      // least two full viewport-widths so the modulo wrap in setX() never
      // runs out of track before looping back.
      const viewportWidth = viewport.getBoundingClientRect().width || 1;
      let guard = 0;
      while (track.scrollWidth < viewportWidth * 2 + 200 && guard < 20) {
        cloneSet();
        guard += 1;
      }

      const secondSet = track.children[1];
      repeatWidth = secondSet ? secondSet.offsetLeft - track.children[0].offsetLeft : track.scrollWidth;
      x = 0;
      track.style.transform = 'translate3d(0, 0, 0)';

      // Reduced motion: stay on the cloned/masked layout (so it doesn't
      // wrap) but skip the actual scroll animation.
      if (reduceMotion) return;

      if (hasGsap) {
        tickerFn = (time, deltaMs) => {
          if (!autoplay) return;
          setX(x - (speed * deltaMs) / 1000);
        };
        gsap.ticker.add(tickerFn);
      } else {
        let last = performance.now();
        const raf = (now) => {
          if (!active) return;
          const dt = (now - last) / 1000;
          last = now;
          if (autoplay) setX(x - speed * dt);
          requestAnimationFrame(raf);
        };
        requestAnimationFrame(raf);
      }
    };

    // Un-cloned, un-clipped natural width of the content vs. the viewport —
    // measured with the marquee torn down so a prior clone pass can't
    // throw off the comparison.
    const evaluate = () => {
      stop();
      const fits = track.scrollWidth <= viewport.getBoundingClientRect().width;
      if (!fits) start();
    };

    evaluate();
    window.addEventListener('resize', evaluate);

    viewport.addEventListener('mouseenter', () => {
      autoplay = false;
    });
    viewport.addEventListener('mouseleave', () => {
      autoplay = true;
    });
  });
});
