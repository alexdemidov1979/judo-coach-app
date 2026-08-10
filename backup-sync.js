// ================= FIREBASE CLOUD: PRIVATE USER DATA =================
// Firebase Authentication identifies the user. Cloud Firestore stores the
// user's private application data under users/{uid}/data/{key}.
// IndexedDB remains an offline cache; it is not the authoritative cloud store.

(function(){
  'use strict';

  const FIREBASE_KEY_PREFIX = 'jc_';
  let currentFirebaseUser = null;
  let currentProfile = null;
  let firebaseReady = false;
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
    return FIREBASE_KEY_PREFIX + btoa(unescape(encodeURIComponent(String(key))))
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
        uid: currentFirebaseUser?.uid || null,
        email: currentFirebaseUser?.email || null
      },
      data: {}
    };

    try {
      const res = await S.list('');
      for (const key of (res && res.keys) || []) {
        // Never sync internal OAuth/service keys if an old version left them behind.
        if (/^gdrive_/i.test(key)) continue;
        if (/^firebase_/i.test(key)) continue;
        try {
          const r = await S.get(key);
          if (r && r.value !== undefined) dump.data[key] = r.value;
        } catch(e) {}
      }
    } catch(e) {
      console.warn('Firebase cloud dump: unable to read local cache', e);
    }
    return dump;
  }

  async function applyDump(dump){
    if(!dump || typeof dump !== 'object') return;
    const data = dump.data && typeof dump.data === 'object' ? dump.data : null;
    if(data){
      for(const [key, value] of Object.entries(data)){
        try{ await S.set(key, value); }catch(e){ console.warn('Local restore failed:', key, e); }
      }
    }
    try{ await renderCalendar(); }catch(e){}
    try{ await loadSessionsForDate(selectedDate); }catch(e){}
    try{ await renderRoster(); }catch(e){}
    try{ if(document.getElementById('panel-library')?.classList.contains('active')) renderLibrary(); }catch(e){}
    try{ if(document.getElementById('panel-stats')?.classList.contains('active')) renderStats(); }catch(e){}
  }

  async function listCloudDocs(uid){
    const fb = window.JudoFirebase;
    const snap = await fb.getDocs(fb.getUserDataCollection(uid));
    return snap.docs || [];
  }

  async function uploadDumpToFirebase(silent=false){
    const fb = window.JudoFirebase;
    const user = currentFirebaseUser || fb?.getCurrentUser?.();
    if(!fb || !user){
      if(!silent) alert('Сначала войдите в Judo Coach.');
      return false;
    }
    if(syncInProgress) return false;
    syncInProgress = true;
    try{
      setCloudStatus('Синхронизация…', '🟡 Firebase');
      const dump = await buildDump();
      const entries = Object.entries(dump.data || {});
      // One batch is limited to 500 writes. Chunk safely.
      for(let i=0;i<entries.length;i+=450){
        const batch = fb.writeBatch(fb.db);
        for(const [key, value] of entries.slice(i, i+450)){
          batch.set(fb.getUserDataDoc(user.uid, encodeKey(key)), {
            key,
            value,
            updatedAt: fb.serverTimestamp(),
            updatedBy: user.uid
          }, { merge: true });
        }
        await batch.commit();
      }
      const metaRef = fb.getUserDataDoc(user.uid, '__meta__');
      await fb.setDoc(metaRef, {
        key: '__meta__',
        schemaVersion: dump.schemaVersion,
        appVersion: dump.appVersion,
        email: user.email || null,
        updatedAt: fb.serverTimestamp(),
        updatedBy: user.uid,
        dataKeys: entries.length
      }, { merge: true });
      localStorage.setItem('firebase_last_sync', new Date().toISOString());
      setCloudStatus('Данные синхронизированы', '🟢 Firebase Cloud');
      if(!silent) alert('Данные сохранены в Firebase Cloud.');
      return true;
    }catch(e){
      console.error('Firebase upload failed:', e);
      setCloudStatus('Ошибка синхронизации', '🔴 Firebase');
      if(!silent) alert('Не удалось сохранить данные в Firebase.\n\n' + (e?.message || e));
      return false;
    }finally{ syncInProgress = false; }
  }

  async function downloadFromFirebase(silent=false){
    const fb = window.JudoFirebase;
    const user = currentFirebaseUser || fb?.getCurrentUser?.();
    if(!fb || !user){ if(!silent) alert('Сначала войдите в Judo Coach.'); return false; }
    if(syncInProgress) return false;
    syncInProgress = true;
    try{
      setCloudStatus('Загрузка из Firebase…', '🟡 Firebase');
      const docs = await listCloudDocs(user.uid);
      const data = {};
      for(const d of docs){
        const x = d.data();
        if(d.id === encodeKey('__meta__') || x.key === '__meta__') continue;
        if(x.key) data[x.key] = x.value;
        else {
          const decoded = decodeKey(d.id);
          if(decoded && decoded !== d.id) data[decoded] = x.value;
        }
      }
      if(!Object.keys(data).length){
        setCloudStatus('В Firebase пока нет данных', '⚪ Firebase');
        if(!silent) alert('В Firebase пока нет пользовательских данных.');
        return false;
      }
      await applyDump({ schemaVersion: 4, appVersion: '4.0.0', data });
      localStorage.setItem('firebase_last_sync', new Date().toISOString());
      setCloudStatus('Данные загружены', '🟢 Firebase Cloud');
      if(!silent) alert('Данные загружены из Firebase.');
      return true;
    }catch(e){
      console.error('Firebase download failed:', e);
      setCloudStatus('Ошибка загрузки', '🔴 Firebase');
      if(!silent) alert('Не удалось загрузить данные из Firebase.\n\n' + (e?.message || e));
      return false;
    }finally{ syncInProgress = false; }
  }

  async function syncAfterLogin(){
    const fb = window.JudoFirebase;
    if(!fb || !currentFirebaseUser) return;
    if(cloudInitializedForUid === currentFirebaseUser.uid) return;
    cloudInitializedForUid = currentFirebaseUser.uid;
    showCloudSignedIn(true);
    const account = $('cloud-account');
    if(account) account.textContent = `👤 ${currentFirebaseUser.email || currentFirebaseUser.displayName || 'Пользователь'}`;
    setCloudStatus('Проверяем Firebase…', '🟡 Firebase');

    try{
      const docs = await listCloudDocs(currentFirebaseUser.uid);
      const realDocs = docs.filter(d => d.id !== encodeKey('__meta__'));
      const localDump = await buildDump();
      const localKeys = Object.keys(localDump.data || {});

      if(realDocs.length === 0){
        if(localKeys.length){
          await uploadDumpToFirebase(true);
        } else {
          setCloudStatus('Firebase готов', '🟢 Firebase Cloud');
        }
      } else if(localKeys.length){
        // Do not silently destroy either copy. Ask once on first login to this device.
        const decisionKey = `firebase_sync_choice_${currentFirebaseUser.uid}`;
        if(!localStorage.getItem(decisionKey)){
          const useCloud = confirm('Для этого аккаунта уже найдены данные в Firebase.\n\nОК — загрузить данные из Firebase на это устройство.\nОтмена — оставить локальные данные и сохранить их в Firebase поверх облачной версии.');
          localStorage.setItem(decisionKey, useCloud ? 'cloud' : 'local');
          if(useCloud) await downloadFromFirebase(true);
          else await uploadDumpToFirebase(true);
        } else if(localStorage.getItem(decisionKey) === 'cloud') {
          await downloadFromFirebase(true);
        } else {
          await uploadDumpToFirebase(true);
        }
      } else {
        await downloadFromFirebase(true);
      }
    }catch(e){
      console.error('Firebase login sync failed:', e);
      setCloudStatus('Вход выполнен, синхронизация не завершена', '🟠 Firebase');
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
    if(!confirm('Импорт заменит текущие данные локального кэша. После импорта данные можно синхронизировать в Firebase. Продолжить?')) return;
    await applyDump(dump);
    if(currentFirebaseUser) await uploadDumpToFirebase(true);
    alert('Импорт завершён.');
  }

  window.firebaseCloudUpload = uploadDumpToFirebase;
  window.firebaseCloudDownload = downloadFromFirebase;
  window.firebaseCloudCurrentUser = () => currentFirebaseUser;

  function initUi(){
    $('export-btn')?.addEventListener('click', ()=>exportAllData(false));

    $('main-firebase-signin')?.addEventListener('click', async ()=>{
      try{
        if(!window.JudoFirebase) throw new Error('Firebase ещё не инициализирован.');
        const s=$('main-auth-status');
        if(s) s.textContent='Открываем безопасный вход Firebase…';
        await window.JudoFirebase.signIn();
      }catch(e){
        console.error('Main Firebase sign-in failed:', e);
        const s=$('main-auth-status');
        if(s) s.textContent='Ошибка входа: '+(e?.code || e?.message || 'неизвестная ошибка');
        alert('Не удалось начать вход через Firebase.\n\n'+(e?.code || '')+'\n'+(e?.message || e));
      }
    });
    $('main-firebase-signout')?.addEventListener('click', async ()=>{
      try{ await window.JudoFirebase?.signOut(); }catch(e){ alert('Не удалось выйти: '+(e?.message||e)); }
    });
    $('main-firebase-sync')?.addEventListener('click', ()=>uploadDumpToFirebase(false));
    $('import-btn')?.addEventListener('click', ()=>$('import-file')?.click());
    $('import-file')?.addEventListener('change', e=>{
      const file=e.target.files?.[0]; if(file) importAllData(file); e.target.value='';
    });

    $('firebase-signin')?.addEventListener('click', async ()=>{
      try{
        if(!window.JudoFirebase) throw new Error('Firebase ещё не инициализирован.');
        setCloudStatus('Переходим к авторизации…', '🟡 Firebase');
        await window.JudoFirebase.signIn();
      }catch(e){
        console.error(e);
        alert('Не удалось начать вход в Firebase.\n\n' + (e?.message || e));
      }
    });
    $('firebase-signout')?.addEventListener('click', async ()=>{
      try{ await window.JudoFirebase?.signOut(); }catch(e){ alert('Не удалось выйти: '+(e?.message||e)); }
    });
    $('firebase-upload')?.addEventListener('click', ()=>uploadDumpToFirebase(false));
    $('firebase-download')?.addEventListener('click', ()=>downloadFromFirebase(false));
  }

  function onFirebaseState(e){
    const detail=e.detail||{};
    currentFirebaseUser=detail.user||null;
    currentProfile=detail.profile||null;
    const mainStatus=$('main-auth-status');
    const mainUser=$('main-auth-user');
    const mainActions=$('main-auth-actions');
    const mainSignin=$('main-firebase-signin');

    if(currentFirebaseUser){
      showCloudSignedIn(true);
      const account=$('cloud-account');
      if(account) account.textContent=`👤 ${currentFirebaseUser.email || currentFirebaseUser.displayName || 'Пользователь'}`;
      if(mainStatus) mainStatus.textContent='Авторизация Firebase выполнена';
      if(mainUser) mainUser.textContent=`👤 ${currentFirebaseUser.email || currentFirebaseUser.displayName || 'Пользователь'}${detail.profile?.primaryRole ? ' · '+detail.profile.primaryRole : ''}`;
      if(mainUser) mainUser.style.display='block';
      if(mainActions) mainActions.style.display='flex';
      if(mainSignin) mainSignin.style.display='none';
      syncAfterLogin();
    }else{
      cloudInitializedForUid=null;
      showCloudSignedIn(false);
      setCloudStatus('Войдите, чтобы включить Firebase Cloud','⚪ Не подключено');
      if(mainStatus) mainStatus.textContent='Войдите через Google — аккаунт будет защищён Firebase';
      if(mainUser) mainUser.style.display='none';
      if(mainActions) mainActions.style.display='none';
      if(mainSignin) mainSignin.style.display='';
    }
  }

  window.addEventListener('judo:firebase-auth-state', onFirebaseState);
  window.addEventListener('judo:firebase-auth-error', e=>{
    const err=e.detail||{};
    setCloudStatus('Ошибка авторизации', '🔴 Firebase');
    alert('Firebase не смог завершить вход.\n\n'+(err.message||err.code||'Неизвестная ошибка'));
  });

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initUi,{once:true});
  else initUi();
})();
