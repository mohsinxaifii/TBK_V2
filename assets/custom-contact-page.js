// The contact form posts in the background, so the page doesn't reload or jump
// to the form. The success/error message Shopify renders is lifted out of the
// response and grown in above the fields without moving the scroll position.
//
// Shopify's spam protection (the captcha-bootstrap script in the page head)
// cancels the submit event, fetches an hCaptcha token, then calls
// form.submit(). It captures whatever form.submit is when it binds to the form
// on first focus, so replacing it before then routes that final submit through
// send() too.

const EASE = 'cubic-bezier(.165, .84, .44, 1)';
const DURATION = 500;
const sending = new WeakSet();

function prepare(form) {
  if (!form?.matches?.('.contact-page__form-el')) return;
  // Once the captcha has bound it holds the native submit; leave it the normal
  // page-reload flow rather than risk posting twice.
  if (form.dataset.hcaptchaBound || Object.hasOwn(form, 'submit')) return;
  form.submit = () => send(form);
}

document.querySelectorAll('.contact-page__form-el').forEach(prepare);
// Capture phase, so this runs before the captcha's own focusin handler binds.
document.addEventListener('focusin', (event) => prepare(event.target.form), true);

// Ignore resubmits while a post is in flight.
document.addEventListener(
  'submit',
  (event) => {
    if (!sending.has(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  },
  true
);

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!form.matches('.contact-page__form-el')) return;

  if (!event.defaultPrevented) {
    event.preventDefault();
    send(form);
  } else if (form.dataset.hcaptchaBound) {
    // The captcha is getting a token and calls form.submit() when it has one.
    setLoading(form, true);
  }
});

async function send(form) {
  if (sending.has(form)) return;
  sending.add(form);
  setLoading(form, true);

  let doc;
  try {
    const response = await fetch(form.action, { method: 'POST', body: new FormData(form) });
    doc = new DOMParser().parseFromString(await response.text(), 'text/html');
  } catch {
    doc = null;
  }

  const nextStatus = doc?.getElementById(form.id)?.querySelector('.contact-page__form-status');
  if (!nextStatus?.firstElementChild) {
    // Offline, or not the contact page back (Shopify's spam challenge): hand
    // the post to the browser so the visitor can finish it the normal way.
    HTMLFormElement.prototype.submit.call(form);
    return;
  }

  if (nextStatus.querySelector('.contact-page__form-message--success')) {
    // Clear the fields the way the reloaded page would.
    form.querySelectorAll('.contact-page__field-input').forEach((field) => {
      field.value = doc.getElementById(field.id)?.value ?? '';
    });
  }

  sending.delete(form);
  setLoading(form, false);
  showStatus(form, nextStatus);
}

function setLoading(form, loading) {
  const button = form.querySelector('.contact-page__submit');
  if (loading) {
    form.setAttribute('aria-busy', 'true');
    button?.setAttribute('aria-disabled', 'true');
  } else {
    form.removeAttribute('aria-busy');
    button?.removeAttribute('aria-disabled');
  }
  button?.classList.toggle('loading', loading);
  button?.querySelector('.loading__spinner')?.classList.toggle('hidden', !loading);
}

function showStatus(form, nextStatus) {
  const status = form.querySelector('.contact-page__form-status');
  const root = document.documentElement;
  const gap = parseFloat(getComputedStyle(form).rowGap) || 0;
  const fromHeight = status.offsetHeight;
  // An empty status is display: none, so the form's gap below it only appears
  // with the message; start with that gap pulled back so nothing pops.
  const fromMargin = status.firstElementChild ? 0 : -gap;

  // Scroll anchoring would otherwise scroll the page to offset the form growing.
  root.style.overflowAnchor = 'none';
  status.replaceChildren(...nextStatus.childNodes);
  const message = status.firstElementChild;
  message.removeAttribute('autofocus');
  message.focus({ preventScroll: true });

  const release = () => {
    root.style.overflowAnchor = '';
    status.style.overflow = '';
  };

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    requestAnimationFrame(() => requestAnimationFrame(release));
    return;
  }

  status.style.overflow = 'hidden';
  const grow = status.animate(
    [
      { height: `${fromHeight}px`, marginBottom: `${fromMargin}px` },
      { height: `${status.offsetHeight}px`, marginBottom: '0px' },
    ],
    { duration: DURATION, easing: EASE }
  );
  message.animate(
    [
      { opacity: 0, transform: 'translateY(-8px)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: DURATION, delay: 120, easing: EASE, fill: 'backwards' }
  );
  grow.onfinish = release;
  grow.oncancel = release;
}

// Going back to the page restores it from the bfcache with the spinner still
// running after a normal (fallback) submit, so clear it.
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  document.querySelectorAll('.contact-page__form-el').forEach((form) => setLoading(form, false));
});
