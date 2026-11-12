'use strict';
(() => {
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const running = new Set();
  const played = new WeakSet();
  let observer;
  const targets = '.corporate-heading,.business-strip>div,.business-strip>a,.corporate-service-card,.service-consult-card,.corporate-about-photo,.corporate-about-copy,.about-process>span,.corporate-close>div,.page-intro>div,.service-page>img,.service-page>div,.process article,.about-photo,.about-copy,.institutional-purpose article,.sector-row,.page-cta>div,.page-cta>.button,.footer-grid>div,.contact-copy,.quote-form';
  function stop() {
    observer?.disconnect();
    running.forEach(animation => animation.cancel());
    running.clear();
  }
  function start() {
    stop();
    if (preference.matches || !('IntersectionObserver' in window) || typeof Element.prototype.animate !== 'function') return;
    observer = new IntersectionObserver(entries => {
      entries.filter(entry => entry.isIntersecting).forEach((entry, index) => {
        const element = entry.target;
        observer.unobserve(element);
        if (played.has(element)) return;
        played.add(element);
        // Content is visible by default. Animation cancellation or JS failure never hides it.
        const animation = element.animate([
          { opacity: 0, transform: 'translateY(18px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ], { duration: 650, delay: Math.min(index, 3) * 65, easing: 'cubic-bezier(.2,.7,.25,1)', fill: 'backwards' });
        running.add(animation);
        animation.finished.catch(() => {}).finally(() => running.delete(animation));
      });
    }, { threshold: .1, rootMargin: '0px 0px -18px 0px' });
    document.querySelectorAll(targets).forEach(element => {
      if (!played.has(element) && !element.closest('[hidden]')) observer.observe(element);
    });
  }
  preference.addEventListener('change', start);
  window.addEventListener('pageshow', event => { if (event.persisted) start(); });
  window.addEventListener('pagehide', stop);
  start();
  const header = document.querySelector('.site-header');
  let scheduled = false;
  function updateHeader() {
    scheduled = false;
    header?.classList.toggle('is-scrolled', scrollY > 16);
  }
  window.addEventListener('scroll', () => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(updateHeader); }
  }, { passive: true });
  updateHeader();
})();
