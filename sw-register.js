  // Регистрация service worker — офлайн-режим, требование PWABuilder для сборки APK,
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
