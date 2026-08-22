/* Android shell integration: lifecycle, online status, and safe UX hooks. */
(function(){
  'use strict';
  const isAndroid = /Android/i.test(navigator.userAgent);
  if(!isAndroid) return;

  function emit(name, detail){
    try { window.dispatchEvent(new CustomEvent(name, {detail})); } catch (_) {}
  }

  window.addEventListener('online', () => emit('judo:network', {online:true}));
  window.addEventListener('offline', () => emit('judo:network', {online:false}));

  document.addEventListener('visibilitychange', () => {
    emit(document.hidden ? 'judo:app-paused' : 'judo:app-resumed', {hidden:document.hidden});
  });

  window.JudoAndroidShell = Object.freeze({
    isAndroid: true,
    online(){ return navigator.onLine !== false; },
    vibrate(ms=60){ return !!window.JudoNative?.vibrate?.(ms); },
    landscape(){ return window.JudoNative?.setOrientation?.('landscape'); },
    portrait(){ return window.JudoNative?.setOrientation?.('portrait'); },
    printHtml(html,title){ return window.JudoNative?.printHtml?.(html,title); }
  });
})();
