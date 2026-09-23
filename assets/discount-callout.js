if (!customElements.get('discount-callout-copy')) {
  customElements.define(
    'discount-callout-copy',
    class DiscountCalloutCopy extends HTMLElement {
      connectedCallback() {
        this.button = this.querySelector('.discount-callout__button');
        this.defaultEl = this.querySelector('.discount-callout__default');
        this.copiedEl = this.querySelector('.discount-callout__copied');
        this.code = this.dataset.code;

        if (!this.button || !this.defaultEl || !this.copiedEl || typeof gsap === 'undefined') return;

        gsap.set(this.copiedEl, { autoAlpha: 0, y: 6 });

        this.animating = false;
        this.button.addEventListener('click', this.onClick.bind(this));
      }

      onClick() {
        if (this.animating || !this.code || !navigator.clipboard) return;

        navigator.clipboard
          .writeText(this.code)
          .then(() => this.playCopiedAnimation())
          .catch(() => {});
      }

      playCopiedAnimation() {
        this.animating = true;

        const timeline = gsap.timeline({
          onComplete: () => {
            this.animating = false;
          },
        });

        timeline
          .to(this.defaultEl, { autoAlpha: 0, y: -6, duration: 0.25, ease: 'power1.in' })
          .to(this.copiedEl, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power2.out' }, '<0.05')
          .to({}, { duration: 1.2 })
          .to(this.copiedEl, { autoAlpha: 0, y: -6, duration: 0.25, ease: 'power1.in' })
          .to(this.defaultEl, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power2.out' }, '<0.05');
      }
    }
  );
}
