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
  const dataEl = document.getElementById('works-data');
  if (!dialog || !dataEl || typeof dialog.showModal !== 'function') return;

  const works = JSON.parse(dataEl.textContent);
  const stage = dialog.querySelector('.stage');
  const title = dialog.querySelector('.title');
  const meta = dialog.querySelector('.meta');
  const count = dialog.querySelector('.count');
  let index = 0;
  let opener = null;

  const set = (w, ext) => w.widths.map((x) => `/img/${w.slug}-${x}.${w.hash}.${ext} ${x}w`).join(', ');

  function render(i) {
    index = (i + works.length) % works.length;
    const w = works[index];
    const pic = document.createElement('picture');
    for (const [type, ext] of [['image/avif', 'avif'], ['image/webp', 'webp']]) {
      const s = document.createElement('source');
      s.type = type;
      s.srcset = set(w, ext);
      s.sizes = '100vw';
      pic.append(s);
    }
    const img = document.createElement('img');
    img.srcset = set(w, 'jpg');
    img.sizes = '100vw';
    img.src = `/img/${w.slug}-${w.widths[w.widths.length - 1]}.${w.hash}.jpg`;
    img.width = w.width;
    img.height = w.height;
    img.alt = w.title;
    img.style.backgroundColor = w.color;
    img.classList.add('pending');
    img.addEventListener('load', () => img.classList.remove('pending'), { once: true });
    pic.append(img);
    stage.replaceChildren(pic);
    title.textContent = w.title;
    meta.textContent = w.meta;
    count.textContent = `${index + 1} / ${works.length}`;
    // Warm the neighbours so paging feels immediate.
    for (const n of [index + 1, index - 1]) {
      const nb = works[(n + works.length) % works.length];
      const pre = new Image();
      pre.sizes = '100vw';
      pre.srcset = set(nb, 'jpg');
    }
  }

  function open(i, el) {
    opener = el;
    render(i);
    dialog.showModal();
    document.body.classList.add('locked');
    // Back closes the picture, as people expect on a phone.
    history.pushState({ lightbox: true }, '', `#work-${works[index].slug}`);
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
    history.replaceState({ lightbox: true }, '', `#work-${works[index].slug}`);
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
