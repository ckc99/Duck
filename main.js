// ---------- smooth momentum scrolling ----------
if (typeof Lenis !== 'undefined') {
  const lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  });

  const raf = (time) => {
    lenis.raf(time);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const hash = link.getAttribute('href');
      if (hash.length <= 1) return;
      const target = document.querySelector(hash);
      if (target) {
        e.preventDefault();
        lenis.scrollTo(target);
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // ---------- gallery scroll ----------
  const originCards = document.querySelector('.origin-cards');
  const originTrack = document.querySelector('.origin-cards-track');

  if (originCards && originTrack) {
    // ---------- click-and-drag scrolling (mouse) ----------
    let isDragging = false;
    let dragStartX = 0;
    let dragStartScroll = 0;

    originCards.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartScroll = originCards.scrollLeft;
      originCards.classList.add('is-dragging');
      originCards.setPointerCapture(e.pointerId);
    });

    originCards.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      originCards.scrollLeft = dragStartScroll - (e.clientX - dragStartX);
    });

    const endDrag = () => {
      isDragging = false;
      originCards.classList.remove('is-dragging');
    };
    originCards.addEventListener('pointerup', endDrag);
    originCards.addEventListener('pointercancel', endDrag);

    // ---------- scrollable hint (auto nudge) ----------
    let hintCancelled = false;
    const cancelHint = () => { hintCancelled = true; };
    originCards.addEventListener('pointerdown', cancelHint, { once: true });
    originCards.addEventListener('wheel', cancelHint, { once: true });
    originCards.addEventListener('touchstart', cancelHint, { once: true });

    const playScrollHint = () => {
      if (hintCancelled) return;
      const distance = 90;
      const duration = 650;
      const start = performance.now();
      const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

      const step = (now) => {
        if (hintCancelled) return;
        const elapsed = now - start;
        if (elapsed < duration) {
          originCards.scrollLeft = distance * easeOutCubic(elapsed / duration);
        } else if (elapsed < duration * 2) {
          originCards.scrollLeft = distance * (1 - easeOutCubic((elapsed - duration) / duration));
        } else {
          originCards.scrollLeft = 0;
          return;
        }
        requestAnimationFrame(step);
      };

      requestAnimationFrame(step);
    };

    const hintObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setTimeout(playScrollHint, 500);
          hintObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    hintObserver.observe(originCards);
  }

  // ---------- stat-value count-up ----------
  const statValues = document.querySelectorAll('.stat-value');

  if (statValues.length) {
    const parsed = Array.from(statValues).map((el) => {
      const match = el.textContent.match(/^([^\d]*)([\d.]+)([^\d]*)$/);
      if (!match) return null;
      const [, prefix, number, suffix] = match;
      const decimals = number.includes('.') ? number.split('.')[1].length : 0;
      return { el, prefix, suffix, decimals, target: parseFloat(number) };
    });

    const animateStat = (stat) => {
      if (!stat) return;
      const duration = 1200;
      const start = performance.now();

      const step = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = (stat.target * eased).toFixed(stat.decimals);
        stat.el.textContent = `${stat.prefix}${current}${stat.suffix}`;
        if (progress < 1) requestAnimationFrame(step);
      };

      requestAnimationFrame(step);
    };

    const statsSection = document.querySelector('.journey-stats');
    if (statsSection) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            parsed.forEach(animateStat);
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.4 });

      observer.observe(statsSection);
    }
  }

  // ---------- products slider ----------
  const slider = document.querySelector('.slider');
  if (!slider) return;

  const slides = Array.from(slider.querySelectorAll('.slide'));
  const dots = Array.from(slider.querySelectorAll('.dot'));
  let active = slides.findIndex((s) => s.classList.contains('is-active'));
  if (active < 0) active = 0;
  let timer = null;

  const goTo = (index) => {
    active = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => slide.classList.toggle('is-active', i === active));
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === active));
  };

  const startAutoplay = () => {
    stopAutoplay();
    timer = setInterval(() => goTo(active + 1), 6000);
  };
  const stopAutoplay = () => { if (timer) clearInterval(timer); };

  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => {
      goTo(i);
      startAutoplay();
    });
  });

  const prevArrow = slider.querySelector('.slider-arrow--prev');
  const nextArrow = slider.querySelector('.slider-arrow--next');

  if (prevArrow) {
    prevArrow.addEventListener('click', () => {
      goTo(active - 1);
      startAutoplay();
    });
  }
  if (nextArrow) {
    nextArrow.addEventListener('click', () => {
      goTo(active + 1);
      startAutoplay();
    });
  }

  slider.addEventListener('mouseenter', stopAutoplay);
  slider.addEventListener('mouseleave', startAutoplay);

  if (slides.length > 1) startAutoplay();
});
