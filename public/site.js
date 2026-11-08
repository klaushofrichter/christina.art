// Loaded in <head> without defer, on purpose: the `js` class must be on <html>
// before the body paints, or the reveal styles would hide what was already
// shown. Everything else waits for the DOM. Without JS the page is complete:
// nothing is hidden and every work links to its largest picture.
document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', () => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- each picture waits over its own muted colour, then fades in ----
  for (const img of document.querySelectorAll('img[data-color]')) {
    img.style.backgroundColor = img.dataset.color;
    if (!img.complete) {
      img.classList.add('pending');
      const done = () => img.classList.remove('pending');
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }
  }

  // ---- slow reveal as things come into view ----
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('in'));
  }

  // ---- the bar shows the name once the big one has scrolled away ----
  const bar = document.querySelector('.bar');
  const intro = document.querySelector('.intro h1');
  if (bar && intro && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => bar.classList.toggle('scrolled', !e.isIntersecting), {
      rootMargin: '-56px 0px 0px 0px',
    }).observe(intro);
  }

  // ---- lightbox ----
  const dialog = document.querySelector('.lightbox');
  if (!dialog || typeof dialog.showModal !== 'function') return;

  // The enlarged view reuses each work's own <picture>: cloned, then told it
  // will be drawn full-width, so the browser picks a larger file from the same
  // srcset. Nothing read from the page is ever turned into markup or a URL
  // string here, which is what keeps this free of DOM-based injection.
  const works = Array.from(document.querySelectorAll('figure.work'));
  const stage = dialog.querySelector('.stage');
  const title = dialog.querySelector('.title');
  const meta = dialog.querySelector('.meta');
  const count = dialog.querySelector('.count');
  let index = 0;
  let opener = null;

  function enlarged(figure) {
    const pic = figure.querySelector('picture').cloneNode(true);
    for (const el of pic.querySelectorAll('source, img')) el.sizes = '100vw';
    const img = pic.querySelector('img');
    img.loading = 'eager';
    img.style.backgroundColor = img.dataset.color || '';
    return pic;
  }

  function render(i) {
    index = (i + works.length) % works.length;
    const figure = works[index];
    const pic = enlarged(figure);
    const img = pic.querySelector('img');
    if (!img.complete) {
      img.classList.add('pending');
      img.addEventListener('load', () => img.classList.remove('pending'), { once: true });
    } else {
      img.classList.remove('pending');
    }
    stage.replaceChildren(pic);
    title.textContent = figure.querySelector('figcaption .title').textContent;
    meta.textContent = figure.querySelector('figcaption .meta').textContent;
    count.textContent = `${index + 1} / ${works.length}`;
  }

  function open(i, el) {
    opener = el;
    render(i);
    dialog.showModal();
    document.body.classList.add('locked');
    // Back closes the picture, as people expect on a phone.
    history.pushState({ lightbox: true }, '', `#view-${index + 1}`);
  }

  function close(fromHistory) {
    if (!dialog.open) return;
    dialog.close();
    document.body.classList.remove('locked');
    if (!fromHistory && history.state && history.state.lightbox) history.back();
    if (opener) opener.focus({ preventScroll: true });
  }

  function step(d) {
    render(index + d);
    history.replaceState({ lightbox: true }, '', `#view-${index + 1}`);
  }

  document.querySelectorAll('.frame[data-index]').forEach((a) => {
    a.addEventListener('click', (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return; // let new-tab clicks through
      ev.preventDefault();
      open(Number(a.dataset.index), a);
    });
  });

  dialog.querySelector('.lb-close').addEventListener('click', () => close(false));
  dialog.querySelector('.lb-prev').addEventListener('click', () => step(-1));
  dialog.querySelector('.lb-next').addEventListener('click', () => step(1));
  dialog.addEventListener('cancel', (ev) => {
    ev.preventDefault(); // Escape: close through our path, so history stays tidy
    close(false);
  });
  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog || ev.target.tagName === 'FIGURE') close(false);
  });
  dialog.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowRight') step(1);
    else if (ev.key === 'ArrowLeft') step(-1);
  });
  window.addEventListener('popstate', () => close(true));

  // Swipe: a mostly horizontal drag of 50px or more pages; anything else is
  // left to the browser (pinch-zoom, vertical scroll).
  let sx = 0;
  let sy = 0;
  stage.addEventListener('touchstart', (ev) => {
    if (ev.touches.length !== 1) return;
    sx = ev.touches[0].clientX;
    sy = ev.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener('touchend', (ev) => {
    if (ev.changedTouches.length !== 1) return;
    const dx = ev.changedTouches[0].clientX - sx;
    const dy = ev.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  }, { passive: true });
});
