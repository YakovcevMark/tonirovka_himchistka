const SERVICE_DATA = {
  tinting: {
    title: 'Тонировка автомобилей',
    description: 'Стоимость зависит от типа кузова и выбранной задачи. Точную комплектацию и время мастер уточняет по телефону.',
    prices: ['Седан — от 250 р', 'Универсал — от 230 р', 'Хэтчбек — от 200 р', 'Минивэн — от 270 р', 'Бус — от 300 р'],
    note: 'Напишите мастеру, чтобы уточнить доступные варианты для вашего автомобиля.',
    photos: [
      ['images/works/tinting-05.webp', 'Автомобиль в студии LDV Detailing'],
      ['images/works/tinting-10.webp', 'Минивэн в студии LDV Detailing'],
      ['images/works/tinting-14.webp', 'Автомобиль в студии LDV Detailing'],
      ['images/works/tinting-16.webp', 'Автомобиль в студии LDV Detailing'],
    ],
  },
  interior: {
    title: 'Химчистка салона',
    description: 'Стоимость зависит от типа автомобиля и состояния салона. Перед записью обсудим объём работ и удобное время.',
    prices: ['Седан / хэтчбек — от 180 р', 'Универсал / минивэн — от 200 р'],
    note: 'Для предварительной оценки можно отправить мастеру фотографии салона в мессенджере.',
    photos: [
      ['images/works/interior-cleaning-01.webp', 'Салон автомобиля, пример работы'],
      ['images/works/interior-cleaning-02.webp', 'Салон автомобиля, рабочий процесс'],
      ['images/works/interior-cleaning-03.webp', 'Салон автомобиля, рабочий процесс'],
    ],
  },
  ppf: {
    title: 'Оклейка антигравийной плёнкой',
    description: 'Для этой услуги стоимость рассчитывается индивидуально по автомобилю, зонам защиты и выбранному материалу.',
    prices: ['Стоимость — после уточнения задачи и автомобиля'],
    note: 'Перечень зон, материалы и примеры работ добавим после уточнения деталей у мастера.',
    photos: [],
  },
  roof: {
    title: 'Перетяжка потолка и стоек',
    description: 'В стоимость входит конкретная работа по элементу салона. Материал и объём согласовываются до записи.',
    prices: ['Потолок — от 300 р', 'Стойки — от 40 р', 'Дверные карты — от 50 р'],
    note: 'Срок и итоговую цену мастер уточняет после понимания объёма работ.',
    photos: [
      ['images/works/roof-upholstery-01.webp', 'Потолок автомобиля в процессе работы'],
      ['images/works/roof-upholstery-02.webp', 'Стойка салона автомобиля'],
    ],
  },
  headlights: {
    title: 'Полировка фар',
    description: 'Восстановление внешнего вида фар с расчётом по конкретной задаче автомобиля.',
    prices: ['Полировка фар — от 60 р'],
    note: 'Итог зависит от состояния фар и согласовывается до начала работ.',
    photos: [
      ['images/works/headlight-polishing-01.webp', 'Фара автомобиля, пример работы'],
      ['images/works/headlight-polishing-02.webp', 'Фара автомобиля, пример работы'],
    ],
  },
};

const modal = document.querySelector('#service-modal');
const modalTitle = document.querySelector('#modal-title');
const modalDescription = document.querySelector('#modal-description');
const modalPrices = document.querySelector('#modal-prices');
const modalNote = document.querySelector('#modal-note');
const modalGallery = document.querySelector('#modal-gallery');
const closeButton = document.querySelector('.modal-close');
const lightbox = document.querySelector('#lightbox');
const lightboxImage = document.querySelector('#lightbox-image');
const lightboxCaption = document.querySelector('#lightbox-caption');
const lightboxCounter = document.querySelector('#lightbox-counter');
const lightboxStage = document.querySelector('[data-lightbox-stage]');
let lastFocusedElement = null;
let lastLightboxFocus = null;
let lightboxItems = [];
let lightboxIndex = 0;
let lightboxScale = 1;

/**
 * Fills the service modal with the confirmed price and photo data for one service.
 * Gallery thumbnails are buttons so the same content works with mouse and keyboard.
 */
