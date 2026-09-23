document.addEventListener('DOMContentLoaded', () => {
  const sections = document.querySelectorAll('.pdp-faqs-container[data-section-id]');

  sections.forEach((root) => {
    const items = Array.from(root.querySelectorAll('.pdp-faqs-item'));
    const heading = root.querySelector('.pdp-faqs-heading');
    const imageWrap = root.querySelector('.pdp-faqs-right');
    const image = root.querySelector('.pdp-faqs-right-image');
    if (items.length === 0) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasGsap = typeof window.gsap !== 'undefined';
    const revealEnabled = root.dataset.animationsEnabled === 'true' && !reduceMotion && hasGsap;
    const animateAccordion = !reduceMotion && hasGsap;

    const getParts = (item) => ({
      content: item.querySelector('.pdp-faqs-item-content'),
      answer: item.querySelector('.pdp-faqs-item-answer'),
      bar: item.querySelector('.pdp-faqs-item-icon-bar--v'),
    });

    function openItem(item) {
      const { content, answer, bar } = getParts(item);
      if (!content) return;
      item.setAttribute('open', '');
      gsap.killTweensOf(content);
      gsap.set(content, { height: 0 });
      gsap.to(content, {
        height: content.scrollHeight,
        duration: 0.55,
        ease: 'power3.out',
        onComplete: () => {
          content.style.height = 'auto';
        },
      });
      if (answer) {
        gsap.fromTo(
          answer,
          { opacity: 0, y: -10 },
          { opacity: 1, y: 0, duration: 0.45, delay: 0.12, ease: 'power2.out' }
        );
      }
      if (bar) gsap.to(bar, { rotate: 90, duration: 0.45, ease: 'back.out(2.2)' });
    }

    function closeItem(item) {
      const { content, answer, bar } = getParts(item);
      if (!content) return;
      gsap.killTweensOf(content);
      if (content.style.height === 'auto' || content.style.height === '') {
        content.style.height = `${content.scrollHeight}px`;
      }
      gsap.to(content, {
        height: 0,
        duration: 0.4,
        ease: 'power3.inOut',
        onComplete: () => {
          item.removeAttribute('open');
        },
      });
      if (answer) gsap.to(answer, { opacity: 0, y: -10, duration: 0.25, ease: 'power2.in' });
      if (bar) gsap.to(bar, { rotate: 0, duration: 0.4, ease: 'power3.inOut' });
    }

    if (animateAccordion) {
      items.forEach((item) => {
        const { content } = getParts(item);
        if (!content) return;
        content.style.height = item.hasAttribute('open') ? 'auto' : '0px';

        const summary = item.querySelector('.pdp-faqs-item-summary');
        if (!summary) return;
        summary.addEventListener('click', (event) => {
          event.preventDefault();
          const isOpen = item.hasAttribute('open');
          if (isOpen) {
            closeItem(item);
            return;
          }
          items.forEach((other) => {
            if (other !== item && other.hasAttribute('open')) closeItem(other);
          });
          openItem(item);
        });
      });
    }

    function initReveal() {
      const tl = gsap.timeline({ paused: true });
      if (heading) tl.to(heading, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' });
      tl.to(
        items,
        { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.12 },
        heading ? '-=0.5' : 0
      );
      if (imageWrap) {
        tl.to(imageWrap, { clipPath: 'inset(0 0 0 0%)', duration: 1, ease: 'power4.inOut' }, 0);
      }
      if (image) {
        tl.to(image, { scale: 1, duration: 1.1, ease: 'power3.out' }, 0);
      }

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            tl.play();
            observer.disconnect();
          });
        },
        // rootMargin fires this a bit before root actually enters the
        // screen, giving it a head start over the blank-space flash.
        { threshold: 0.2, rootMargin: '0px 0px 200px 0px' }
      );
      observer.observe(root);
    }

    if (revealEnabled) {
      if (heading) gsap.set(heading, { opacity: 0, y: -40 });
      gsap.set(items, { opacity: 0, y: -30 });
      if (imageWrap) gsap.set(imageWrap, { clipPath: 'inset(0 0 0 100%)' });
      if (image) gsap.set(image, { scale: 1.25 });
      initReveal();
    }

    if (!reduceMotion && hasGsap) {
      items.forEach((item) => {
        const summary = item.querySelector('.pdp-faqs-item-summary');
        const question = item.querySelector('.pdp-faqs-item-question');
        if (!summary || !question) return;
        summary.addEventListener('mouseenter', () => {
          gsap.to(question, { x: 8, duration: 0.3, ease: 'power2.out' });
        });
        summary.addEventListener('mouseleave', () => {
          gsap.to(question, { x: 0, duration: 0.3, ease: 'power2.out' });
        });
      });

      if (imageWrap && image) {
        imageWrap.addEventListener('mouseenter', () => {
          gsap.to(image, { scale: 1.06, duration: 0.6, ease: 'power2.out' });
        });
        imageWrap.addEventListener('mouseleave', () => {
          gsap.to(image, { scale: 1, duration: 0.6, ease: 'power2.out' });
        });
      }
    }

    root.addEventListener('shopify:block:select', (event) => {
      const item = event.target;
      if (!items.includes(item)) return;

      if (animateAccordion) {
        items.forEach((other) => {
          if (other !== item && other.hasAttribute('open')) closeItem(other);
        });
        if (!item.hasAttribute('open')) openItem(item);
      } else {
        items.forEach((other) => {
          if (other !== item) other.removeAttribute('open');
        });
        item.setAttribute('open', '');
      }
      item.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    });
  });
});
