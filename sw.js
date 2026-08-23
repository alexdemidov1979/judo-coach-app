// Service worker: офлайн-режим, кэширование, автообновление.
// Push-уведомления (см. блок в самом низу) требуют backend-сервер,
// который будет отправлять их через Web Push API — статический сайт
// на GitHub Pages сам по себе push прислать не может, только показать
// уведомление, если у него есть повод сделать это (см. showLocalReminder
// в index.html — это локальные напоминания, работающие без сервера).

const CACHE_VERSION = 'v26-mobile-no-ai-offline';
const CACHE_NAME = `judo-coach-cache-${CACHE_VERSION}`;
const CORE_ASSETS = ['./', './index.html', './manifest.json', './styles.css',
  './core-data.js', './drive-video-links.js', './pro-features.js', './roster.js', './library-ui.js', './library-kyu.js',
  './library-techniques-data.js', './library-render.js', './stats-competitions.js', './ofp-attestation.js', './comp-report.html',
  './constructor-timers.js', './backup-sync.js', './navigation-ui.js', './video-tools-misc.js',
  './video-player.js', './training-intelligence.js', './firebase-auth-ui.js', './fight-review-studio.js', './fight-intelligence.js', './video-feedback.js', './supabase-js.vendor.js', './supabase-backend.js', './sw-register.js', './src/core/config/app-config.js', './src/core/video/video-source.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
      await self.clients.claim();
      // Сообщаем всем открытым вкладкам, что появилась новая версия —
      // index.html покажет баннер "Доступно обновление".
      const clientsList = await self.clients.matchAll({ type: 'window' });
      clientsList.forEach((client) => client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION }));
    })()
  );
});

// Стратегия: cache-first. Приложение должно открываться мгновенно и без сети.
// Для уже закэшированных ресурсов свежая версия проверяется в фоне.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);

    const refresh = fetch(event.request).then(res => {
      if (res && res.ok) cache.put(event.request, res.clone()).catch(() => {});
      return res;
    }).catch(() => null);

    if (cached) {
      event.waitUntil(refresh);
      return cached;
    }

    const fresh = await refresh;
    return fresh || cache.match('./index.html');
  })());
});

// ---------- Заготовка под push-уведомления ----------
// Сработает ТОЛЬКО если когда-нибудь появится backend-сервер, который
// отправляет push через Web Push API (нужны VAPID-ключи и подписка
// пользователя через pushManager.subscribe — этого пока нет).
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json(); } catch (e) { payload = { title: 'Judo Coach', body: event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Judo Coach', {
      body: payload.body || '',
      icon: './icon-192.png',
      badge: './icon-192.png',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientsList) => {
      if (clientsList.length > 0) return clientsList[0].focus();
      return self.clients.openWindow('./');
    })
  );
});
