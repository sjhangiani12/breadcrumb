import { prefersReducedMotion } from './utils';

export function initScrollAnimations(): void {
  const elements = document.querySelectorAll<HTMLElement>('[data-animate]');

  if (prefersReducedMotion()) {
    elements.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target as HTMLElement;
          const delay = el.dataset.animateDelay;
          if (delay) {
            el.style.transitionDelay = delay;
          }
          el.classList.add('is-visible');
          observer.unobserve(el);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' },
  );

  elements.forEach((el) => observer.observe(el));
}

export function initActiveNav(): void {
  const navLinks = document.querySelectorAll<HTMLAnchorElement>('.nav-anchor');
  const sections = Array.from(navLinks)
    .map((link) => {
      const id = link.getAttribute('href')?.replace('#', '');
      return id ? document.getElementById(id) : null;
    })
    .filter(Boolean) as HTMLElement[];

  if (!sections.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          navLinks.forEach((link) => {
            link.classList.toggle('nav-anchor--active', link.getAttribute('href') === `#${id}`);
          });
        }
      });
    },
    { threshold: 0.3, rootMargin: '-80px 0px -50% 0px' },
  );

  sections.forEach((section) => observer.observe(section));
}
