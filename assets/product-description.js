if (!customElements.get('product-description-toggle')) {
  customElements.define(
    'product-description-toggle',
    class ProductDescriptionToggle extends HTMLElement {
      constructor() {
        super();
        this.lineClamp = 3;
        this.expanded = false;
      }

      connectedCallback() {
        this.textEl = this.querySelector('.product__description');
        this.toggleButton = this.querySelector('.product__description-toggle');

        if (!this.textEl || !this.toggleButton || typeof gsap === 'undefined') return;

        this.readMoreLabel = this.toggleButton.dataset.readMore || this.toggleButton.textContent.trim();
        this.showLessLabel = this.toggleButton.dataset.showLess || this.readMoreLabel;

        this.wrapWords();
        this.measure();

        this.toggleButton.addEventListener('click', this.onToggle.bind(this));

        this.resizeHandler = this.debounce(() => {
          if (!this.expanded) this.measure();
        }, 200);
        window.addEventListener('resize', this.resizeHandler);
      }

      wrapWords() {
        const walker = document.createTreeWalker(this.textEl, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) {
          if (node.textContent.trim() !== '') textNodes.push(node);
        }

        textNodes.forEach((textNode) => {
          const fragment = document.createDocumentFragment();
          textNode.textContent.split(/(\s+)/).forEach((chunk) => {
            if (chunk === '') return;
            if (chunk.trim() === '') {
              fragment.appendChild(document.createTextNode(chunk));
            } else {
              const span = document.createElement('span');
              span.className = 'product__description-word';
              span.textContent = chunk;
              fragment.appendChild(span);
            }
          });
          textNode.parentNode.replaceChild(fragment, textNode);
        });

        this.words = this.textEl.querySelectorAll('.product__description-word');
      }

      // Measures the natural (unclamped) layout to find which words fall past line 3,
      // then hands the element back to the CSS line-clamp fallback so the native "…" shows at rest.
      measure() {
        if (!this.words || !this.words.length) return;

        this.textEl.style.display = 'block';
        this.textEl.style.webkitLineClamp = 'unset';
        this.textEl.style.webkitBoxOrient = 'unset';
        this.textEl.style.height = 'auto';
        this.textEl.style.overflow = 'visible';

        const lineHeight = parseFloat(getComputedStyle(this.textEl).lineHeight) || 28;
        this.collapsedHeight = lineHeight * this.lineClamp;
        const containerTop = this.textEl.getBoundingClientRect().top;

        this.hiddenWords = Array.from(this.words).filter((word) => {
          return word.getBoundingClientRect().top - containerTop >= this.collapsedHeight - 2;
        });

        const fullHeight = this.textEl.scrollHeight;
        const overflows = this.hiddenWords.length > 0 && fullHeight > this.collapsedHeight + 2;

        this.textEl.style.display = '';
        this.textEl.style.webkitLineClamp = '';
        this.textEl.style.webkitBoxOrient = '';
        this.textEl.style.height = '';
        this.textEl.style.overflow = '';
        gsap.set(this.words, { clearProps: 'opacity,transform' });
        this.words.forEach((word) => word.classList.remove('is-hidden-word'));

        this.toggleButton.hidden = !overflows;
        this.classList.remove('is-expanded');
      }

      onToggle() {
        if (this.expanded) {
          this.collapse();
        } else {
          this.expand();
        }
      }

      expand() {
        if (this.currentTimeline) this.currentTimeline.kill();

        this.expanded = true;
        this.toggleButton.setAttribute('aria-expanded', 'true');
        this.toggleButton.textContent = this.showLessLabel;
        this.classList.add('is-expanded');

        // Switch off the native line-clamp and pin to the collapsed pixel height so it can be animated open.
        gsap.set(this.textEl, {
          display: 'block',
          webkitLineClamp: 'unset',
          height: this.collapsedHeight,
          overflow: 'hidden',
        });
        gsap.set(this.hiddenWords, { opacity: 0, y: 8 });
        this.hiddenWords.forEach((word) => word.classList.add('is-hidden-word'));

        const fullHeight = this.getFullHeight();

        const timeline = gsap.timeline({
          onComplete: () => {
            this.textEl.style.height = 'auto';
            this.textEl.style.overflow = 'visible';
            this.hiddenWords.forEach((word) => word.classList.remove('is-hidden-word'));
            this.currentTimeline = null;
          },
        });
        this.currentTimeline = timeline;

        timeline.to(this.textEl, { height: fullHeight, duration: 0.6, ease: 'power2.out' }, 0);
        timeline.to(
          this.hiddenWords,
          {
            opacity: 1,
            y: 0,
            duration: 0.4,
            stagger: 0.015,
            ease: 'power2.out',
          },
          0.1
        );
      }

      collapse() {
        if (this.currentTimeline) this.currentTimeline.kill();

        this.expanded = false;
        this.toggleButton.setAttribute('aria-expanded', 'false');
        this.toggleButton.textContent = this.readMoreLabel;
        this.classList.remove('is-expanded');
        this.hiddenWords.forEach((word) => word.classList.add('is-hidden-word'));

        gsap.set(this.textEl, { height: this.textEl.scrollHeight, overflow: 'hidden' });

        const timeline = gsap.timeline({
          onComplete: () => {
            this.currentTimeline = null;
            // Hand back to the native CSS line-clamp so the "…" reappears.
            this.textEl.style.display = '';
            this.textEl.style.webkitLineClamp = '';
            this.textEl.style.webkitBoxOrient = '';
            this.textEl.style.height = '';
            this.textEl.style.overflow = '';
            gsap.set(this.hiddenWords, { clearProps: 'opacity,transform' });
            this.scrollIntoViewIfCollapsedAboveFold();
          },
        });
        this.currentTimeline = timeline;

        timeline.to(
          this.hiddenWords,
          {
            opacity: 0,
            y: 8,
            duration: 0.25,
            stagger: { each: 0.008, from: 'end' },
            ease: 'power1.in',
          },
          0
        );
        timeline.to(this.textEl, { height: this.collapsedHeight, duration: 0.45, ease: 'power2.inOut' }, 0.1);
      }

      scrollIntoViewIfCollapsedAboveFold() {
        const rect = this.getBoundingClientRect();
        if (rect.top < 0) {
          this.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }

      getFullHeight() {
        const previousHeight = this.textEl.style.height;
        const previousOverflow = this.textEl.style.overflow;
        this.textEl.style.height = 'auto';
        this.textEl.style.overflow = 'visible';
        const height = this.textEl.scrollHeight;
        this.textEl.style.height = previousHeight;
        this.textEl.style.overflow = previousOverflow;
        return height;
      }

      debounce(fn, wait) {
        let timeoutId;
        return (...args) => {
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => fn(...args), wait);
        };
      }

      disconnectedCallback() {
        if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
      }
    }
  );
}