function fillServiceModal(service) {
  modalTitle.textContent = service.title;
  modalDescription.textContent = service.description;
  modalNote.textContent = service.note;
  modalPrices.replaceChildren(...service.prices.map((price) => {
    const item = document.createElement('li');
    item.textContent = price;
    return item;
  }));

  if (service.photos.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'modal-empty';
    empty.textContent = 'Фото работ для этой услуги добавим после уточнения подборки.';
    modalGallery.replaceChildren(empty);
    return;
  }

  const gallery = service.photos.map(([src, alt]) => ({ src, alt }));
  modalGallery.replaceChildren(...gallery.map((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'image-trigger';
    button.setAttribute('aria-label', `Открыть фото ${index + 1} из ${gallery.length}`);
    const image = document.createElement('img');
    image.src = item.src;
    image.alt = item.alt;
    image.loading = 'lazy';
    button.append(image);
    button.addEventListener('click', () => openLightbox(gallery, index, button));
    return button;
  }));
}

/**
 * Opens a service dialog and returns focus to the triggering card after closing.
 */
function openServiceModal(serviceId, trigger) {
  const service = SERVICE_DATA[serviceId];
  if (!service || !modal) return;

  lastFocusedElement = trigger;
  fillServiceModal(service);
  modal.hidden = false;
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  closeButton?.focus();
}

/**
 * Closes the active service dialog and restores focus to its trigger.
 */
function closeServiceModal() {
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  lastFocusedElement?.focus();
}

/**
 * Updates the lightbox image, counter and zoom transform.
 */
function renderLightbox() {
  const item = lightboxItems[lightboxIndex];
  if (!item || !lightboxImage || !lightboxCaption || !lightboxCounter) return;

  lightboxImage.src = item.src;
  lightboxImage.alt = item.alt;
  lightboxCaption.textContent = item.alt;
  lightboxCounter.textContent = `${lightboxIndex + 1} / ${lightboxItems.length}`;
  lightboxImage.style.transform = `scale(${lightboxScale})`;
  lightboxStage?.classList.toggle('is-zoomed', lightboxScale > 1);
  const resetButton = document.querySelector('[data-lightbox-reset]');
  if (resetButton) resetButton.textContent = `${Math.round(lightboxScale * 100)}%`;
}

/**
 * Opens a full-screen image viewer with navigation and zoom controls.
 */
function openLightbox(items, index, trigger) {
  if (!lightbox || items.length === 0) return;

  lastLightboxFocus = trigger;
  lightboxItems = items;
  lightboxIndex = index;
  lightboxScale = 1;
  renderLightbox();
  lightbox.hidden = false;
  lightbox.classList.add('is-open');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.classList.add('lightbox-open');
}

/**
 * Closes the lightbox without closing the service dialog underneath it.
 */
function closeLightbox() {
  if (!lightbox) return;
  lightbox.classList.remove('is-open');
  lightbox.hidden = true;
  lightbox.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('lightbox-open');
  lastLightboxFocus?.focus();
}

/**
 * Moves the lightbox selection in either direction, wrapping at the ends.
 */
function moveLightbox(direction) {
  if (lightboxItems.length === 0) return;
  lightboxIndex = (lightboxIndex + direction + lightboxItems.length) % lightboxItems.length;
  lightboxScale = 1;
  renderLightbox();
}

/**
 * Applies a bounded zoom level to keep the image usable on small screens.
 */
function setLightboxZoom(nextScale) {
  lightboxScale = Math.min(3, Math.max(1, nextScale));
  renderLightbox();
}

document.querySelectorAll('[data-service]').forEach((card) => {
  const button = card.querySelector('.card-action');
  const serviceId = card.getAttribute('data-service');
  if (!button || !serviceId) return;

  card.addEventListener('click', (event) => {
    if (event.target.closest('a')) return;
    openServiceModal(serviceId, card);
  });
  card.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openServiceModal(serviceId, card);
  });
});

document.querySelectorAll('[data-modal-close]').forEach((element) => {
  element.addEventListener('click', closeServiceModal);
});

document.querySelectorAll('[data-lightbox-close]').forEach((element) => {
  element.addEventListener('click', closeLightbox);
});
document.querySelector('[data-lightbox-prev]')?.addEventListener('click', () => moveLightbox(-1));
document.querySelector('[data-lightbox-next]')?.addEventListener('click', () => moveLightbox(1));
document.querySelector('[data-lightbox-zoom-in]')?.addEventListener('click', () => setLightboxZoom(lightboxScale + .5));
document.querySelector('[data-lightbox-zoom-out]')?.addEventListener('click', () => setLightboxZoom(lightboxScale - .5));
document.querySelector('[data-lightbox-reset]')?.addEventListener('click', () => setLightboxZoom(1));
lightboxImage?.addEventListener('click', () => setLightboxZoom(lightboxScale > 1 ? 1 : 2));

