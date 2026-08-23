  // В нативном Capacitor APK Service Worker не нужен: весь web-код уже лежит внутри APK.
  // Это предотвращает лишний сетевой слой и задержки при запуске Android-приложения.
  const isNativeAndroid = /Android/i.test(navigator.userAgent) && (window.Capacitor?.isNativePlatform?.() || window.location.protocol === 'file:' || window.location.protocol === 'capacitor:');
  if (isNativeAndroid) {
    window.addEventListener('load', () => window.dispatchEvent(new Event('judo:native-ready')));
    return;
  }
  // Регистрация service worker — офлайн-режим PWA.
  // и автообновление: при появлении новой версии показываем баннер вместо тихого обновления.
  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{
      navigator.serviceWorker.register('sw.js').catch(()=>{ /* если файла нет рядом — просто не регистрируем */ });
      navigator.serviceWorker.addEventListener('message', (event)=>{
        if(event.data && event.data.type==='SW_UPDATED'){
          const banner = document.getElementById('pwa-update-banner');
          if(banner) banner.style.display = 'flex';
        }
      });
    });
    document.getElementById('pwa-update-btn') && document.getElementById('pwa-update-btn').addEventListener('click', ()=>{
      location.reload();
    });
  }
