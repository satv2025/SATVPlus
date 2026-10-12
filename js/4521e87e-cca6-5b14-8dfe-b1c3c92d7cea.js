// /js/about.js
// Mejora progresiva para la página informativa.
(() => {
  const links = [...document.querySelectorAll('.toc a[href^="#"]')];
  if (!links.length || !("IntersectionObserver" in window)) return;

  const byId = new Map(
    links.map((link) => [decodeURIComponent(link.getAttribute('href').slice(1)), link])
  );

  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;

    links.forEach((link) => link.removeAttribute('aria-current'));
    byId.get(visible.target.id)?.setAttribute('aria-current', 'true');
  }, { rootMargin: '-20% 0px -65% 0px', threshold: [0, 0.25, 0.5] });

  byId.forEach((_, id) => {
    const section = document.getElementById(id);
    if (section) observer.observe(section);
  });
})();
