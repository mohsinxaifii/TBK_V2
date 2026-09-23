/*
 * Sitewide animation choreography — one motion language on every template:
 *   - headings: masked word/char rise (the typographic signature)
 *   - editorial imagery: curtain clip reveals + slow scrubbed drift
 *   - hairlines: drawn in from their origin
 *   - lists/cards: soft cascades, power4.out, short distances
 * Every reveal fires once; scrubbed effects are the only persistent motion.
 * Animators are keyed to section markup, so any template composed of these
 * sections inherits the treatment automatically.
 *
 * Coordination with existing scripts (never animate the same nodes):
 *   - archive-hero-parallax.js owns the archive article hero's entrance.
 *   - custom-home-testimonials.js owns the testimonial cards.
 *   - custom-blogs-carousel.js owns the nodes INSIDE each slide.
 *   - blog-listing-header.js owns the expandable description's words.
 *   - custom_pdp_faqs.js and bullets-scroller.js have their own motion.
 *   - Legacy initScrollReveal scripts check data-ha-claimed and stand down.
 */
(() => {
  const main = document.querySelector('main#MainContent');
  if (!main) return;

  const hasGsap = typeof window.gsap !== 'undefined';
  const hasST = typeof window.ScrollTrigger !== 'undefined';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const designMode = window.Shopify && window.Shopify.designMode;
  if (!hasGsap || !hasST || reduceMotion || designMode) return;

  gsap.registerPlugin(ScrollTrigger);

  const EASE_OUT = 'power4.out';
  const EASE_MASK = 'power3.inOut';
  const CLIP_DOWN = 'inset(0% 0% 100% 0%)';
  const CLIP_LEFT = 'inset(0% 100% 0% 0%)';
  const CLIP_NONE = 'inset(0% 0% 0% 0%)';

  const $ = (sel, root = main) => root.querySelector(sel);
  const $$ = (sel, root = main) => Array.from(root.querySelectorAll(sel));

  /* ---------------------------------------------------------------- *
   * Text splitting — masked rise without SplitText.
   * ---------------------------------------------------------------- */
  const wrapUnit = (doc, text) => {
    const mask = doc.createElement('span');
    mask.className = 'ha-mask';
    const inner = doc.createElement('span');
    inner.className = 'ha-unit';
    inner.textContent = text;
    mask.appendChild(inner);
    return mask;
  };

  const splitNode = (node, units, mode) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      Array.from(node.childNodes).forEach((child) => splitNode(child, units, mode));
      return;
    }
    if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) return;

    const doc = node.ownerDocument;
    const frag = doc.createDocumentFragment();
    if (mode === 'chars') {
      Array.from(node.textContent).forEach((ch) => {
        if (/\s/.test(ch) || ch === ' ') {
          frag.appendChild(doc.createTextNode(ch));
        } else {
          const mask = wrapUnit(doc, ch);
          units.push(mask.firstChild);
          frag.appendChild(mask);
        }
      });
    } else {
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          frag.appendChild(doc.createTextNode(part));
        } else {
          const mask = wrapUnit(doc, part);
          units.push(mask.firstChild);
          frag.appendChild(mask);
        }
      });
    }
    node.parentNode.replaceChild(frag, node);
  };

  const split = (el, mode = 'words') => {
    if (!el || el.dataset.haSplit) return [];
    el.dataset.haSplit = mode;
    const units = [];
    splitNode(el, units, mode);
    return units;
  };

  /* Once the rise settles, drop the masks' overflow so descenders and
   * italic overshoots are never clipped at rest. */
  const releaseMasks = (el) => {
    if (!el) return;
    el.querySelectorAll('.ha-mask').forEach((m) => {
      m.style.overflow = 'visible';
    });
  };

  const maskRise = (tl, heading, position = 0, stagger = 0.055) => {
    if (!heading || !heading.units.length) return;
    tl.to(
      heading.units,
      {
        yPercent: 0,
        duration: 1.15,
        ease: EASE_OUT,
        stagger,
        onComplete: () => releaseMasks(heading.el),
      },
      position
    );
  };

  const onEnter = (trigger, buildFn, start = 'top 90%') => {
    ScrollTrigger.create({ trigger, start, once: true, onEnter: buildFn });
  };

  /* Initial hidden states are applied at script execution (deferred
   * scripts run pre-paint), so there is no flash of moving content. */
  const prep = (targets, vars) => {
    let els = typeof targets === 'string' ? $$(targets) : targets;
    els = (els || []).filter(Boolean);
    if (els.length) gsap.set(els, vars);
    return els;
  };

  const prepHeading = (el, mode = 'words') => {
    if (!el) return null;
    const units = split(el, mode);
    if (!units.length) return null;
    gsap.set(units, { yPercent: 120 });
    return { el, units };
  };

  /* Common recipes ------------------------------------------------- */
  const fadeRise = (tl, els, position, opts = {}) => {
    const targets = (Array.isArray(els) ? els : [els]).filter(Boolean);
    if (!targets.length) return;
    tl.to(
      targets,
      { autoAlpha: 1, y: 0, scale: 1, duration: opts.duration || 0.95, ease: EASE_OUT, stagger: opts.stagger || 0 },
      position
    );
  };

  const clipReveal = (tl, els, position, opts = {}) => {
    const targets = (Array.isArray(els) ? els : [els]).filter(Boolean);
    if (!targets.length) return;
    tl.to(
      targets,
      {
        clipPath: CLIP_NONE,
        duration: opts.duration || 1.35,
        ease: EASE_MASK,
        stagger: opts.stagger || 0,
        onComplete: () => gsap.set(targets, { clearProps: 'clipPath' }),
      },
      position
    );
  };

  const drawLine = (tl, els, position, opts = {}) => {
    const targets = (Array.isArray(els) ? els : [els]).filter(Boolean);
    if (!targets.length) return;
    tl.to(targets, { scaleX: 1, scaleY: 1, duration: opts.duration || 1.2, ease: EASE_MASK, stagger: opts.stagger || 0 }, position);
  };

  const kenBurns = (trigger, imgs, maxScale = 1.12) => {
    const targets = (Array.isArray(imgs) ? imgs : [imgs]).filter(Boolean);
    if (!targets.length) return;
    gsap.fromTo(
      targets,
      { scale: 1 },
      {
        scale: maxScale,
        ease: 'none',
        scrollTrigger: { trigger, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
      }
    );
  };

  /* ================================================================ *
   * Animator registry. register() runs prep immediately (pre-paint);
   * each build runs later once ScrollTrigger is wired up.
   * ================================================================ */
  const animators = [];
  const register = (selector, def) => {
    $$(selector).forEach((root) => {
      if (def.claim) root.dataset.haClaimed = 'true';
      const ctx = { root };
      if (def.prep) def.prep(ctx);
      animators.push({ def, ctx });
    });
  };

  // Dawn's own scroll-triggered reveal would double-animate what this
  // file owns — neutralize its hooks inside main and take over.
  $$('.scroll-trigger').forEach((el) => {
    el.classList.remove('scroll-trigger', 'animate--slide-in', 'animate--fade-in', 'scroll-trigger--offscreen');
    el.removeAttribute('data-cascade');
  });

  /* ---- Hero banner (home, rituals): cinematic open ---- */
  register('.custom-banner-pin-space', {
    prep(ctx) {
      ctx.sticky = $('.custom-banner-sticky', ctx.root);
      ctx.frame = $('.custom-banner-container', ctx.root);
    },
    build(ctx) {
      if (!ctx.sticky || !ctx.frame) return;
      const veil = document.createElement('div');
      veil.className = 'ha-hero-veil';
      ctx.sticky.appendChild(veil);
      gsap
        .timeline({ onComplete: () => veil.remove() })
        .fromTo(ctx.frame, { scale: 1.06 }, { scale: 1, duration: 2.2, ease: 'expo.out' }, 0)
        .to(veil, { autoAlpha: 0, duration: 1.4, ease: 'power2.inOut' }, 0.1);
    },
  });

  /* ---- Featured product (home) ---- */
  register('.custom-featured-product-container', {
    prep(ctx) {
      const s = ctx.root;
      ctx.card = $('.custom-featured-product-left', s);
      ctx.caption = $('.custom-featured-product-left-inner_upper > p:first-child', s);
      ctx.heading = prepHeading($('.custom-featured-product-left-inner_upper > p:nth-child(2)', s));
      ctx.description = $$('.custom-featured-product-left-description p', s);
      ctx.purchase = $$('.custom-featured-product__purchase > *', s);
      ctx.lower = $$('.custom-featured-product-left-inner_lower > *', s);
      ctx.rule = $('.custom-featured-product-right hr', s);
      ctx.rail = $('.custom-featured-product-right p', s);
      // Reversed layout pins the caption to the left, so the keyline
      // has to grow the other way to keep reading as one gesture.
      const reversed = s.classList.contains('custom-featured-product-container--reversed');

      prep([ctx.card], { autoAlpha: 0, y: -64, scale: 0.985 });
      prep([ctx.caption], { autoAlpha: 0, y: -22 });
      prep(ctx.description, { autoAlpha: 0, y: -26 });
      prep(ctx.purchase, { autoAlpha: 0, y: -22 });
      prep(ctx.lower, { autoAlpha: 0, y: -22 });
      prep([ctx.rule], { scaleX: 0, transformOrigin: reversed ? 'right center' : 'left center' });
      prep([ctx.rail], { autoAlpha: 0, y: -14 });
    },
    build(ctx) {
      if (!ctx.card) return;
      onEnter(
        ctx.root,
        () => {
          const tl = gsap.timeline({ defaults: { ease: EASE_OUT } });
          fadeRise(tl, ctx.card, 0, { duration: 1.35 });
          drawLine(tl, ctx.rule, 0.15, { duration: 1.3 });
          fadeRise(tl, ctx.rail, 0.75, { duration: 0.9 });
          fadeRise(tl, ctx.caption, 0.35, { duration: 0.8 });
          maskRise(tl, ctx.heading, 0.45);
          fadeRise(tl, ctx.description, 0.65, { stagger: 0.12 });
          fadeRise(tl, ctx.purchase, 0.85, { duration: 0.85, stagger: 0.1 });
          fadeRise(tl, ctx.lower, 1.05, { duration: 0.85, stagger: 0.1 });
        },
        'top 82%'
      );
    },
  });

  /* ---- Collection shell: subtitle + heading (featured collection,
   *      collection page wrapper) ---- */
  register('.collection', {
    prep(ctx) {
      ctx.subtitle = $('.collection__subtitle', ctx.root);
      ctx.heading = prepHeading($('.collection__title .title', ctx.root));
      prep([ctx.subtitle], { autoAlpha: 0, y: -18 });
    },
    build(ctx) {
      if (!ctx.subtitle && !ctx.heading) return;
      onEnter(ctx.root, () => {
        const tl = gsap.timeline();
        fadeRise(tl, ctx.subtitle, 0, { duration: 0.8 });
        maskRise(tl, ctx.heading, 0.1);
      });
    },
  });

  /* ---- Card grids: featured collection, collection page, search,
   *      related products, list-collections ---- */
  register('ul.product-grid, ul.collection-list', {
    prep(ctx) {
      ctx.cards = $$(':scope > .grid__item', ctx.root);
      ctx.nav = ctx.root.closest('slider-component, .collection')
        ? $('.slider-buttons', ctx.root.closest('slider-component, .collection'))
        : null;
      prep(ctx.cards, { autoAlpha: 0, y: -54, scale: 0.97 });
      prep([ctx.nav], { autoAlpha: 0 });
    },
    build(ctx) {
      if (!ctx.cards.length) return;
      onEnter(
        ctx.root,
        () => {
          gsap.to(ctx.cards, {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 1.15,
            ease: EASE_OUT,
            stagger: 0.09,
            // clearProps: a lingering transform would re-anchor any
            // position:fixed content inside a card (quick-add modals).
            onComplete: () => gsap.set(ctx.cards, { clearProps: 'transform' }),
          });
          if (ctx.nav) gsap.to(ctx.nav, { autoAlpha: 1, duration: 0.8, delay: 0.6, ease: 'power2.out' });
        },
        'top 92%'
      );
    },
  });

  /* ---- Audio story (home, product) ---- */
  register('.custom-audio-player-container', {
    prep(ctx) {
      const s = ctx.root;
      ctx.bgs = $$('.custom-audio-player_desktop-image, .custom-audio-player_mobile-image', s);
      ctx.puppets = $$('.custom-audio-player_puppet_right-image, .custom-audio-player_puppet_left-image', s);
      ctx.card = $('.custom-audio-player-card', s);
      ctx.heading = prepHeading($('.custom-audio-player-heading', s));
      ctx.controls = $$(
        '.custom-audio-player-controls, .custom-audio-player-subtitles, .custom-audio-player-language-switcher',
        s
      );
      prep(ctx.bgs, { scale: 1.12 });
      prep(ctx.puppets, { autoAlpha: 0 });
      prep([ctx.card], { autoAlpha: 0, y: 54 });
      prep(ctx.controls, { autoAlpha: 0, y: 18 });
    },
    build(ctx) {
      if (ctx.bgs.length) {
        gsap.fromTo(
          ctx.bgs,
          { yPercent: -5 },
          {
            yPercent: 5,
            ease: 'none',
            scrollTrigger: { trigger: ctx.root, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
          }
        );
      }
      onEnter(
        ctx.root,
        () => {
          const tl = gsap.timeline({ defaults: { ease: EASE_OUT } });
          fadeRise(tl, ctx.card, 0, { duration: 1.25 });
          maskRise(tl, ctx.heading, 0.25);
          fadeRise(tl, ctx.controls, 0.55, { duration: 0.9, stagger: 0.12 });
          if (ctx.puppets.length) {
            tl.to(ctx.puppets, { autoAlpha: 1, duration: 1.3, ease: 'power2.inOut', stagger: 0.2 }, 0.5);
          }
        },
        'top 68%'
      );
    },
  });

  /* ---- Banner text (home, rituals) ---- */
  register('.custom-banner-text-container', {
    prep(ctx) {
      ctx.imgs = $$('img', ctx.root);
      ctx.heading = prepHeading($('p', ctx.root));
    },
    build(ctx) {
      kenBurns(ctx.root, ctx.imgs, 1.14);
      if (ctx.heading) {
        onEnter(
          ctx.root,
          () => {
            maskRise(gsap.timeline(), ctx.heading, 0, 0.07);
          },
          'top 76%'
        );
      }
    },
  });

  /* ---- Image grids (gallery + social rows, most templates) ---- */
  register('.custom-images-grid_carousal-container', {
    claim: true,
    prep(ctx) {
      ctx.imgs = prep($$('img, video', ctx.root), { clipPath: CLIP_DOWN });
    },
    build(ctx) {
      if (!ctx.imgs.length) return;
      onEnter(
        ctx.root,
        () => {
          clipReveal(gsap.timeline(), ctx.imgs, 0, { stagger: 0.14 });
        },
        'top 88%'
      );
    },
  });

  /* ---- Values (home) ---- */
  register('.custom-home_values-container', {
    prep(ctx) {
      ctx.heading = prepHeading($('.custom-home_values-heading', ctx.root));
      ctx.items = prep($$('.custom-home_values-item', ctx.root), { autoAlpha: 0, y: -34, scale: 0.95 });
    },
    build(ctx) {
      onEnter(ctx.root, () => {
        const tl = gsap.timeline();
        maskRise(tl, ctx.heading, 0);
        fadeRise(tl, ctx.items, 0.35, { duration: 1.05, stagger: 0.1 });
      });
    },
  });

  /* ---- Blogs carousel (home) — wrappers only ---- */
  register('.custom-blogs-carousel-container', {
    prep(ctx) {
      ctx.media = prep($$('.custom-blogs-carousel-media', ctx.root), { clipPath: CLIP_LEFT });
      ctx.content = prep($$('.custom-blogs-carousel-content', ctx.root), { autoAlpha: 0, y: -38 });
      ctx.nav = prep($$('.custom-blogs-carousel-nav', ctx.root), { autoAlpha: 0 });
    },
    build(ctx) {
      onEnter(
        ctx.root,
        () => {
          const tl = gsap.timeline();
          clipReveal(tl, ctx.media, 0, { duration: 1.4 });
          fadeRise(tl, ctx.content, 0.45, { duration: 1.1 });
          if (ctx.nav.length) tl.to(ctx.nav, { autoAlpha: 1, duration: 0.8, ease: 'power2.out' }, 1.0);
        },
        'top 80%'
      );
    },
  });

  /* ---- Testimonials (home) — cards stay owned by their own script ---- */
  register('.custom-home-testimonials-container', {
    prep(ctx) {
      ctx.bg = $('.custom-home-testimonials-bg-image', ctx.root);
      ctx.caption = $('.custom-home-testimonials-caption', ctx.root);
      ctx.heading = prepHeading($('.custom-home-testimonials-heading', ctx.root));
      ctx.footer = $('.custom-home-testimonials-footer', ctx.root);
      prep([ctx.caption], { autoAlpha: 0, y: -16 });
      prep([ctx.footer], { autoAlpha: 0, y: -20 });
    },
    build(ctx) {
      kenBurns(ctx.root, ctx.bg, 1.1);
      onEnter(ctx.root, () => {
        const tl = gsap.timeline();
        fadeRise(tl, ctx.caption, 0, { duration: 0.8 });
        maskRise(tl, ctx.heading, 0.12);
        fadeRise(tl, ctx.footer, 0.6, { duration: 0.9 });
      });
    },
  });

  /* ---- Image + content portrait (home "Karigars") ---- */
  register('.custom-image-content-container', {
    prep(ctx) {
      const s = ctx.root;
      ctx.portrait = $('.custom-image-content-image', s);
      ctx.portraitImg = $('.custom-image-content-image img', s);
      ctx.header = $('.custom-image-content-inner-container > p', s);
      ctx.heading = prepHeading($('.custom-image-content-inner-container h3', s));
      ctx.body = $$('.custom-image-content-description p', s);
      prep([ctx.portrait], { clipPath: CLIP_DOWN });
      prep([ctx.portraitImg], { scale: 1.16 });
      prep([ctx.header], { autoAlpha: 0, y: -16 });
      prep(ctx.body, { autoAlpha: 0, y: -24 });
    },
    build(ctx) {
      onEnter(
        ctx.root,
        () => {
          const tl = gsap.timeline({ defaults: { ease: EASE_OUT } });
          if (ctx.portrait) {
            clipReveal(tl, ctx.portrait, 0, { duration: 1.4 });
            if (ctx.portraitImg) tl.to(ctx.portraitImg, { scale: 1, duration: 1.9, ease: 'expo.out' }, 0.1);
          }
          fadeRise(tl, ctx.header, 0.35, { duration: 0.8 });
          maskRise(tl, ctx.heading, 0.45);
          fadeRise(tl, ctx.body, 0.6, { stagger: 0.1 });
        },
        'top 84%'
      );
    },
  });

  /* ---- Big display heading strip ("Follow Us", most templates) ---- */
  register('.custom-bg-heading-container', {
    claim: true,
    prep(ctx) {
      ctx.heading = prepHeading($('.custom-bg-heading', ctx.root), 'chars');
    },
    build(ctx) {
      if (!ctx.heading) return;
      onEnter(
        ctx.root,
        () => {
          maskRise(gsap.timeline(), ctx.heading, 0, 0.045);
        },
        'top 92%'
      );
    },
  });

  /* ---- Page top banner (about, archives) ---- */
  register('.page-top-banner-container', {
    claim: true,
    prep(ctx) {
      const inner = $('.page-top-banner-container-inner', ctx.root);
      if (!inner) return;
      const texts = $$('p', inner);
      ctx.title = prepHeading(texts[0]);
      ctx.rule = $('hr', inner);
      ctx.shopName = texts[1];
      prep([ctx.rule], { scaleX: 0, transformOrigin: 'left center' });
      prep([ctx.shopName], { autoAlpha: 0, y: -14 });
    },
    build(ctx) {
      // Top-of-page banner: play on load rather than on scroll.
      const tl = gsap.timeline({ delay: 0.15 });
      maskRise(tl, ctx.title, 0);
      drawLine(tl, ctx.rule, 0.35, { duration: 1.1 });
      fadeRise(tl, ctx.shopName, 0.55, { duration: 0.8 });
    },
  });

  /* ---- Story text (about) ---- */
  register('.custom-story-text', {
    claim: true,
    prep(ctx) {
      ctx.heading = prepHeading($('.custom-story-text-heading', ctx.root));
      ctx.body = prep($$('.custom-story-text-body p', ctx.root), { autoAlpha: 0, y: -26 });
    },
    build(ctx) {
      onEnter(ctx.root, () => {
        const tl = gsap.timeline();
        maskRise(tl, ctx.heading, 0);
        fadeRise(tl, ctx.body, 0.3, { stagger: 0.12 });
      });
    },
  });

  /* ---- Inset image (about) ---- */
  register('.custom-inset-image-section', {
    claim: true,
    prep(ctx) {
      ctx.wrap = $('.custom-inset-image-wrap', ctx.root);
      ctx.img = $('.custom-inset-image-img', ctx.root);
      prep([ctx.wrap], { clipPath: CLIP_DOWN });
      prep([ctx.img], { scale: 1.14 });
    },
    build(ctx) {
      if (!ctx.wrap) return;
      onEnter(
        ctx.root,
        () => {
          const tl = gsap.timeline();
          clipReveal(tl, ctx.wrap, 0, { duration: 1.4 });
          if (ctx.img) tl.to(ctx.img, { scale: 1, duration: 1.9, ease: 'expo.out' }, 0.1);
        },
        'top 86%'
      );
    },
  });

  /* ---- Practices (about) ---- */
  register('.custom-practices', {
    claim: true,
    prep(ctx) {
      const s = ctx.root;
      ctx.heading = prepHeading($('.custom-practices-heading', s));
      ctx.body = prep($$('.custom-practices-body p', s), { autoAlpha: 0, y: -24 });
      ctx.imageWrap = $('.custom-practices-image', s);
      ctx.image = $('.custom-practices-image .custom-inset-image-img', s);
      ctx.rows = prep($$('.custom-practices-row', s), { autoAlpha: 0, y: -26 });
      prep([ctx.imageWrap], { clipPath: CLIP_DOWN });
      prep([ctx.image], { scale: 1.14 });
    },
    build(ctx) {
      onEnter(ctx.root, () => {
        const tl = gsap.timeline();
        maskRise(tl, ctx.heading, 0);
        fadeRise(tl, ctx.body, 0.3, { stagger: 0.12 });
      });
      if (ctx.imageWrap) {
        onEnter(
          ctx.imageWrap,
          () => {
            const tl = gsap.timeline();
            clipReveal(tl, ctx.imageWrap, 0, { duration: 1.4 });
            if (ctx.image) tl.to(ctx.image, { scale: 1, duration: 1.9, ease: 'expo.out' }, 0.1);
          },
          'top 88%'
        );
      }
      if (ctx.rows.length) {
        onEnter(
          ctx.rows[0],
          () => {
            gsap.to(ctx.rows, { autoAlpha: 1, y: 0, duration: 0.95, ease: EASE_OUT, stagger: 0.1 });
          },
          'top 94%'
        );
      }
    },
  });

  /* ---- Highlight banner (about) ---- */
  register('.custom-highlight-banner-container', {
    claim: true,
    prep(ctx) {
      ctx.eyebrow = $('.custom-highlight-banner-eyebrow', ctx.root);
      ctx.heading = prepHeading($('.custom-highlight-banner-heading', ctx.root));
      ctx.body = prep($$('.custom-highlight-banner-body p', ctx.root), { autoAlpha: 0, y: -24 });
      prep([ctx.eyebrow], { autoAlpha: 0, y: -16 });
    },
    build(ctx) {
      onEnter(ctx.root, () => {
        const tl = gsap.timeline();
        fadeRise(tl, ctx.eyebrow, 0, { duration: 0.8 });
        maskRise(tl, ctx.heading, 0.12);
        fadeRise(tl, ctx.body, 0.45, { stagger: 0.12 });
      });
    },
  });

  /* ---- Behind the craft (about) ----
   * Heading rises on entry; each person row then plays on its own as it
   * scrolls in: the photo settles inside its frame while the eyebrow /
   * name / bio stack runs the highlight banner's recipe. */
  register('.custom-people-craft', {
    prep(ctx) {
      ctx.heading = prepHeading($('.custom-people-craft__heading', ctx.root));
      ctx.rows = $$('.custom-people-craft__row', ctx.root).map((row) => {
        const r = {
          row,
          img: $('.custom-people-craft__img', row),
          eyebrow: $('.custom-people-craft__eyebrow', row),
          name: prepHeading($('.custom-people-craft__name', row)),
          body: prep($$('.custom-people-craft__body p', row), { autoAlpha: 0, y: -24 }),
        };
        prep([r.img], { scale: 1.08 });
        prep([r.eyebrow], { autoAlpha: 0, y: -16 });
        return r;
      });
    },
    build(ctx) {
      onEnter(ctx.root, () => {
        const tl = gsap.timeline();
        maskRise(tl, ctx.heading, 0);
      });
      ctx.rows.forEach((r) => {
        onEnter(
          r.row,
          () => {
            const tl = gsap.timeline();
            if (r.img) tl.to(r.img, { scale: 1, duration: 1.9, ease: 'expo.out' }, 0);
            fadeRise(tl, r.eyebrow, 0.1, { duration: 0.8 });
            maskRise(tl, r.name, 0.22);
            fadeRise(tl, r.body, 0.55, { stagger: 0.12 });
          },
          'top 80%'
        );
      });
    },
  });

  /* ---- Blog listing header (rituals, archives) ---- */
  register('.blog-listing-header', {
    prep(ctx) {
      ctx.heading = prepHeading($('.blog-listing-header-heading', ctx.root));
      ctx.title = $('.blog-listing-header-title', ctx.root);
      ctx.descWrap = $('.blog-listing-header-description-wrap', ctx.root);
      ctx.toggle = $('.blog-listing-header-toggle', ctx.root);
      prep([ctx.title], { autoAlpha: 0, y: -20 });
      // The expandable description's words belong to blog-listing-header.js —
      // animate only its outer wrap.
      prep([ctx.descWrap, ctx.toggle], { autoAlpha: 0, y: -18 });
    },
    build(ctx) {
      onEnter(ctx.root, () => {
        const tl = gsap.timeline();
        maskRise(tl, ctx.heading, 0);
        fadeRise(tl, ctx.title, 0.25, { duration: 0.85 });
        fadeRise(tl, [ctx.descWrap, ctx.toggle], 0.4, { duration: 0.9, stagger: 0.1 });
      });
    },
  });

  /* ---- Blog listing grid (rituals, archives) ----
   * Geometry-neutral by design: the whole reveal is a curtain clip on
   * each item's media box (all item content lives inside it) — no
   * transforms, so the CSS hover zoom on the images keeps working. */
  register('.blog-listing-grid', {
    prep(ctx) {
      const s = ctx.root;
      ctx.subtitle = $('.blog-listing-grid-subtitle', s);
      ctx.heading = prepHeading($('.blog-listing-grid-title', s));
      ctx.description = $('.blog-listing-grid-description', s);
      ctx.filters = $$('.blog-listing-grid-filter', s);
      ctx.media = prep($$('.blog-listing-grid-item-media', s), { clipPath: CLIP_DOWN });
      prep([ctx.subtitle], { autoAlpha: 0, y: -16 });
      prep([ctx.description], { autoAlpha: 0, y: -18 });
      prep(ctx.filters, { autoAlpha: 0, y: -14 });
    },
    build(ctx) {
      onEnter(ctx.root, () => {
        const tl = gsap.timeline();
        fadeRise(tl, ctx.subtitle, 0, { duration: 0.8 });
        maskRise(tl, ctx.heading, 0.1);
        fadeRise(tl, ctx.description, 0.4, { duration: 0.85 });
        fadeRise(tl, ctx.filters, 0.5, { duration: 0.75, stagger: 0.06 });
      });
      if (ctx.media.length) {
        onEnter(
          ctx.media[0],
          () => {
            clipReveal(gsap.timeline(), ctx.media, 0, { duration: 1.4, stagger: 0.16 });
          },
          'top 94%'
        );
      }
    },
  });

  /* ---- Press banner ---- */
  register('.press-banner', {
    prep(ctx) {
      ctx.bg = $('.press-banner__bg', ctx.root);
      ctx.eyebrow = $('.press-banner__eyebrow', ctx.root);
      ctx.heading = prepHeading($('.press-banner__heading', ctx.root));
      ctx.body = $('.press-banner__body', ctx.root);
      prep([ctx.eyebrow], { autoAlpha: 0, y: -16 });
      prep([ctx.body], { autoAlpha: 0, y: -20 });
    },
    build(ctx) {
      kenBurns(ctx.root, ctx.bg, 1.12);
      onEnter(ctx.root, () => {
        const tl = gsap.timeline();
        fadeRise(tl, ctx.eyebrow, 0, { duration: 0.8 });
        maskRise(tl, ctx.heading, 0.12);
        fadeRise(tl, ctx.body, 0.45, { duration: 0.9 });
      });
    },
  });

  /* ---- Press articles grid ---- */
  register('.press-articles', {
    prep(ctx) {
      ctx.heading = prepHeading($('.press-articles__heading', ctx.root));
      ctx.cards = prep($$('.press-articles__card', ctx.root), { autoAlpha: 0, y: -48 });
      ctx.dividers = prep($$('.press-articles__divider', ctx.root), { scaleX: 0, transformOrigin: 'left center' });
    },
    build(ctx) {
      onEnter(ctx.root, () => {
        maskRise(gsap.timeline(), ctx.heading, 0);
      });
      if (ctx.cards.length) {
        onEnter(
          ctx.cards[0],
          () => {
            const tl = gsap.timeline();
            fadeRise(tl, ctx.cards, 0, { duration: 1.1, stagger: 0.09 });
            drawLine(tl, ctx.dividers, 0.5, { duration: 1.0, stagger: 0.09 });
          },
          'top 94%'
        );
      }
    },
  });

  /* ---- Contact page ---- */
  register('.contact-page', {
    prep(ctx) {
      const s = ctx.root;
      ctx.title = prepHeading($('.contact-page__title', s));
      ctx.intro = $('.contact-page__rich-text', s);
      ctx.imageWrap = $('.contact-page__image', s);
      ctx.image = $('.contact-page__image-img', s);
      ctx.map = $('.contact-page__map', s);
      ctx.formHeading = prepHeading($('.contact-page__form-heading', s));
      ctx.fields = $$('.contact-page__field, .contact-page__form-el button, .contact-page__form-el [type="submit"]', s);
      prep([ctx.intro], { autoAlpha: 0, y: -22 });
      prep([ctx.imageWrap], { clipPath: CLIP_LEFT });
      prep([ctx.image], { scale: 1.12 });
      prep([ctx.map], { autoAlpha: 0 });
      prep(ctx.fields, { autoAlpha: 0, y: -20 });
    },
    build(ctx) {
      onEnter(ctx.root, () => {
        const tl = gsap.timeline();
        maskRise(tl, ctx.title, 0);
        fadeRise(tl, ctx.intro, 0.3, { duration: 0.95 });
        clipReveal(tl, ctx.imageWrap, 0.15, { duration: 1.5 });
        if (ctx.image) tl.to(ctx.image, { scale: 1, duration: 2.0, ease: 'expo.out' }, 0.25);
      });
      const formCol = $('.contact-page__form', ctx.root) || ctx.root;
      onEnter(
        formCol,
        () => {
          const tl = gsap.timeline();
          maskRise(tl, ctx.formHeading, 0);
          fadeRise(tl, ctx.fields, 0.25, { duration: 0.85, stagger: 0.08 });
          if (ctx.map) tl.to(ctx.map, { autoAlpha: 1, duration: 1.4, ease: 'power2.inOut' }, 0.2);
        },
        'top 88%'
      );
    },
  });

  /* ---- Policy pages ---- */
  register('.policy-page', {
    prep(ctx) {
      ctx.title = prepHeading($('.policy-page__title', ctx.root));
      ctx.navItems = prep($$('.policy-page__nav-item', ctx.root), { autoAlpha: 0, x: -18 });
      ctx.navMobile = $('.policy-page__nav-mobile', ctx.root);
      ctx.content = $('.policy-page__content', ctx.root);
      prep([ctx.navMobile], { autoAlpha: 0, y: -14 });
      prep([ctx.content], { autoAlpha: 0, y: -30 });
    },
    build(ctx) {
      onEnter(ctx.root, () => {
        const tl = gsap.timeline();
        maskRise(tl, ctx.title, 0);
        if (ctx.navItems.length) {
          tl.to(ctx.navItems, { autoAlpha: 1, x: 0, duration: 0.85, ease: EASE_OUT, stagger: 0.07 }, 0.25);
        }
        fadeRise(tl, ctx.navMobile, 0.25, { duration: 0.85 });
        fadeRise(tl, ctx.content, 0.4, { duration: 1.05 });
      });
    },
  });

  /* ---- Generic page body (page + top of about/rituals/archives) ---- */
  register('.main-page-title', {
    prep(ctx) {
      ctx.title = prepHeading(ctx.root);
      ctx.content = ctx.root.nextElementSibling && ctx.root.nextElementSibling.classList.contains('rte')
        ? ctx.root.nextElementSibling
        : null;
      prep([ctx.content], { autoAlpha: 0, y: -26 });
    },
    build(ctx) {
      onEnter(ctx.root, () => {
        const tl = gsap.timeline();
        maskRise(tl, ctx.title, 0);
        fadeRise(tl, ctx.content, 0.3, { duration: 1.0 });
      });
    },
  });

  /* ---- Blog listing (Dawn main-blog) ---- */
  register('.main-blog', {
    prep(ctx) {
      ctx.title = prepHeading($('.title--primary', ctx.root));
      ctx.cards = prep($$('.blog-articles__article', ctx.root), { autoAlpha: 0, y: -48 });
    },
    build(ctx) {
      onEnter(ctx.root, () => {
        maskRise(gsap.timeline(), ctx.title, 0);
      });
      if (ctx.cards.length) {
        onEnter(
          ctx.cards[0],
          () => {
            gsap.to(ctx.cards, { autoAlpha: 1, y: 0, duration: 1.1, ease: EASE_OUT, stagger: 0.1 });
          },
          'top 94%'
        );
      }
    },
  });

  /* ---- Blog article (Dawn main-article) ---- */
  register('.article-template', {
    prep(ctx) {
      const s = ctx.root;
      ctx.hero = $('.article-template__hero-container', s);
      ctx.title = prepHeading($('.article-template__title', s));
      ctx.meta = $$('header .caption-with-letter-spacing', s);
      ctx.content = $('.article-template__content', s);
      ctx.share = $('.article-template__social-sharing', s);
      ctx.back = $('.article-template__back', s);
      prep([ctx.hero], { clipPath: CLIP_DOWN });
      prep(ctx.meta, { autoAlpha: 0, y: -12 });
      prep([ctx.content], { autoAlpha: 0, y: -30 });
      prep([ctx.share, ctx.back], { autoAlpha: 0, y: -18 });
    },
    build(ctx) {
      const tl = gsap.timeline({ delay: 0.1 });
      clipReveal(tl, ctx.hero, 0, { duration: 1.5 });
      maskRise(tl, ctx.title, 0.35);
      fadeRise(tl, ctx.meta, 0.7, { duration: 0.8, stagger: 0.08 });
      if (ctx.content) {
        onEnter(
          ctx.content,
          () => {
            gsap.to(ctx.content, { autoAlpha: 1, y: 0, duration: 1.05, ease: EASE_OUT });
          },
          'top 98%'
        );
      }
      [ctx.share, ctx.back].filter(Boolean).forEach((el) => {
        onEnter(
          el,
          () => {
            gsap.to(el, { autoAlpha: 1, y: 0, duration: 0.9, ease: EASE_OUT });
          },
          'top 102%'
        );
      });
    },
  });

  /* ---- Archive article (hero owned by archive-hero-parallax.js) ---- */
  register('.archive-article__content', {
    prep(ctx) {
      const s = ctx.root;
      ctx.introHeading = prepHeading($('.archive-article__intro-heading', s));
      ctx.introBody = $$('.archive-article__intro-body p', s);
      ctx.share = $('.archive-article__share', s);
      ctx.images = $$('.archive-article__image-media', s);
      ctx.splits = $$('.archive-article__split', s);
      ctx.duoItems = $$('.archive-article__duo-item', s);
      ctx.under = $('.under_reflection_copy', s);
      ctx.noteLabel = $('.archive-article__note-label', s);
      ctx.noteBody = $('.archive-article__note-body', s);
      prep(ctx.introBody, { autoAlpha: 0, y: -24 });
      prep([ctx.share], { autoAlpha: 0, y: -14 });
      prep(ctx.images, { clipPath: CLIP_DOWN });
      prep(ctx.duoItems, { autoAlpha: 0, y: -44 });
      prep([ctx.under], { autoAlpha: 0, y: -24 });
      prep([ctx.noteLabel, ctx.noteBody], { autoAlpha: 0, y: -20 });
      ctx.splitParts = ctx.splits.map((split_) => ({
        root: split_,
        blocks: prep($$('.archive-article__split-col', split_), { autoAlpha: 0, y: -26 }),
      }));
    },
    build(ctx) {
      if (ctx.introHeading || ctx.introBody.length) {
        const introRoot = ctx.introHeading ? ctx.introHeading.el : ctx.introBody[0];
        onEnter(introRoot, () => {
          const tl = gsap.timeline();
          maskRise(tl, ctx.introHeading, 0);
          fadeRise(tl, ctx.introBody, 0.3, { stagger: 0.1 });
        });
      }
      if (ctx.share) {
        onEnter(
          ctx.share,
          () => {
            gsap.to(ctx.share, { autoAlpha: 1, y: 0, duration: 0.8, ease: EASE_OUT });
          },
          'top 100%'
        );
      }
      ctx.images.forEach((img) => {
        onEnter(
          img,
          () => {
            clipReveal(gsap.timeline(), img, 0, { duration: 1.5 });
          },
          'top 92%'
        );
      });
      ctx.splitParts.forEach((partSet) => {
        onEnter(partSet.root, () => {
          fadeRise(gsap.timeline(), partSet.blocks, 0, { stagger: 0.15 });
        });
      });
      if (ctx.duoItems.length) {
        onEnter(
          ctx.duoItems[0],
          () => {
            gsap.to(ctx.duoItems, { autoAlpha: 1, y: 0, duration: 1.15, ease: EASE_OUT, stagger: 0.14 });
          },
          'top 92%'
        );
      }
      [ctx.under, ctx.noteLabel && ctx.noteLabel.parentElement].filter(Boolean).forEach((el) => {
        onEnter(el, () => {
          gsap.to([ctx.under, ctx.noteLabel, ctx.noteBody].filter(Boolean), {
            autoAlpha: 1,
            y: 0,
            duration: 1.0,
            ease: EASE_OUT,
            stagger: 0.12,
          });
        });
      });
    },
  });

  /* ---- Continue exploring (archive articles) ---- */
  register('.continue-exploring', {
    prep(ctx) {
      ctx.subtitle = $('.collection__subtitle', ctx.root);
      ctx.heading = prepHeading($('.continue-exploring__header .section-heading', ctx.root));
      ctx.items = prep($$('.continue-exploring__item', ctx.root), { autoAlpha: 0, y: -44 });
      prep([ctx.subtitle], { autoAlpha: 0, y: -16 });
    },
    build(ctx) {
      onEnter(ctx.root, () => {
        // fadeRise leaves its end transform inline, and a lingering transform —
        // even an identity one — keeps each card on its own composited layer,
        // where the browser resamples the cover photo and leaves it visibly
        // soft. Dropping the transform once the reveal lands puts the cards
        // back on the page's own raster at full resolution.
        const tl = gsap.timeline({
          onComplete: () => gsap.set(ctx.items, { clearProps: 'transform' }),
        });
        fadeRise(tl, ctx.subtitle, 0, { duration: 0.8 });
        maskRise(tl, ctx.heading, 0.1);
        fadeRise(tl, ctx.items, 0.4, { duration: 1.05, stagger: 0.1 });
      });
    },
  });

  /* ---- Story tags strip (marquee owns its track) ---- */
  register('.story-tags-strip', {
    prep(ctx) {
      ctx.label = $('.story-tags-strip__label', ctx.root);
      ctx.marquee = $('.story-tags-strip__marquee', ctx.root);
      prep([ctx.label], { autoAlpha: 0, y: -14 });
      prep([ctx.marquee], { autoAlpha: 0 });
    },
    build(ctx) {
      onEnter(ctx.root, () => {
        const tl = gsap.timeline();
        fadeRise(tl, ctx.label, 0, { duration: 0.8 });
        if (ctx.marquee) tl.to(ctx.marquee, { autoAlpha: 1, duration: 1.1, ease: 'power2.inOut' }, 0.25);
      });
    },
  });

  /* ---- 404 ---- */
  register('.error-404', {
    prep(ctx) {
      const s = ctx.root;
      ctx.bg = $('.error-404__bg', s);
      ctx.card = $('.error-404__card', s);
      ctx.eyebrow = $('.error-404__eyebrow', s);
      ctx.heading = prepHeading($('.error-404__heading', s));
      ctx.subtext = $('.error-404__subtext', s);
      ctx.button = $('.error-404__button', s);
      prep([ctx.card], { autoAlpha: 0, y: -44 });
      prep([ctx.eyebrow, ctx.subtext, ctx.button], { autoAlpha: 0, y: -16 });
    },
    build(ctx) {
      const tl = gsap.timeline({ delay: 0.1 });
      if (ctx.bg) tl.fromTo(ctx.bg, { scale: 1.08 }, { scale: 1, duration: 2.2, ease: 'expo.out' }, 0);
      fadeRise(tl, ctx.card, 0.1, { duration: 1.2 });
      fadeRise(tl, ctx.eyebrow, 0.4, { duration: 0.8 });
      maskRise(tl, ctx.heading, 0.5);
      fadeRise(tl, [ctx.subtext, ctx.button], 0.75, { duration: 0.85, stagger: 0.1 });
    },
  });

  /* ---- Collection hero (collection pages) ---- */
  register('.collection-hero', {
    prep(ctx) {
      ctx.title = prepHeading($('.collection-hero__title', ctx.root));
      ctx.description = $('.collection-hero__description', ctx.root);
      prep([ctx.description], { autoAlpha: 0, y: -20 });
    },
    build(ctx) {
      const tl = gsap.timeline({ delay: 0.1 });
      maskRise(tl, ctx.title, 0);
      fadeRise(tl, ctx.description, 0.3, { duration: 0.95 });
    },
  });

  /* ---- Facets / sorting bar (collection + search) ---- */
  register('.facets-wrapper, facet-filters-form', {
    prep(ctx) {
      prep([ctx.root], { autoAlpha: 0, y: -16 });
    },
    build(ctx) {
      onEnter(
        ctx.root,
        () => {
          // clearProps: a lingering transform would turn this wrapper into a
          // containing block and silently break sticky filters inside it.
          gsap.to(ctx.root, {
            autoAlpha: 1,
            y: 0,
            duration: 0.9,
            ease: EASE_OUT,
            onComplete: () => gsap.set(ctx.root, { clearProps: 'transform' }),
          });
        },
        'top 102%'
      );
    },
  });

  /* ---- Cart page (rows are <tr> — opacity only; transforms on
   *      table rows are unreliable cross-browser) ---- */
  register('.cart-items', {
    prep(ctx) {
      ctx.rows = prep($$('.cart-item', ctx.root), { autoAlpha: 0 });
    },
    build(ctx) {
      if (!ctx.rows.length) return;
      onEnter(
        ctx.root,
        () => {
          gsap.to(ctx.rows, { autoAlpha: 1, duration: 0.9, ease: 'power2.out', stagger: 0.08 });
        },
        'top 98%'
      );
    },
  });

  register('.cart__footer', {
    prep(ctx) {
      ctx.blocks = prep($$(':scope > *', ctx.root), { autoAlpha: 0, y: -24 });
    },
    build(ctx) {
      onEnter(
        ctx.root,
        () => {
          gsap.to(ctx.blocks, { autoAlpha: 1, y: 0, duration: 0.95, ease: EASE_OUT, stagger: 0.1 });
        },
        'top 98%'
      );
    },
  });

  /* ---- Product page: media + info (variant UI re-renders content
   *      inside these wrappers, never the wrappers themselves) ---- */
  register('.product__media-list .product__media-item', {
    prep(ctx) {
      prep([ctx.root], { autoAlpha: 0, y: -30 });
    },
    build(ctx) {
      onEnter(
        ctx.root,
        () => {
          gsap.to(ctx.root, { autoAlpha: 1, y: 0, duration: 1.1, ease: EASE_OUT });
        },
        'top 96%'
      );
    },
  });

  register('.product__info-container', {
    prep(ctx) {
      ctx.title = prepHeading($('.product__title h1', ctx.root));
      ctx.blocks = prep(
        $$(':scope > *:not(script):not(style)', ctx.root).filter((el) => !el.querySelector('.product__title h1')),
        { autoAlpha: 0, y: -22 }
      );
    },
    build(ctx) {
      onEnter(
        ctx.root,
        () => {
          const tl = gsap.timeline();
          maskRise(tl, ctx.title, 0);
          fadeRise(tl, ctx.blocks, 0.2, { duration: 0.9, stagger: 0.07 });
        },
        'top 92%'
      );
    },
  });

  /* ---- PDP fold 2 ---- */
  register('.pdp-fold-2-container', {
    prep(ctx) {
      ctx.heading = prepHeading($('.pdp-fold-2-heading', ctx.root));
      ctx.bullets = prep($$('.pdp-fold-2-bullet', ctx.root), { autoAlpha: 0, y: -24 });
      ctx.right = $('.pdp-fold-2-right', ctx.root);
      prep([ctx.right], { autoAlpha: 0, y: -36 });
    },
    build(ctx) {
      onEnter(ctx.root, () => {
        const tl = gsap.timeline();
        maskRise(tl, ctx.heading, 0);
        fadeRise(tl, ctx.bullets, 0.3, { duration: 0.9, stagger: 0.09 });
        fadeRise(tl, ctx.right, 0.25, { duration: 1.2 });
      });
    },
  });

  /* ---- Related products heading ---- */
  register('.related-products', {
    prep(ctx) {
      ctx.heading = prepHeading($('.related-products__heading', ctx.root));
    },
    build(ctx) {
      if (!ctx.heading) return;
      onEnter(ctx.root, () => {
        maskRise(gsap.timeline(), ctx.heading, 0);
      });
    },
  });

  /* ---- Footer (all pages) ---- */
  const footerRoot = document.querySelector('.custom-footer');
  const footerParts = {};
  if (footerRoot) {
    footerParts.cols = prep(
      Array.from(footerRoot.querySelectorAll('.custom-footer__list-col, .custom-footer__brand, .custom-footer__icons')),
      { autoAlpha: 0, y: -26 }
    );
    footerParts.divider = prep(Array.from(footerRoot.querySelectorAll('.custom-footer__divider')), {
      scaleX: 0,
      transformOrigin: 'left center',
    });
    footerParts.bottom = prep(Array.from(footerRoot.querySelectorAll('.custom-footer__bottom, .custom-footer__copyright')), {
      autoAlpha: 0,
    });
  }

  /* ================================================================ *
   * Overlays — event-driven, no scroll triggers, fromTo on each open
   * so no persistent hidden state is needed.
   * ================================================================ */
  const initOverlays = () => {
    // Burger menu drawer: stagger the top-level items each time it opens.
    document.querySelectorAll('header-drawer details#Details-menu-drawer-container').forEach((details) => {
      const items = details.querySelectorAll('.menu-drawer__navigation > .menu-drawer__menu > li');
      const utility = details.querySelector('.menu-drawer__utility-links');
      if (!items.length) return;
      details.addEventListener('toggle', () => {
        if (!details.open) return;
        gsap.fromTo(
          items,
          { autoAlpha: 0, x: -22 },
          { autoAlpha: 1, x: 0, duration: 0.85, ease: EASE_OUT, stagger: 0.06, delay: 0.18, overwrite: 'auto' }
        );
        if (utility) {
          gsap.fromTo(
            utility,
            { autoAlpha: 0, y: 16 },
            { autoAlpha: 1, y: 0, duration: 0.8, ease: EASE_OUT, delay: 0.4, overwrite: 'auto' }
          );
        }
      });
    });

    // Cart drawer: cascade the line items each time it opens.
    const cartDrawer = document.querySelector('cart-drawer');
    if (cartDrawer) {
      let wasActive = cartDrawer.classList.contains('active');
      const animateOpen = () => {
        // Line items are <tr> — animate opacity only (transforms on table
        // rows are unreliable cross-browser); the drawer slide supplies
        // the motion.
        const rows = cartDrawer.querySelectorAll('.cart-item');
        const header = cartDrawer.querySelector('.drawer__header');
        const footer = cartDrawer.querySelector('.drawer__footer');
        const empty = cartDrawer.querySelector('.cart-drawer__warnings');
        const targets = [header, ...rows, footer, empty].filter(Boolean);
        if (!targets.length) return;
        gsap.fromTo(
          targets,
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: 0.75, ease: 'power2.out', stagger: 0.06, delay: 0.22, overwrite: 'auto' }
        );
      };
      new MutationObserver(() => {
        const isActive = cartDrawer.classList.contains('active');
        if (isActive && !wasActive) animateOpen();
        wasActive = isActive;
      }).observe(cartDrawer, { attributes: true, attributeFilter: ['class'] });
    }
  };

  /* ================================================================ *
   * Build phase — after every other DOMContentLoaded handler, so any
   * script that shifts section positions has already run.
   * ================================================================ */
  const build = () => {
    if (window.lenis && window.lenis.on) window.lenis.on('scroll', ScrollTrigger.update);
    ScrollTrigger.config({ ignoreMobileResize: true });

    animators.forEach(({ def, ctx }) => {
      if (!def.build) return;
      try {
        def.build(ctx);
      } catch (error) {
        // One broken animator must never blank out every section
        // registered after it — each build() used to run in a single
        // unguarded forEach, so a throw here silently left every later
        // section's elements stuck at the autoAlpha:0 that prep() had
        // already applied on load, with nothing in the console to say why.
        console.error('[site-animations] build failed for', ctx.root, error);
      }
    });

    if (footerRoot && footerParts.cols && footerParts.cols.length) {
      onEnter(
        footerRoot,
        () => {
          const tl = gsap.timeline();
          tl.to(footerParts.cols, { autoAlpha: 1, y: 0, duration: 1.0, ease: EASE_OUT, stagger: 0.08 }, 0);
          if (footerParts.divider.length) {
            tl.to(footerParts.divider, { scaleX: 1, duration: 1.3, ease: EASE_MASK }, 0.2);
          }
          if (footerParts.bottom.length) {
            tl.to(footerParts.bottom, { autoAlpha: 1, duration: 0.9, ease: 'power2.out' }, 0.55);
          }
        },
        'top 98%'
      );
    }

    initOverlays();

    // Lazy media shifts layout; re-measure every trigger once loaded.
    if (document.readyState === 'complete') {
      ScrollTrigger.refresh();
    } else {
      window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
    }

    // Below-the-fold images are loading="lazy" so they don't compete with the
    // hero film, which means they land after window load -- and the ones
    // without width/height change the page's height when they do. Re-measure
    // after each such batch (debounced, so a row of images is one refresh).
    let lazyRefreshTimer = null;
    document.addEventListener(
      'load',
      (event) => {
        const target = event.target;
        if (!(target instanceof HTMLImageElement) || target.loading !== 'lazy') return;
        clearTimeout(lazyRefreshTimer);
        lazyRefreshTimer = setTimeout(() => ScrollTrigger.refresh(), 200);
      },
      true
    );
  };

  if (document.readyState === 'complete') {
    setTimeout(build, 0);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(build, 0), { once: true });
  }
})();
