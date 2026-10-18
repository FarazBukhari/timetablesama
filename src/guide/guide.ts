import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/500.css';
import './guide.css';

// Same origin as the app, so follow the colour choice made there.
try {
  const theme = localStorage.getItem('timetablesama.theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
} catch {
  /* storage blocked: follow the computer's setting */
}

// Click a screenshot to see it full size.
const lb = document.querySelector<HTMLDialogElement>('#lb');
const close = document.querySelector<HTMLButtonElement>('#lb-close');
const cap = document.querySelector<HTMLParagraphElement>('#lb-cap');
if (lb && close && cap) {
  document.querySelectorAll<HTMLButtonElement>('figure.shot button').forEach((b) => {
    b.addEventListener('click', () => {
      const small = b.querySelector('img');
      if (!small) return;
      const img = new Image();
      img.src = small.currentSrc || small.src;
      img.alt = small.alt;
      close.replaceChildren(img);
      cap.textContent = b.closest('figure')?.querySelector('figcaption')?.textContent ?? '';
      lb.showModal();
    });
  });
  close.addEventListener('click', () => lb.close());
  lb.addEventListener('click', (e) => e.target === lb && lb.close());
}

// Highlight the section being read in the contents list.
const links = [...document.querySelectorAll<HTMLAnchorElement>('.toc a')];
const byId = new Map(links.map((a) => [a.hash.slice(1), a]));
const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    links.forEach((a) => a.classList.remove('on'));
    byId.get(e.target.id)?.classList.add('on');
  }),
  { rootMargin: '-20% 0px -70% 0px' },
);
document.querySelectorAll('main section[id]').forEach((s) => io.observe(s));
