// ================= SUPABASE CLOUD: PRIVATE USER DATA =================
// Supabase Auth identifies the user. Supabase stores the
// user's private application data under users/{uid}/data/{key}.
// IndexedDB remains an offline cache; it is not the authoritative cloud store.

(function(){
  'use strict';

  const CLOUD_KEY_PREFIX = 'jc_';
  let currentCloudUser = null;
  let currentProfile = null;
  let cloudReady = false;
  let syncInProgress = false;
  let cloudInitializedForUid = null;

  function $(id){ return document.getElementById(id); }
  function setCloudStatus(text, badge){
    const status = $('cloud-status');
    const b = $('cloud-sync-badge');
    if(status) status.textContent = text;
    if(b && badge) b.textContent = badge;
  }
  function showCloudSignedIn(show){
    const signed = $('cloud-signed-in');
    const signin = $('firebase-signin');
    if(signed) signed.style.display = show ? 'flex' : 'none';
    if(signin) signin.style.display = show ? 'none' : '';
  }

  function encodeKey(key){
    // Firestore document IDs cannot contain '/'. Base64url is compact and safe.
    return CLOUD_KEY_PREFIX + btoa(unescape(encodeURIComponent(String(key))))
      .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function decodeKey(id){
    const raw = String(id || '').replace(/^jc_/,'').replace(/-/g,'+').replace(/_/g,'/');
    const padded = raw + '='.repeat((4 - raw.length % 4) % 4);
    try { return decodeURIComponent(escape(atob(padded))); } catch { return id; }
  }

  async function buildDump(){
    const dump = {
      schemaVersion: 4,
      appVersion: '4.0.0',
      exportedAt: new Date().toISOString(),
      client: { platform: /Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'web' },
      user: {
        uid: currentCloudUser?.uid || null,
        email: currentCloudUser?.email || null
      },
      data: {}
    };

    try {
      const res = await S.list('');
      const keys = ((res && res.keys) || []).filter(key =>
        // Never sync internal OAuth/service keys if an old version left them behind.
        !/^gdrive_/i.test(key) && !/^firebase_/i.test(key)
      );
      // Раньше ключи читались по одному в цикле (await внутри for) — при
      // большом числе тренировок/учеников это заметно замедляло вход и
      // синхронизацию. Читаем всё параллельно.
      await Promise.all(keys.map(async key => {
        try {
          const r = await S.get(key);
          if (r && r.value !== undefined) dump.data[key] = r.value;
        } catch(e) {}
      }));
    } catch(e) {
      console.warn('Supabase cloud dump: unable to read local cache', e);
    }
    return dump;
  }

  async function applyDump(dump){
    if(!dump || typeof dump !== 'object') return;
    const data = dump.data && typeof dump.data === 'object' ? dump.data : null;
    if(data){
      await Promise.all(Object.entries(data).map(async ([key, value]) => {
        try{ await S.set(key, value); }catch(e){ console.warn('Local restore failed:', key, e); }
      }));
    }
    try{ await renderCalendar(); }catch(e){}
    try{ await loadSessionsForDate(selectedDate); }catch(e){}
    try{ await renderRoster(); }catch(e){}
    try{ if(document.getElementById('panel-library')?.classList.contains('active')) renderLibrary(); }catch(e){}
    try{ if(document.getElementById('panel-stats')?.classList.contains('active')) renderStats(); }catch(e){}
  }

  // Если сеть/антивирус блокирует соединение с Firestore, запрос может
  // висеть без ответа сколь угодно долго. Ограничиваем ожидание, чтобы
  // интерфейс не застревал навечно на "Проверяем Supabase…".
  function withTimeout(promise, ms, label){
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error(`Таймаут: ${label || 'операция'} не ответила за ${Math.round(ms/1000)} сек.`)),
        ms
      ))
    ]);
  }

  // В России Firestore/Firebase Auth иногда недоступны без VPN (сети
  // некоторых операторов ограничивают доступ к инфраструктуре Google).
  // Вместо невнятной "ошибки синхронизации" объясняем, что происходит —
  // и напоминаем, что локальные данные при этом никуда не пропадают.
  function friendlyNetworkError(e){
    const msg = String(e?.message || e || '');
    if(/Таймаут|network|unavailable|Failed to fetch|ERR_|offline/i.test(msg)){
      return 'Нет связи с сервером. Работаем локально — данные сохранены на телефоне.';
    }
    return 'Ошибка синхронизации: ' + msg;
  }

  async function listCloudRows(uid){
    // Оставлено для обратной совместимости вызовов ниже по файлу — теперь
    // просто дёргает download и оборачивает в псевдо-список "документов",
    // раз в других местах проверяют .length.
    const fb = window.JudoFirebase;
    const data = await withTimeout(fb.downloadDataDump(), 20000, 'загрузка данных с сервера');
    return Object.keys(data||{}).map(k=>({id:k}));
  }

  async function uploadDumpToCloud(silent=false){
    const fb = window.JudoFirebase;
    const user = currentCloudUser || fb?.getCurrentUser?.();
    if(!fb || !user){
      if(!silent) alert('Сначала войдите в Judo Coach.');
      return false;
    }
    if(syncInProgress) return false;
    syncInProgress = true;
    try{
      setCloudStatus('Синхронизация…', '🟡 Сервер');
      const dump = await buildDump();
      const entries = Object.entries(dump.data || {}).map(([key,value])=>({key,value}));
      await withTimeout(fb.uploadDataDump(entries), 20000, 'выгрузка данных на сервер');
      localStorage.setItem('judo_last_sync', new Date().toISOString());
      setCloudStatus('Данные синхронизированы', '🟢 Сервер');
      if(!silent) alert('Данные сохранены на сервере.');
      return true;
    }catch(e){
      console.error('Server upload failed:', e);
      setCloudStatus(friendlyNetworkError(e), '🔴 Сервер');
      if(!silent) alert('Не удалось сохранить данные на сервере.\n\n' + friendlyNetworkError(e));
      return false;
    }finally{ syncInProgress = false; }
  }

  // Полностью очищает локальные данные приложения перед переключением аккаунта.
  // Важно: используем S.delete, но временно блокируем автосинхронизацию,
  // чтобы удаление старого аккаунта не улетело в облако нового аккаунта.
  let suppressAutoSync = false;
  async function clearLocalUserData(){
    const res = await S.list('');
    const keys = Array.isArray(res?.keys) ? res.keys : [];
    suppressAutoSync = true;
    window.__JUDO_SUPPRESS_AUTO_SYNC = true;
    try {
      await Promise.all(keys.map(key => S.delete(key)));
    } finally {
      suppressAutoSync = false;
      window.__JUDO_SUPPRESS_AUTO_SYNC = false;
    }
  }

  async function downloadFromCloud(silent=false){
    const fb = window.JudoFirebase;
    const user = currentCloudUser || fb?.getCurrentUser?.();
    if(!fb || !user){ if(!silent) alert('Сначала войдите в Judo Coach.'); return false; }
    if(syncInProgress) return false;
    syncInProgress = true;
    try{
      setCloudStatus('Загрузка с сервера…', '🟡 Сервер');
      const data = await withTimeout(fb.downloadDataDump(), 20000, 'загрузка данных с сервера');
      if(!Object.keys(data).length){
        setCloudStatus('На сервере пока нет данных', '⚪ Сервер');
        if(!silent) alert('На сервере пока нет пользовательских данных.');
        return false;
      }
      await applyDump({ schemaVersion: 4, appVersion: '4.0.0', data });
      localStorage.setItem('judo_last_sync', new Date().toISOString());
      setCloudStatus('Данные загружены', '🟢 Сервер');
      if(!silent) alert('Данные загружены с сервера.');
      return true;
    }catch(e){
      console.error('Server download failed:', e);
      setCloudStatus(friendlyNetworkError(e), '🔴 Сервер');
      if(!silent) alert('Не удалось загрузить данные с сервера.\n\n' + friendlyNetworkError(e));
      return false;
    }finally{ syncInProgress = false; }
  }

  async function syncAfterLogin(){
    const fb = window.JudoFirebase;
    if(!fb || !currentCloudUser) return;
    if(cloudInitializedForUid === currentCloudUser.uid) return;
    // ЗАЩИТА ОТ УТЕЧКИ МЕЖДУ АККАУНТАМИ.
    // Локальные данные на телефоне не привязаны к конкретному Firebase-аккаунту
    // сами по себе — раньше при первом входе НОВОЙ почты, если в её облаке ещё
    // пусто, а на устройстве остались данные от ПРЕДЫДУЩЕГО вошедшего аккаунта,
    // они молча заливались в облако нового аккаунта. Теперь мы запоминаем,
    // какому аккаунту принадлежат локальные данные, и при смене аккаунта на
    // этом устройстве явно спрашиваем, а не переносим автоматически.
    const OWNER_KEY = 'jc_local_data_owner_uid';
    const storedOwner = localStorage.getItem(OWNER_KEY);
    if(storedOwner && storedOwner !== currentCloudUser.uid){
      const keep = confirm(
        `На этом устройстве есть локальные данные ДРУГОГО аккаунта.\n\n`+
        `Чтобы не перепутать тренировки разных тренеров, они НЕ будут отправлены в облако текущего аккаунта (${currentCloudUser.email||''}).\n\n`+
        `ОК — скачать данные текущего аккаунта из облака (заменит то, что видно на экране сейчас).\n`+
        `Отмена — выйти из аккаунта и ничего не менять.`
      );
      if(!keep){
        try{ await fb.signOut(); }catch(e){}
        return;
      }
      cloudInitializedForUid = currentCloudUser.uid;
      showCloudSignedIn(true);
      setCloudStatus('Переключаем локальные данные на новый аккаунт…', '🟡 Supabase');
      try{
        await clearLocalUserData();
        const docs = await listCloudRows(currentCloudUser.uid);
        const realDocs = docs.filter(d => d.id !== encodeKey('__meta__'));
        if(realDocs.length){ await downloadFromCloud(true); }
        else { setCloudStatus('Supabase готов (новый аккаунт, данных пока нет)', '🟢 Supabase Cloud'); }
        localStorage.setItem(OWNER_KEY, currentCloudUser.uid);
      }catch(e){
        console.error('Account switch sync failed:', e);
        setCloudStatus('Вход выполнен. ' + friendlyNetworkError(e), '🟠 Supabase');
      }
      return;
    }
    if(!storedOwner) localStorage.setItem(OWNER_KEY, currentCloudUser.uid);

    cloudInitializedForUid = currentCloudUser.uid;
    showCloudSignedIn(true);
    const account = $('cloud-account');
    if(account) account.textContent = `👤 ${currentCloudUser.email || currentCloudUser.displayName || 'Пользователь'}`;
    setCloudStatus('Проверяем Supabase…', '🟡 Supabase');

    try{
      const docs = await listCloudRows(currentCloudUser.uid);
      const realDocs = docs.filter(d => d.id !== encodeKey('__meta__'));
      const localDump = await buildDump();
      const localKeys = Object.keys(localDump.data || {});

      if(realDocs.length === 0){
        if(localKeys.length){
          await uploadDumpToCloud(true);
        } else {
          setCloudStatus('Supabase готов', '🟢 Supabase Cloud');
        }
      } else if(localKeys.length){
        // Do not silently destroy either copy. Ask once on first login to this device.
        const decisionKey = `firebase_sync_choice_${currentCloudUser.uid}`;
        if(!localStorage.getItem(decisionKey)){
          const useCloud = confirm('Для этого аккаунта уже найдены данные на сервере.\n\nОК — загрузить данные с сервера на это устройство.\nОтмена — оставить локальные данные и сохранить их на сервере поверх облачной версии.');
          localStorage.setItem(decisionKey, useCloud ? 'cloud' : 'local');
          if(useCloud) await downloadFromCloud(true);
          else await uploadDumpToCloud(true);
        } else if(localStorage.getItem(decisionKey) === 'cloud') {
          await downloadFromCloud(true);
        } else {
          await uploadDumpToCloud(true);
        }
      } else {
        await downloadFromCloud(true);
      }
    }catch(e){
      console.error('Supabase login sync failed:', e);
      setCloudStatus('Вход выполнен. ' + friendlyNetworkError(e), '🟠 Supabase');
    }
  }

  async function exportAllData(auto){
    const dump = await buildDump();
    const blob = new Blob([JSON.stringify(dump, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = dump.exportedAt.replace(/[:.]/g,'-');
    a.href = url;
    a.download = auto ? `judo-coach-autosave-${stamp}.json` : `judo-coach-backup-${dump.exportedAt.slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),5000);
  }

  async function importAllData(file){
    const text = await file.text();
    let dump;
    try{ dump = JSON.parse(text); }catch(e){ alert('Файл повреждён или не в формате резервной копии.'); return; }
    if(!confirm('Импорт заменит текущие данные локального кэша. После импорта данные можно синхронизировать с сервером. Продолжить?')) return;
    await applyDump(dump);
    if(currentCloudUser) await uploadDumpToCloud(true);
    alert('Импорт завершён.');
  }

  window.cloudUpload = uploadDumpToCloud;
  window.cloudDownload = downloadFromCloud;
  window.cloudCurrentUser = () => currentCloudUser;
  // Backward-compatible names used by the existing UI/data layer.
  window.cloudUpload = uploadDumpToCloud;
  window.firebaseCloudDownload = downloadFromCloud;
  window.cloudCurrentUser = () => currentCloudUser;

  function initUi(){
    $('export-btn')?.addEventListener('click', ()=>exportAllData(false));

    $('main-firebase-signin')?.addEventListener('click', async ()=>{
      // Кнопка главного экрана не должна вызывать signIn() без email/пароля.
      // Открываем штатную форму авторизации, где пользователь вводит данные.
      document.getElementById('main-auth-card')?.scrollIntoView({behavior:'smooth', block:'center'});
      document.getElementById('auth-login-email')?.focus();
    });
    $('main-firebase-signout')?.addEventListener('click', async ()=>{
      try{ await window.JudoFirebase?.signOut(); }catch(e){ alert('Не удалось выйти: '+(e?.message||e)); }
    });
    $('main-firebase-sync')?.addEventListener('click', ()=>uploadDumpToCloud(false));
    $('import-btn')?.addEventListener('click', ()=>$('import-file')?.click());
    $('import-file')?.addEventListener('change', e=>{
      const file=e.target.files?.[0]; if(file) importAllData(file); e.target.value='';
    });

    $('firebase-signin')?.addEventListener('click', ()=>{
      document.getElementById('main-auth-card')?.scrollIntoView({behavior:'smooth',block:'center'});
      document.getElementById('auth-login-email')?.focus();
    });
    $('firebase-signout')?.addEventListener('click', async ()=>{
      try{ await window.JudoFirebase?.signOut(); }catch(e){ alert('Не удалось выйти: '+(e?.message||e)); }
    });
    $('firebase-upload')?.addEventListener('click', ()=>{
      uploadDumpToCloud(false);
    });
    $('firebase-download')?.addEventListener('click', ()=>{
      downloadFromCloud(false);
    });
  }

  function onFirebaseState(e){
    const detail=e.detail||{};
    currentCloudUser=detail.user||null;
    currentProfile=detail.profile||null;
    const mainStatus=$('main-auth-status');
    const mainUser=$('main-auth-user');
    const mainActions=$('main-auth-actions');
    const mainSignin=$('main-firebase-signin');

    if(currentCloudUser){
      showCloudSignedIn(true);
      const account=$('cloud-account');
      if(account) account.textContent=`👤 ${currentCloudUser.email || currentCloudUser.displayName || 'Пользователь'}`;
      if(mainStatus) mainStatus.textContent='Авторизация выполнена';
      if(mainUser) mainUser.textContent=`👤 ${currentCloudUser.email || currentCloudUser.displayName || 'Пользователь'}${detail.profile?.primaryRole ? ' · '+detail.profile.primaryRole : ''}`;
      if(mainUser) mainUser.style.display='block';
      if(mainActions) mainActions.style.display='flex';
      if(mainSignin) mainSignin.style.display='none';
      syncAfterLogin();
    }else{
      cloudInitializedForUid=null;
      showCloudSignedIn(false);
      setCloudStatus('Войдите, чтобы включить облачную синхронизацию','⚪ Не подключено');
      if(mainStatus) mainStatus.textContent='Вход и регистрация · email + пароль';
      if(mainUser) mainUser.style.display='none';
      if(mainActions) mainActions.style.display='none';
      if(mainSignin) mainSignin.style.display='';
    }
  }

  window.addEventListener('judo:firebase-auth-state', onFirebaseState);
  window.addEventListener('judo:pro-status', (e)=>{
    if(e.detail?.isPro && currentCloudUser){
      cloudInitializedForUid = null; // разрешаем повторный запуск синхронизации
      syncAfterLogin();
    }
  });
  window.addEventListener('judo:firebase-auth-error', e=>{
    const err=e.detail||{};
    setCloudStatus('Ошибка авторизации', '🔴 Supabase');
    alert('Не удалось завершить вход.\n\n'+(err.message||err.code||'Неизвестная ошибка'));
  });

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initUi,{once:true});
  else initUi();
})();
