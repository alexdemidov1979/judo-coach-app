// ================= PRO / LITE =================
// Единая точка правды о том, куплена ли полная версия приложения,
// и какие ограничения действуют в бесплатной (Lite) версии.
//
// Сейчас статус Pro хранится локально + в профиле пользователя на сервере,
// а разблокировка происходит через тестовую кнопку (см. showUpsell).
// Когда приложение будет опубликовано в RuStore / App Store, вызов
// showUpsell() нужно будет заменить на реальную покупку через
// RuStore Pay SDK (Android) или StoreKit (iOS), а после успешной
// оплаты — вызывать ProFeatures.setPro(true) и сохранять это в профиле пользователя на сервере.
(function () {
  const LOCAL_KEY = 'jc_pro_status';

  // Что ограничено в бесплатной версии.
  const FREE_LIMITS = {
    maxAthletes: 20,        // всего учеников во всех группах
    maxTechniqueRank: 5,    // видео-библиотека: бесплатно открыт только базовый уровень 5 кю
    cloudSync: false,       // облачная синхронизация/резервная копия через сервер
    excelImport: false,     // импорт списка учеников из Excel/CSV
    video: false,           // видео выше 5 кю, разбор боёв, карта техники
    stats: false,           // Статистика, отчёты
    aiCoach: false          // ИИ-тренер (автоматические тренировочные задачи по разбору)
  };

  let isPro = false;
  try { isPro = localStorage.getItem(LOCAL_KEY) === '1'; } catch (e) {}

  function setPro(value) {
    isPro = !!value;
    try { localStorage.setItem(LOCAL_KEY, isPro ? '1' : '0'); } catch (e) {}
    try { window.JudoFirebase?.setProStatus?.(isPro); } catch (e) {}
    window.dispatchEvent(new CustomEvent('judo:pro-status', { detail: { isPro } }));
  }

  // Если во время входа у пользователя в профиле уже стоит
  // isPro (например, куплено ранее на другом устройстве) — подхватываем.
  window.addEventListener('judo:firebase-auth-state', (e) => {
    const profile = e.detail && e.detail.profile;
    if (profile && typeof profile.isPro === 'boolean' && profile.isPro !== isPro) {
      setPro(profile.isPro);
    }
  });

  function upsellText(featureLabel) {
    return `«${featureLabel}» — функция полной версии.\n\n`
      + `FREE (бесплатно):\n`
      + `· до ${FREE_LIMITS.maxAthletes} учеников\n`
      + `· базовый таймер\n`
      + `· календарь\n`
      + `· базовые тренировки\n`
      + `· видео-библиотека 5 кю (базовый уровень)\n\n`
      + `PRO (полная версия):\n`
      + `· неограниченные ученики\n`
      + `· облачная синхронизация\n`
      + `· импорт из Excel\n`
      + `· статистика\n`
      + `· вся видео-библиотека и разбор техник\n`
      + `· ИИ-тренер`;
  }

  function showUpsell(featureLabel) {
    // TODO: заменить это временное окно на реальную покупку через
    // магазин приложений, когда будет готова публикация в RuStore/App Store.
    const buyNow = confirm(
      upsellText(featureLabel) +
      '\n\n[Тестовый режим] Нажмите ОК, чтобы условно включить полную версию на этом устройстве.'
    );
    if (buyNow) {
      setPro(true);
      alert('Полная версия включена (тестовый режим, без реальной оплаты).');
    }
  }

  function requirePro(featureLabel) {
    if (isPro) return true;
    showUpsell(featureLabel);
    return false;
  }

  // ---- Блокировка целых экранов/блоков оверлеем (для статистики, аналитики и т.д.) ----
  function lockElement(el, featureLabel) {
    if (!el || el.dataset.proLocked === '1') return;
    el.dataset.proLocked = '1';
    if (!el.style.position) el.style.position = 'relative';
    const overlay = document.createElement('div');
    overlay.className = 'pro-lock-overlay';
    overlay.innerHTML = `<div class="pro-lock-box">🔒 <b>${featureLabel}</b><br><span>Доступно в полной версии</span><br><button type="button" class="btn small gold pro-lock-btn">Подробнее</button></div>`;
    overlay.querySelector('.pro-lock-btn').addEventListener('click', () => showUpsell(featureLabel));
    el.appendChild(overlay);
  }
  function unlockElement(el) {
    if (!el) return;
    el.dataset.proLocked = '0';
    const overlay = el.querySelector(':scope > .pro-lock-overlay');
    if (overlay) overlay.remove();
  }
  // Возвращает true, если экран доступен (Pro или уже разблокирован).
  function guardPanel(panelId, featureLabel) {
    const el = document.getElementById(panelId);
    if (!el) return true;
    if (isPro) { unlockElement(el); return true; }
    lockElement(el, featureLabel);
    return false;
  }

  window.ProFeatures = {
    get isPro() { return isPro; },
    limits: FREE_LIMITS,
    setPro,
    requirePro,
    showUpsell,
    guardPanel,
    lockElement,
    unlockElement
  };

  function renderStatusCard() {
    const text = document.getElementById('pro-status-text');
    const btn = document.getElementById('pro-status-btn');
    if (!text || !btn) return;
    if (isPro) {
      text.innerHTML = '✅ У вас <b>полная версия</b> — все функции открыты.';
      btn.style.display = 'none';
    } else {
      text.innerHTML = `Сейчас у вас <b>FREE</b> (бесплатная версия): до ${FREE_LIMITS.maxAthletes} учеников, базовый таймер, календарь, базовые тренировки.`;
      btn.style.display = '';
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    renderStatusCard();
    document.getElementById('pro-status-btn')?.addEventListener('click', () => showUpsell('Полная версия'));
  });
  window.addEventListener('judo:pro-status', renderStatusCard);
})();
