  // ================= BACKUP: EXPORT / IMPORT =================
  async function buildDump(){
    const dump = { schemaVersion: 2, appVersion: '2.0', exportedAt: new Date().toISOString(), roster: [], techniques: [], plans: {} };
    try{ const r = await S.get('roster'); if(r) dump.roster = JSON.parse(r.value); }catch(e){}
    try{ const r = await S.get('techniques'); if(r) dump.techniques = JSON.parse(r.value); }catch(e){}
    try{ const r = await S.get('competitions'); if(r) dump.competitions = JSON.parse(r.value); }catch(e){}
    try{ const r = await S.get('workout_templates'); if(r) dump.workoutTemplates = JSON.parse(r.value); }catch(e){}
    try{
      const res = await S.list('plan:');
      const keys = (res && res.keys) || [];
      for(const k of keys){ try{ const r = await S.get(k); if(r) dump.plans[k] = JSON.parse(r.value); }catch(e){} }
    }catch(e){}
    return dump;
  }
  async function applyDump(dump){
    if(Array.isArray(dump.roster)) await S.set('roster', JSON.stringify(dump.roster));
    if(Array.isArray(dump.techniques)) await S.set('techniques', JSON.stringify(dump.techniques));
    if(Array.isArray(dump.competitions)) await S.set('competitions', JSON.stringify(dump.competitions));
    if(Array.isArray(dump.workoutTemplates)) await S.set('workout_templates', JSON.stringify(dump.workoutTemplates));
    if(dump.plans){ for(const key of Object.keys(dump.plans)){ try{ await S.set(key, JSON.stringify(dump.plans[key])); }catch(e){} } }
    await renderCalendar();
    await loadSessionsForDate(selectedDate);
    await renderRoster();
    if(document.getElementById('panel-library').classList.contains('active')) renderLibrary();
    if(document.getElementById('panel-stats').classList.contains('active')) renderStats();
  }
  async function exportAllData(auto){
    const dump = await buildDump();
    const blob = new Blob([JSON.stringify(dump, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = dump.exportedAt.replace(/[:.]/g,'-');
    a.href = url;
    a.download = auto
      ? `judo-coach-autosave-${stamp}.json`
      : `judo-coach-backup-${dump.exportedAt.slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=> URL.revokeObjectURL(url), 5000);
  }
  async function importAllData(file){
    const text = await file.text();
    let dump;
    try{ dump = JSON.parse(text); }catch(e){ alert('Файл повреждён или не в формате резервной копии.'); return; }
    if(!confirm('Импорт заменит текущие данные (учеников, библиотеку, планы) данными из файла. Продолжить?')) return;
    await applyDump(dump);
    alert('Импорт завершён.');
  }
  document.getElementById('export-btn').addEventListener('click', ()=> exportAllData(false));
  document.getElementById('import-btn').addEventListener('click', ()=> document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', (e)=>{
    const file = e.target.files[0];
    if(file) importAllData(file);
    e.target.value = '';
  });

  // ================= GOOGLE DRIVE SYNC =================
  const DRIVE_FILE_NAME = 'judo-coach-cloud-backup.json';
  const DRIVE_FOLDER_NAME = 'Judo Coach';
  let gdriveFolderId = null;

  async function gdriveFindOrCreateFolder(){
    if(gdriveFolderId) return gdriveFolderId;
    const q = encodeURIComponent(`name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const res = await gdriveFetchWithRetry(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${gdriveAccessToken}` }
    });
    const data = await res.json();
    if(res.ok && data.files && data.files.length){ gdriveFolderId = data.files[0].id; return gdriveFolderId; }
    // папки ещё нет — создаём
    const createRes = await gdriveFetchWithRetry('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { Authorization: `Bearer ${gdriveAccessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
    });
    const createData = await createRes.json();
    if(createRes.ok && createData.id){ gdriveFolderId = createData.id; return gdriveFolderId; }
    return null; // не критично — просто сохраним файл без папки, как раньше
  }

  // ---- Разрешение конфликтов (два устройства) ----
  // Идея простая: после каждой удачной синхронизации (сохранили в облако ИЛИ
  // загрузили из облака) запоминаем "отпечаток" данных и время изменения файла
  // в облаке на тот момент. Перед следующим сохранением сверяем: если файл в
  // облаке с тех пор поменялся (значит, кто-то сохранился с другого устройства)
  // И при этом данные на ЭТОМ устройстве тоже успели измениться — предупреждаем
  // и даём выбрать, а не затираем молча.
  function contentHashOfDump(dump){
    const clone = Object.assign({}, dump);
    delete clone.exportedAt; // это поле всегда разное, даже если данные те же самые
    const str = JSON.stringify(clone);
    let hash = 0;
    for(let i=0;i<str.length;i++){ hash = ((hash<<5) - hash + str.charCodeAt(i)) | 0; }
    return String(hash);
  }
  function rememberSyncPoint(dump, cloudModifiedTime){
    localStorage.setItem('gdrive_last_synced_hash', contentHashOfDump(dump));
    if(cloudModifiedTime) localStorage.setItem('gdrive_last_synced_cloud_modified', cloudModifiedTime);
  }
  async function gdriveGetFileMeta(fileId){
    const res = await gdriveFetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,modifiedTime`, {
      headers: { Authorization: `Bearer ${gdriveAccessToken}` }
    });
    if(!res.ok) return null;
    return res.json();
  }
  let gdriveTokenClient = null;
  let gdriveAccessToken = null;
  let gdriveUserEmail = null;
  // Открывает ссылку Google гарантированно под тем аккаунтом, который вошёл в приложении
  // (если в браузере залогинено несколько Google-аккаунтов сразу).
  function openGoogleUrl(url){
    if(gdriveUserEmail){
      const chooser = `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(gdriveUserEmail)}&continue=${encodeURIComponent(url)}`;
      window.open(chooser, '_blank');
    } else {
      window.open(url, '_blank');
    }
  }
  let gdriveFileId = null;
  let gdriveTokenRefreshTimer = null;

  // Единый Client ID приложения. Один раз создан владельцем в Google Cloud —
  // все пользователи входят через него под своими Google-аккаунтами,
  // данные каждого при этом сохраняются в его собственном Google Диске.
  const GDRIVE_CLIENT_ID = '667949651165-tqvf1ckmba879h5l50f9bkijg118uv1l.apps.googleusercontent.com';
  function gdriveClientId(){ return GDRIVE_CLIENT_ID; }

  function gdriveShowActionsIfReady(){
    document.getElementById('cloud-actions').style.display = 'flex';
  }
  gdriveShowActionsIfReady();

  // Получает email вошедшего пользователя, показывает его в интерфейсе,
  // затем автоматически подгружает его собственный бэкап из облака (если он есть).

  async function gdriveOnSignedIn(){
    document.getElementById('cloud-signed-in').style.display = 'flex';
    document.getElementById('cloud-status').textContent = 'Вход выполнен. Проверяем облако…';
    localStorage.setItem('gdrive_stay_signed_in', '1');
    try{
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${gdriveAccessToken}` }
      });
      if(res.ok){
        const info = await res.json();
        document.getElementById('cloud-account').textContent = '👤 ' + (info.email || 'аккаунт Google');
        gdriveUserEmail = info.email || null;
        if(gdriveUserEmail) localStorage.setItem('gdrive_last_email', gdriveUserEmail);
      }
    }catch(e){ /* не критично, просто не покажем email */ }
    await gdriveAutoLoadOnSignIn();
  }

  async function gdriveAutoLoadOnSignIn(){
    try{
      gdriveFileId = await gdriveFindFileId();
      if(!gdriveFileId){
        document.getElementById('cloud-status').textContent = 'Это ваш первый вход — облачных данных пока нет.';
        return;
      }
      if(!confirm('Найдены ваши сохранённые данные в облаке. Загрузить их? Текущие данные на этом устройстве будут заменены.')){
        document.getElementById('cloud-status').textContent = 'Вход выполнен. Облачные данные не загружены — можно сделать это вручную позже.';
        return;
      }
      const meta = await gdriveGetFileMeta(gdriveFileId);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${gdriveFileId}?alt=media`, {
        headers: { Authorization: `Bearer ${gdriveAccessToken}` }
      });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const dump = await res.json();
      await applyDump(dump);
      rememberSyncPoint(dump, meta && meta.modifiedTime);
      document.getElementById('cloud-status').textContent = 'Ваши данные загружены из облака: ' + new Date().toLocaleString('ru-RU');
    }catch(e){
      document.getElementById('cloud-status').textContent = 'Не удалось проверить облако: ' + e.message;
    }
  }

  function gdriveInitTokenClient(){
    if(!window.google || !google.accounts || !google.accounts.oauth2){ return false; }
    const cid = gdriveClientId();
    if(!cid) return false;
    gdriveTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: cid,
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
      callback: (resp)=>{
        if(resp && resp.access_token){
          gdriveAccessToken = resp.access_token;
          gdriveOnSignedIn();
          gdriveStartTokenRefreshLoop();
        } else {
          document.getElementById('cloud-status').textContent = 'Вход не выполнен: ' + JSON.stringify(resp);
          alert('Google не выдал доступ.\n\n' + JSON.stringify(resp) + '\n\nСфотографируйте и пришлите это сообщение.');
        }
      },
      error_callback: (err)=>{
        document.getElementById('cloud-status').textContent = 'Ошибка входа: ' + (err && err.message ? err.message : JSON.stringify(err));
        alert('Не удалось войти в Google.\n\n' + (err && err.message ? err.message : JSON.stringify(err)) + '\n\nСфотографируйте и пришлите это сообщение.');
      }
    });
    return true;
  }

  document.getElementById('gdrive-signout').addEventListener('click', ()=>{
    if(!confirm('Выйти из аккаунта Google? Локальные данные на устройстве останутся, но перестанут автоматически сохраняться в облако до следующего входа.')) return;
    if(gdriveAccessToken && window.google && google.accounts && google.accounts.oauth2){
      google.accounts.oauth2.revoke(gdriveAccessToken, ()=>{});
    }
    gdriveAccessToken = null;
    gdriveFileId = null;
    gdriveUserEmail = null;
    localStorage.removeItem('gdrive_stay_signed_in');
    localStorage.removeItem('gdrive_last_email');
    if(gdriveTokenRefreshTimer) clearInterval(gdriveTokenRefreshTimer);
    document.getElementById('cloud-signed-in').style.display = 'none';
    document.getElementById('cloud-account').textContent = '';
    document.getElementById('cloud-status').textContent = 'Не синхронизировано';
    renderDemidovCard('loggedout');
  });

  document.getElementById('gdrive-signin').addEventListener('click', ()=>{
    if(!gdriveTokenClient && !gdriveInitTokenClient()){
      alert('Google-скрипт ещё не загрузился. Подождите пару секунд и попробуйте снова.');
      return;
    }
    gdriveTokenClient.requestAccessToken();
  });

  async function gdriveFindFileId(){
    const folderId = await gdriveFindOrCreateFolder();
    if(folderId){
      const qInFolder = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false and '${folderId}' in parents`);
      const resInFolder = await gdriveFetchWithRetry(`https://www.googleapis.com/drive/v3/files?q=${qInFolder}&spaces=drive&fields=files(id,name)`, {
        headers: { Authorization: `Bearer ${gdriveAccessToken}` }
      });
      const dataInFolder = await resInFolder.json();
      if(resInFolder.ok && dataInFolder.files && dataInFolder.files.length) return dataInFolder.files[0].id;
    }
    // на случай старой резервной копии, сохранённой ещё до появления папки «Judo Coach»
    const q = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
    const res = await gdriveFetchWithRetry(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${gdriveAccessToken}` }
    });
    const data = await res.json();
    if(!res.ok){
      const msg = (data && data.error && data.error.message) ? data.error.message : `HTTP ${res.status}`;
      throw new Error('Поиск файла: ' + msg);
    }
    if(data.files && data.files.length) return data.files[0].id;
    return null;
  }

  async function gdriveUpload(silent, force){
    if(!gdriveAccessToken){ if(!silent) alert('Сначала войдите в Google.'); return; }
    const statusEl = document.getElementById('cloud-status');
    if(statusEl) statusEl.textContent = 'Сохранение в облако…';
    try{
      const dump = await buildDump();

      // --- проверка конфликта, если это не принудительная перезапись ---
      if(!force){
        if(!gdriveFileId) gdriveFileId = await gdriveFindFileId();
        if(gdriveFileId){
          const meta = await gdriveGetFileMeta(gdriveFileId);
          const cloudModified = meta && meta.modifiedTime;
          const lastKnownCloudModified = localStorage.getItem('gdrive_last_synced_cloud_modified');
          const cloudChangedElsewhere = cloudModified && lastKnownCloudModified && cloudModified !== lastKnownCloudModified;
          if(cloudChangedElsewhere){
            const localChangedHere = contentHashOfDump(dump) !== localStorage.getItem('gdrive_last_synced_hash');
            if(localChangedHere){
              if(silent){
                // Фоновая синхронизация: ничего не решаем сами, просто не затираем чужие данные молча.
                if(statusEl) statusEl.textContent = 'В облаке есть изменения с другого устройства — откройте «Облако» и выберите, что оставить.';
                showCloudToast('⚠️ Конфликт данных с другим устройством — нужно ваше решение');
                return;
              }
              const useCloud = confirm(
                'Обнаружены изменения на другом устройстве после последней синхронизации.\n\n' +
                'Нажмите «ОК», чтобы ЗАГРУЗИТЬ данные из облака (текущие данные этого устройства будут заменены).\n' +
                'Нажмите «Отмена», чтобы оставить данные ЭТОГО устройства и записать их поверх облака.'
              );
              if(useCloud){
                await gdriveDownload(true);
                return;
              }
              // иначе — продолжаем ниже и перезаписываем облако локальными данными
            } else {
              // Локально ничего не менялось — просто подхватываем более свежую версию из облака.
              await gdriveDownload(true);
              return;
            }
          }
        }
      }

      const content = JSON.stringify(dump, null, 2);
      if(!gdriveFileId) gdriveFileId = await gdriveFindFileId();
      let metadata = { name: DRIVE_FILE_NAME, mimeType: 'application/json' };
      if(!gdriveFileId){
        const folderId = await gdriveFindOrCreateFolder();
        if(folderId) metadata.parents = [folderId];
      }
      const boundary = 'judocoachboundary';
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
      const url = gdriveFileId
        ? `https://www.googleapis.com/upload/drive/v3/files/${gdriveFileId}?uploadType=multipart&fields=id,modifiedTime`
        : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime`;
      const res = await gdriveFetchWithRetry(url, {
        method: gdriveFileId ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${gdriveAccessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body
      });
      const data = await res.json();
      if(!res.ok){
        const msg = (data && data.error && data.error.message) ? data.error.message : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      if(data.id){ gdriveFileId = data.id; }
      rememberSyncPoint(dump, data.modifiedTime);
      if(statusEl) statusEl.textContent = 'Сохранено в облако: ' + new Date().toLocaleString('ru-RU');
      showCloudToast('☁️ Сохранено в Google Drive');
    }catch(e){
      if(statusEl) statusEl.textContent = 'Ошибка сохранения: ' + e.message;
      if(!silent){
        alert('Не удалось сохранить в облако.\n\n' + e.message + '\n\nСфотографируйте это сообщение и пришлите его для диагностики.');
      } else {
        showCloudToast('⚠️ Не удалось синхронизировать с облаком (данные сохранены на телефоне)');
      }
    }
  }

  // Ненавязчивое уведомление внизу экрана — не блокирует работу, само исчезает
  let cloudToastTimer = null;
  function showCloudToast(text){
    let el = document.getElementById('cloud-toast');
    if(!el){
      el = document.createElement('div');
      el.id = 'cloud-toast';
      el.style.cssText = 'position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:500;background:var(--navy,#1a2f4a);color:#fff;padding:8px 16px;border-radius:20px;font-size:12.5px;box-shadow:0 4px 14px rgba(0,0,0,.3);opacity:0;transition:opacity .25s;pointer-events:none;max-width:88vw;text-align:center;';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = '1';
    clearTimeout(cloudToastTimer);
    cloudToastTimer = setTimeout(()=>{ el.style.opacity = '0'; }, 2200);
  }

  async function gdriveDownload(silent){
    if(!gdriveAccessToken){ if(!silent) alert('Сначала войдите в Google.'); return; }
    document.getElementById('cloud-status').textContent = 'Загрузка из облака…';
    try{
      if(!gdriveFileId) gdriveFileId = await gdriveFindFileId();
      if(!gdriveFileId){
        if(!silent) alert('В облаке пока нет резервной копии. Сначала нажмите «Сохранить в облако».');
        document.getElementById('cloud-status').textContent = 'Резервной копии не найдено.';
        return;
      }
      const meta = await gdriveGetFileMeta(gdriveFileId);
      const res = await gdriveFetchWithRetry(`https://www.googleapis.com/drive/v3/files/${gdriveFileId}?alt=media`, {
        headers: { Authorization: `Bearer ${gdriveAccessToken}` }
      });
      if(!res.ok){
        let msg = `HTTP ${res.status}`;
        try{ const errData = await res.json(); if(errData && errData.error && errData.error.message) msg = errData.error.message; }catch(e2){}
        throw new Error(msg);
      }
      const dump = await res.json();
      if(!silent && !confirm('Загрузка из облака заменит текущие данные на этом телефоне. Продолжить?')) return;
      await applyDump(dump);
      rememberSyncPoint(dump, meta && meta.modifiedTime);
      document.getElementById('cloud-status').textContent = 'Загружено из облака: ' + new Date().toLocaleString('ru-RU');
      if(silent) showCloudToast('☁️ Подхватили более свежие данные с другого устройства');
    }catch(e){
      document.getElementById('cloud-status').textContent = 'Ошибка загрузки: ' + e.message;
      if(!silent) alert('Не удалось загрузить из облака.\n\n' + e.message + '\n\nСфотографируйте это сообщение и пришлите его для диагностики.');
    }
  }

  document.getElementById('gdrive-upload').addEventListener('click', ()=> gdriveUpload(false));
  document.getElementById('gdrive-download').addEventListener('click', gdriveDownload);

  // ---- Тихое восстановление сессии при каждом открытии + автобэкап не чаще раза в сутки ----
  function gdriveAutoSyncDoneToday(){
    return localStorage.getItem('gdrive_last_autosync') === new Date().toISOString().slice(0,10);
  }
  function gdriveMarkAutoSyncDone(){
    localStorage.setItem('gdrive_last_autosync', new Date().toISOString().slice(0,10));
  }
  async function gdriveSilentRestore(){
    try{
      if(!gdriveClientId()) return;
      if(!gdriveTokenClient && !gdriveInitTokenClient()) return;
      if(localStorage.getItem('gdrive_stay_signed_in') !== '1') return; // раньше не входили — не дёргаем Google
      gdriveTokenClient.requestAccessToken({
        prompt: '',
        callback: async (resp)=>{
          if(resp && resp.access_token){
            gdriveAccessToken = resp.access_token;
            await gdriveOnSignedIn();
            document.getElementById('cloud-status').textContent = 'Сессия восстановлена автоматически.';
            if(!gdriveAutoSyncDoneToday()){
              await gdriveUpload(true);
              gdriveMarkAutoSyncDone();
            }
            gdriveStartTokenRefreshLoop();
          }
          // тихая неудача (нет активной сессии Google в браузере) — просто остаёмся разлогинены, без alert
        }
      });
    }catch(e){ /* тихо игнорируем — это фоновая попытка */ }
  }

  // Токен доступа Google живёт около часа. Пока приложение открыто и человек
  // залогинен, обновляем токен заранее в фоне, чтобы не разлогинивало посреди работы.
  function gdriveStartTokenRefreshLoop(){
    if(gdriveTokenRefreshTimer) clearInterval(gdriveTokenRefreshTimer);
    gdriveTokenRefreshTimer = setInterval(()=>{
      if(localStorage.getItem('gdrive_stay_signed_in') !== '1') return;
      if(!gdriveTokenClient) return;
      gdriveTokenClient.requestAccessToken({
        prompt: '',
        callback: (resp)=>{ if(resp && resp.access_token) gdriveAccessToken = resp.access_token; }
      });
    }, 45*60*1000); // каждые 45 минут
  }

  // Если запрос к Google Диску вернул 401 (токен истёк) — тихо получаем новый токен и повторяем запрос один раз.
  async function gdriveFetchWithRetry(url, options){
    let res = await fetch(url, options);
    if(res.status === 401 && gdriveTokenClient){
      const refreshed = await new Promise(resolve=>{
        gdriveTokenClient.requestAccessToken({
          prompt: '',
          callback: (resp)=>{
            if(resp && resp.access_token){ gdriveAccessToken = resp.access_token; resolve(true); }
            else resolve(false);
          }
        });
      });
      if(refreshed){
        const retryOptions = { ...options, headers: { ...(options.headers||{}), Authorization: `Bearer ${gdriveAccessToken}` } };
        res = await fetch(url, retryOptions);
      }
    }
    return res;
  }

  window.addEventListener('load', ()=>{
    setTimeout(()=>{
      gdriveInitTokenClient();
      gdriveShowActionsIfReady();
      setTimeout(gdriveSilentRestore, 2000);
    }, 500);
  });

  // ================= EXCEL IMPORT (ROSTER) =================
  function normalizeHeader(h){
    return String(h||'').trim().toLowerCase().replace(/ё/g,'е');
  }
  const HEADER_MAP = {
    surname: ['фамилия','фамилия ученика'],
    firstname: ['имя','имя ученика'],
    patronymic: ['отчество'],
    name: ['фио','фамилия имя','ученик','фамилия имя отчество'],
    birthDate: ['дата рождения','дата рожд.','др','дата рождения спортсмена'],
    weight: ['вес','вес, кг','вес кг','весовая категория','вес спортсмена'],
    rank: ['разряд','спортивный разряд'],
    kyu: ['пояс по дзюдо','пояс','кю','кю/дан','дан','дзюдо пояс'],
    birthCertificate: ['свидетельство о рождении','свидетельство','свид-во о рождении'],
    medCert: ['мед справка','мед.справка','справка','мед.справка до','медсправка','медицинская справка'],
    playerNumber: ['номер игрока','номер спортсмена','номер'],
    parentPhone: ['телефон','телефон родителей','контакт','тел.','телефон родителя','телефон ответственного'],
    responsiblePerson: ['ответственное лицо','родитель','представитель','законный представитель'],
    trainingGroup: ['тренировки','группа'],
    notes: ['примечание','заметка','заметки']
  };
  // Значения-статусы для документов (свидетельство/мед.справка), которые не являются датой
  const DOC_STATUS_MAP = {
    'да':'есть', 'есть':'есть', 'в наличии':'есть',
    'нет':'отсутствует', 'отсутствует':'отсутствует', 'отсутствие':'отсутствует'
  };
  function tryParseDateOrText(val){
    if(typeof val === 'number'){
      const d = XLSX.SSF.parse_date_code(val);
      if(d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
      return String(val);
    }
    const str = String(val).trim();
    const lower = str.toLowerCase();
    if(DOC_STATUS_MAP[lower]) return DOC_STATUS_MAP[lower]; // не дата — статус "есть"/"отсутствует"
    const parts = str.split(/[.\/-]/);
    if(parts.length===3 && parts.every(p=>/^\d+$/.test(p))){
      if(parts[0].length===4) return `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
      return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
    }
    return str; // произвольный текст (номер документа, комментарий и т.п.)
  }
  function mapRowToStudent(row, headers){
    const student = {name:'', birthDate:'', weight:'', kyu:'Без пояса', medCert:'', parentPhone:'', rating:'', paid:{},
      surname:'', firstname:'', patronymic:'', rank:'', birthCertificate:'', playerNumber:'', responsiblePerson:'', trainingGroup:''};
    headers.forEach((h,i)=>{
      const nh = normalizeHeader(h);
      for(const field of Object.keys(HEADER_MAP)){
        if(HEADER_MAP[field].some(alias=> nh===alias || nh.includes(alias))){
          let val = row[i];
          if(val===undefined || val===null || val==='') return;
          if(field==='birthDate'){
            if(typeof val === 'number'){
              const d = XLSX.SSF.parse_date_code(val);
              if(d) val = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
            } else {
              const parts = String(val).split(/[.\/-]/);
              if(parts.length===3){
                if(parts[0].length===4) val = `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
                else val = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
              }
            }
            student[field] = String(val).trim();
          } else if(field==='medCert' || field==='birthCertificate'){
            student[field] = String(tryParseDateOrText(val)).trim();
          } else {
            student[field] = String(val).trim();
          }
        }
      }
    });
    // Собираем ФИО из Фамилия+Имя+Отчество, если они были отдельными колонками
    const fio = [student.surname, student.firstname, student.patronymic].filter(Boolean).join(' ').trim();
    if(fio) student.name = fio;
    delete student.surname; delete student.firstname; delete student.patronymic;
    return student;
  }
  document.getElementById('excel-import-btn').addEventListener('click', ()=> document.getElementById('excel-file').click());
  document.getElementById('excel-file').addEventListener('change', async (e)=>{
    const file = e.target.files[0];
    e.target.value = '';
    if(!file) return;
    await loadXLSX();
    const reader = new FileReader();
    reader.onload = async (ev)=>{
      try{
        const wb = XLSX.read(ev.target.result, {type:'array', cellDates:false});
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, {header:1, raw:true});
        if(rows.length < 2){ alert('В файле не найдено строк с данными.'); return; }
        const headers = rows[0];
        const students = rows.slice(1)
          .filter(r=> r && r.length && r.some(c=>c!==undefined && c!==''))
          .map(r=> mapRowToStudent(r, headers))
          .filter(s=> s.name);
        if(students.length===0){ alert('Не удалось найти колонку с именами. Убедитесь, что в первой строке есть заголовок «Имя», «Фамилия» или «ФИО».'); return; }
        const list = await getRoster();
        let added = 0, updated = 0;
        students.forEach(s=>{
          const existingIdx = list.findIndex(r => r.name===s.name && (r.birthDate||'')===(s.birthDate||''));
          if(existingIdx>-1){
            // Обновляем только заполненные поля, не трогая историю/посещаемость/техники существующего ученика
            Object.keys(s).forEach(k=>{ if(s[k]) list[existingIdx][k] = s[k]; });
            updated++;
          } else {
            list.push(s);
            added++;
          }
        });
        if(!confirm(`В файле найдено: ${students.length}.\nНовых: ${added}, будет обновлено существующих: ${updated}.\n\nПродолжить?`)) return;
        await setRoster(list);
        renderRoster();
        renderSessions();
        alert(`Импорт завершён. Добавлено: ${added}, обновлено: ${updated}.`);
      }catch(err){
        alert('Не удалось прочитать файл. Проверьте, что это .xlsx, .xls или .csv.');
      }
    };
    reader.readAsArrayBuffer(file);
  });