let touchStartX = 0;
lightboxStage?.addEventListener('touchstart', (event) => { touchStartX = event.changedTouches[0]?.clientX ?? 0; }, { passive: true });
lightboxStage?.addEventListener('touchend', (event) => {
  const delta = (event.changedTouches[0]?.clientX ?? 0) - touchStartX;
  if (Math.abs(delta) > 55 && lightboxScale === 1) moveLightbox(delta > 0 ? -1 : 1);
}, { passive: true });

/**
 * Adds horizontal wheel scrolling and autoplay without capturing photo clicks.
 */
function initWorksCarousel() {
  const carousel = document.querySelector('[data-carousel]');
  const viewport = carousel?.querySelector('[data-carousel-viewport]');
  const previous = carousel?.querySelector('.carousel-button--prev');
  const next = carousel?.querySelector('.carousel-button--next');
  const slides = [...(carousel?.querySelectorAll('.works-slide img') ?? [])];
  if (!carousel || !viewport || !previous || !next || slides.length === 0) return;

  const items = slides.map((image) => ({ src: image.currentSrc || image.src, alt: image.alt }));
  slides.forEach((image, index) => {
    const trigger = image.parentElement;
    if (!trigger) return;
    image.draggable = false;
    trigger.tabIndex = 0;
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('aria-label', `Открыть фото ${index + 1} из ${slides.length}`);
    trigger.addEventListener('click', () => openLightbox(items, index, trigger));
    trigger.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openLightbox(items, index, trigger);
    });
  });
  let timerId = 0;

  const step = () => (viewport.querySelector('.works-slide')?.getBoundingClientRect().width ?? viewport.clientWidth * .8) + 14;
  const updateControls = () => {
    // Ignore the track's 3px inset when scroll snap settles on the first slide.
    const edgeTolerance = 5;
    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const hasLeft = viewport.scrollLeft > edgeTolerance;
    const hasRight = viewport.scrollLeft < maxScroll - edgeTolerance;
    previous.disabled = !hasLeft;
    next.disabled = !hasRight;
    carousel.classList.toggle('has-left', hasLeft);
    carousel.classList.toggle('has-right', hasRight);
  };
  const move = (direction) => viewport.scrollBy({ left: direction * step(), behavior: 'smooth' });
  const startAutoplay = () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || timerId) return;
    timerId = window.setInterval(() => {
      const maxScroll = viewport.scrollWidth - viewport.clientWidth - 2;
      viewport.scrollTo({ left: viewport.scrollLeft >= maxScroll ? 0 : viewport.scrollLeft + step(), behavior: 'smooth' });
    }, 5000);
  };
  const stopAutoplay = () => { window.clearInterval(timerId); timerId = 0; };

  previous.addEventListener('click', () => { stopAutoplay(); move(-1); });
  next.addEventListener('click', () => { stopAutoplay(); move(1); });
  viewport.addEventListener('scroll', updateControls, { passive: true });
  viewport.addEventListener('wheel', (event) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || viewport.scrollWidth <= viewport.clientWidth) return;
    event.preventDefault();
    stopAutoplay();
    viewport.scrollBy({ left: event.deltaY, behavior: 'smooth' });
  }, { passive: false });
  carousel.addEventListener('mouseenter', stopAutoplay);
  carousel.addEventListener('mouseleave', startAutoplay);
  carousel.addEventListener('focusin', stopAutoplay);
  carousel.addEventListener('focusout', startAutoplay);
  document.addEventListener('visibilitychange', () => (document.hidden ? stopAutoplay() : startAutoplay()));
  window.addEventListener('resize', updateControls);
  updateControls();
  startAutoplay();
}

initWorksCarousel();

document.addEventListener('keydown', (event) => {
  if (lightbox?.classList.contains('is-open')) {
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft') moveLightbox(-1);
    if (event.key === 'ArrowRight') moveLightbox(1);
    if (event.key === '+' || event.key === '=') setLightboxZoom(lightboxScale + .5);
    if (event.key === '-') setLightboxZoom(lightboxScale - .5);
    return;
  }
  if (event.key === 'Escape' && modal?.classList.contains('is-open')) closeServiceModal();
});
