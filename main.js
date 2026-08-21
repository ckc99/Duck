document.addEventListener('DOMContentLoaded', () => {
  const works = document.querySelectorAll('.work');
  const titles = document.querySelectorAll('.work-title-vertical');
  const gallery = document.querySelector('.works');

  titles.forEach((title) => {
    const characters = title.textContent.trim().split('');
    title.textContent = '';
    characters.forEach((char) => {
      const span = document.createElement('span');
      span.className = 'vchar';
      span.textContent = char;
      title.appendChild(span);
    });
  });

  const revealTitle = (title) => {
    const chars = title.querySelectorAll('.vchar');
    chars.forEach((char, i) => {
      setTimeout(() => char.classList.add('revealed'), i * 180);
    });
  };

  const revealWork = (work, delay) => {
    setTimeout(() => {
      work.classList.add('revealed');
      const title = work.querySelector('.work-title-vertical');
      if (title) revealTitle(title);
    }, delay);
  };

  if (gallery) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          works.forEach((work, i) => revealWork(work, i * 450));
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });

    observer.observe(gallery);
  }
});
