  // ================= DATA LAYER: IndexedDB (основное хранилище) =================
  // Раньше все данные лежали в localStorage — у него жёсткий лимит ~5-10 МБ на
  // весь сайт, и при большом числе учеников/тренировок/лет работы этого может
  // не хватить. IndexedDB не имеет такого маленького лимита (обычно сотни МБ,
  // а часто и больше, в зависимости от свободного места на устройстве).
  //
  // Публичный интерфейс S.get/set/delete/list ниже НЕ изменился — остальной
  // код приложения продолжает работать без каких-либо правок.
  //
  // При первом запуске новой версии все существующие данные из localStorage
  // автоматически копируются в IndexedDB (localStorage при этом не стирается —
  // это подстраховка на случай сбоя миграции).
  let memoryFallback = {};
  let useMemory = false;
  try{
    localStorage.setItem('__test__','1');
    localStorage.removeItem('__test__');
  }catch(e){ useMemory = true; }

  const IDB_SUPPORTED = (typeof indexedDB !== 'undefined');
  const IDB_NAME = 'judocoach_db';
  const IDB_STORE = 'kv';

  let _dbPromise = null;
  function openDB(){
    if(_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve)=>{
      if(!IDB_SUPPORTED){ resolve(null); return; }
      try{
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = (e)=>{
          const db = e.target.result;
          if(!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, {keyPath:'key'});
        };
        req.onsuccess = ()=> resolve(req.result);
        req.onerror = ()=> resolve(null); // при любой ошибке — тихо переходим на localStorage/память
      }catch(e){ resolve(null); }
    });
    return _dbPromise;
  }
  function idbGet(key){
    return openDB().then(db=>{
      if(!db) return undefined;
      return new Promise(resolve=>{
        try{
          const tx = db.transaction(IDB_STORE,'readonly');
          const req = tx.objectStore(IDB_STORE).get(key);
          req.onsuccess = ()=> resolve(req.result ? req.result.value : undefined);
          req.onerror = ()=> resolve(undefined);
        }catch(e){ resolve(undefined); }
      });
    });
  }
  function idbSet(key, value){
    return openDB().then(db=>{
      if(!db) return false;
      return new Promise(resolve=>{
        try{
          const tx = db.transaction(IDB_STORE,'readwrite');
          tx.objectStore(IDB_STORE).put({key, value});
          tx.oncomplete = ()=> resolve(true);
          tx.onerror = ()=> resolve(false);
        }catch(e){ resolve(false); }
      });
    });
  }
  function idbDelete(key){
    return openDB().then(db=>{
      if(!db) return false;
      return new Promise(resolve=>{
        try{
          const tx = db.transaction(IDB_STORE,'readwrite');
          tx.objectStore(IDB_STORE).delete(key);
          tx.oncomplete = ()=> resolve(true);
          tx.onerror = ()=> resolve(false);
        }catch(e){ resolve(false); }
      });
    });
  }
  function idbListKeys(prefix){
    return openDB().then(db=>{
      if(!db) return [];
      return new Promise(resolve=>{
        try{
          const tx = db.transaction(IDB_STORE,'readonly');
          const req = tx.objectStore(IDB_STORE).getAllKeys();
          req.onsuccess = ()=> resolve((req.result||[]).filter(k=> typeof k==='string' && k.startsWith(prefix)));
          req.onerror = ()=> resolve([]);
        }catch(e){ resolve([]); }
      });
    });
  }

  // Однократная миграция localStorage → IndexedDB (без удаления исходных данных)
  let _migrated = null;
  function ensureMigrated(){
    if(_migrated) return _migrated;
    _migrated = (async ()=>{
      if(!IDB_SUPPORTED || useMemory) return;
      try{
        const flag = await idbGet('__migrated_from_localstorage__');
        if(flag) return;
        for(let i=0;i<localStorage.length;i++){
          const k = localStorage.key(i);
          if(k==null) continue;
          const existing = await idbGet(k);
          if(existing===undefined){
            const v = localStorage.getItem(k);
            await idbSet(k, v);
          }
        }
        await idbSet('__migrated_from_localstorage__', '1');
      }catch(e){}
    })();
    return _migrated;
  }

  // ================= СИСТЕМА ВЕРСИЙ ДАННЫХ (миграции при обновлении приложения) =================
  // Каждый раз, когда структура хранимых данных меняется (например, у ученика
  // появляется новое поле или меняется формат старого), номер ниже увеличивается
  // на 1, а в MIGRATIONS дописывается функция, которая аккуратно переводит
  // старые данные в новый формат — БЕЗ удаления и БЕЗ потери того, что уже
  // накопилось у тренера. Ничего внутри S.get/S.set менять не нужно.
  //
  // Как добавлять миграцию в будущем:
  //   1) увеличить DATA_SCHEMA_VERSION на 1
  //   2) добавить в MIGRATIONS ключ с новым номером версии и async-функцией,
  //      которая читает нужные ключи через S.get/S.list, преобразует данные
  //      и сохраняет их обратно через S.set.
  // Миграции выполняются по порядку, одна за другой, один-единственный раз —
  // после успешного выполнения версия в хранилище обновляется.
  const DATA_SCHEMA_VERSION = 3;
  const DATA_SCHEMA_KEY = 'data_schema_version';
  const MIGRATIONS = {
    // v2: готовим стабильные идентификаторы спортсменов для будущей
    // межустройственной синхронизации. Старые записи не удаляются.
    2: async function(){
      try{
        const raw = await rawGet('roster');
        if(!raw) return;
        const list = JSON.parse(raw);
        if(!Array.isArray(list)) return;
        let changed = false;
        const seen = new Set();
        for(const s of list){
          if(!s || typeof s !== 'object') continue;
          if(!s.id){
            const base = String(s.playerNumber || s.name || 'athlete').trim().toLowerCase().replace(/[^a-zа-я0-9]+/gi,'-').slice(0,50);
            let id = base || 'athlete';
            let n = 2;
            while(seen.has(id)) id = base + '-' + n++;
            s.id = id;
            changed = true;
          }
          if(!s.createdAt){ s.createdAt = new Date().toISOString(); changed = true; }
          if(!s.updatedAt){ s.updatedAt = s.createdAt; changed = true; }
          seen.add(s.id);
        }
        if(changed) await rawSet('roster', JSON.stringify(list));
      }catch(e){}
    },
    // v3: создаём отдельный расширенный профиль athlete:<id> без удаления
    // существующих полей roster. Профиль используется для Judo DNA, целей,
    // game plan и будущей аналитики/AI.
    3: async function(){
      try{
        const raw = await rawGet('roster');
        if(!raw) return;
        const list = JSON.parse(raw);
        if(!Array.isArray(list)) return;
        const t = new Date().toISOString();
        for(const s of list){
          if(!s || !s.id) continue;
          const key='athlete:'+s.id;
          const existing=await rawGet(key);
          if(existing) continue;
          const profile={
            id:s.id, schemaVersion:1, createdAt:s.createdAt||t, updatedAt:t,
            goals:[], strengths:[], weaknesses:[],
            skills:{ukemi:0,kuzushi:0,tsukuri:0,kake:0,tachiWaza:0,neWaza:0,randori:0,tactics:0},
            assessments:[],
            gamePlan:{grip:'',firstAttack:'',continuation:'',neWaza:'',notes:''},
            coachNotes:'', focusNext:'', linkedTechniques:[], linkedExercises:[], lastReviewAt:null
          };
          await rawSet(key, JSON.stringify(profile));
        }
      }catch(e){}
    }
  };
  // Низкоуровневый доступ в обход S — специально, чтобы миграции не вызывали
  // сами себя по кругу (S.get/S.set сами запускают миграции перед работой).
  async function rawGet(key){
    if(IDB_SUPPORTED) return await idbGet(key);
    return useMemory ? memoryFallback[key] : localStorage.getItem(key);
  }
  async function rawSet(key, value){
    if(IDB_SUPPORTED){ await idbSet(key, value); return; }
    if(useMemory) memoryFallback[key] = value; else { try{ localStorage.setItem(key, value); }catch(e){} }
  }
  let _migrationsDone = null;
  function runDataMigrations(){
    if(_migrationsDone) return _migrationsDone;
    _migrationsDone = (async ()=>{
      try{
        const stored = await rawGet(DATA_SCHEMA_KEY);
        let version = stored ? parseInt(stored, 10) : 1; // старые данные без маркера проходят все миграции
        if(!Number.isFinite(version)) version = 1;
        while(version < DATA_SCHEMA_VERSION){
          const next = version + 1;
          if(typeof MIGRATIONS[next] === 'function'){
            await MIGRATIONS[next]();
          }
          version = next;
        }
        await rawSet(DATA_SCHEMA_KEY, String(DATA_SCHEMA_VERSION));
      }catch(e){ /* не критично — при следующем запуске попробуем снова */ }
    })();
    return _migrationsDone;
  }

  const S = {

    async get(key){
      await ensureMigrated();
      await runDataMigrations();
      if(IDB_SUPPORTED){
        const v = await idbGet(key);
        if(v!==undefined) return {key, value:v};
        return null;
      }
      const v = useMemory ? (memoryFallback[key] ?? null) : localStorage.getItem(key);
      if(v===null || v===undefined) return null;
      return {key, value:v};
    },
    async set(key, value){
      await ensureMigrated();
      await runDataMigrations();
      if(IDB_SUPPORTED){
        await idbSet(key, value);
      } else {
        if(useMemory) memoryFallback[key] = value; else { try{ localStorage.setItem(key, value); }catch(e){} }
      }
      scheduleAutoCloudSync();
      return {key, value};
    },
    async delete(key){
      await ensureMigrated();
      await runDataMigrations();
      if(IDB_SUPPORTED){
        await idbDelete(key);
      } else {
        if(useMemory) delete memoryFallback[key]; else localStorage.removeItem(key);
      }
      scheduleAutoCloudSync();
      return {key, deleted:true};
    },
    async list(prefix){
      prefix = prefix || '';
      await ensureMigrated();
      await runDataMigrations();
      if(IDB_SUPPORTED){
        const keys = await idbListKeys(prefix);
        return {keys};
      }
      const keys = [];
      if(useMemory){
        Object.keys(memoryFallback).forEach(k=>{ if(k.startsWith(prefix)) keys.push(k); });
      } else {
        for(let i=0;i<localStorage.length;i++){
          const k = localStorage.key(i);
          if(k && k.startsWith(prefix)) keys.push(k);
        }
      }
      return {keys};
    }
  };

  // ---------- Автосинхронизация Firebase ----------
  let autoCloudSyncTimer = null;
  function scheduleAutoCloudSync(){
    clearTimeout(autoCloudSyncTimer);
    autoCloudSyncTimer = setTimeout(()=>{
      if(typeof window.firebaseCloudUpload === 'function') window.firebaseCloudUpload(true);
    }, 1200);
  }

  // ---------- Beep ----------
  // Раньше сигнал включался мгновенно на полную громкость — это даёт резкий "щелчок"
  // и грубый, неприятный звук. Плюс браузеры/WebView могут "усыплять" AudioContext,
  // и без resume() сигнал иногда вообще не звучал. Ниже — мягкий колокольчатый тон
  // (плавное нарастание + пара тихих обертонов) и обязательный resume() перед каждым сигналом.
  let actx;
  function ensureAudioContext(){
    if(!actx){
      try{ actx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return null; }
    }
    if(actx.state === 'suspended'){ actx.resume().catch(()=>{}); }
    return actx;
  }
  // Разблокируем звук при самом первом касании экрана — на телефонах браузер иначе
  // может не дать звуку заиграть до первого пользовательского действия.
  ['pointerdown','touchstart','click'].forEach(evt=>{
    document.addEventListener(evt, ()=>ensureAudioContext(), {once:true, passive:true});
  });

  function beep(freq=880, dur=150, vol=0.55){
    try{
      const ctx = ensureAudioContext();
      if(!ctx) return;
      const now = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.linearRampToValueAtTime(vol, now + 0.012); // плавный старт — без щелчка
      master.gain.exponentialRampToValueAtTime(0.0001, now + dur/1000);
      master.connect(ctx.destination);

      // Основной тон
      const o1 = ctx.createOscillator();
      o1.type = 'sine';
      o1.frequency.value = freq;
      o1.connect(master);
      o1.start(now);
      o1.stop(now + dur/1000 + 0.05);

      // Тихий обертон на квинту с октавой выше — даёт мягкий "колокольчик" вместо плоского гудка
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = freq * 2.5;
      const g2 = ctx.createGain();
      g2.gain.value = 0.16;
      o2.connect(g2); g2.connect(master);
      o2.start(now);
      o2.stop(now + dur/1000 + 0.05);
    }catch(e){}
  }
  // Отдельный узнаваемый сигнал на самое начало тренировки (после отсчёта готовности)
  function beepStart(){
    beep(660,150,0.5);
    setTimeout(()=>beep(880,150,0.5), 170);
    setTimeout(()=>beep(1100,280,0.5), 340);
  }
  // Двойной сигнал на окончание каждого раунда работы
  function beepRoundEnd(){
    beep(600,150,0.45);
    setTimeout(()=>beep(600,150,0.45), 190);
  }

  // ---------- Вибрация на ключевых событиях таймера ----------
  function vibrate(pattern){
    try{ if('vibrate' in navigator) navigator.vibrate(pattern); }catch(e){}
  }

  // ---------- Голосовые команды (Хаджиме / Матэ / Соремадэ) ----------
  // Работает через встроенный синтез речи браузера — без внешних аудиофайлов.
  let voiceEnabled = localStorage.getItem('voice_announce') === '1';
  function speak(text){
    if(!voiceEnabled) return;
    try{
      if(!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ru-RU'; u.rate = 0.95; u.pitch = 1;
      window.speechSynthesis.speak(u);
    }catch(e){}
  }

  // ================= CALENDAR + MULTI-SESSION DAY =================
  let viewDate = new Date();
  let selectedDate = new Date();
  let currentSessions = []; // sessions for the selected date, in-memory working copy
  let activeSessionIndex = null; // for library insert target
  let dayStatusMap = {}; // dateKeyShort -> array of statuses, for the visible month

  const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const pad = n => String(n).padStart(2,'0');
  const dateKey = d => `plan:${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const monthPrefix = d => `plan:${d.getFullYear()}-${pad(d.getMonth()+1)}`;
  const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
  // ---------- Ленивая загрузка тяжёлых библиотек (только когда реально нужны) ----------
  const _loadedScripts = {};
  function loadScriptOnce(url){
    if(_loadedScripts[url]) return _loadedScripts[url];
    _loadedScripts[url] = new Promise((resolve, reject)=>{
      const s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return _loadedScripts[url];
  }
  const loadChartJS = async () => null; // Графики рисуются встроенным canvas, без CDN.

  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
  const dowNames = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  const statusColor = {planned:'var(--gold)', done:'var(--ok)', cancelled:'var(--belt-red)'};
  const statusLabel = {planned:'Запланирована', done:'Проведена', cancelled:'Отменена'};

  async function loadMonthStatuses(d){
    dayStatusMap = {};
    try{
      const res = await S.list(monthPrefix(d));
      const keys = (res && res.keys) || [];
      for(const k of keys){
        try{
          const r = await S.get(k);
          if(r){
            const sessions = JSON.parse(r.value);
            dayStatusMap[k] = (sessions||[]).map(s=>s.status||'planned');
          }
        }catch(e){}
      }
    }catch(e){}
  }

  function renderDow(){
    document.getElementById('cal-dow').innerHTML = dowNames.map(d=>`<div class="cal-dow">${d}</div>`).join('');
  }

  async function renderCalendar(){
    document.getElementById('cal-month').textContent = `${monthNames[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
    await loadMonthStatuses(viewDate);
    const grid = document.getElementById('cal-grid');
    grid.innerHTML = '';
    const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    let startDow = (first.getDay()+6)%7;
    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth()+1, 0).getDate();
    const prevDays = new Date(viewDate.getFullYear(), viewDate.getMonth(), 0).getDate();

    const cells = [];
    for(let i=startDow-1;i>=0;i--) cells.push({day: prevDays-i, other:true, date: new Date(viewDate.getFullYear(), viewDate.getMonth()-1, prevDays-i)});
    for(let d=1; d<=daysInMonth; d++) cells.push({day:d, other:false, date: new Date(viewDate.getFullYear(), viewDate.getMonth(), d)});
    let next=1;
    while(cells.length % 7 !== 0){ cells.push({day:next, other:true, date: new Date(viewDate.getFullYear(), viewDate.getMonth()+1, next)}); next++; }

    const today = new Date();
    cells.forEach(c=>{
      const div = document.createElement('div');
      div.className = 'cal-day' + (c.other?' other':'');
      if(!c.other && c.date.toDateString()===today.toDateString()) div.classList.add('today');
      if(c.date.toDateString()===selectedDate.toDateString()) div.classList.add('selected');
      div.textContent = c.day;
      if(!c.other){
        const statuses = dayStatusMap[dateKey(c.date)];
        if(statuses && statuses.length){
          const unique = Array.from(new Set(statuses)).slice(0,3);
          const dots = document.createElement('div');
          dots.className = 'cal-dots';
          dots.innerHTML = unique.map(s=>`<i style="background:${statusColor[s]||'var(--gold)'}"></i>`).join('');
          div.appendChild(dots);
          if(statuses.length>1){
            const cnt = document.createElement('div');
            cnt.className = 'cal-count'; cnt.textContent = statuses.length;
            div.appendChild(cnt);
          }
        }
        div.addEventListener('click', ()=> selectDate(c.date));
      }
      grid.appendChild(div);
    });
  }

  async function selectDate(d){
    selectedDate = d;
    activeSessionIndex = null;
    renderCalendar();
    const opts = {weekday:'long', day:'numeric', month:'long', year:'numeric'};
    document.getElementById('plan-date').textContent = d.toLocaleDateString('ru-RU', opts);
    await loadSessionsForDate(d);
  }

  async function loadSessionsForDate(d){
    const key = dateKey(d);
    let sessions = [];
    try{ const r = await S.get(key); if(r) sessions = JSON.parse(r.value) || []; }catch(e){}
    currentSessions = sessions;
    renderSessions();
  }

  async function getRoster(){
    try{ const res = await S.get('roster'); return res ? JSON.parse(res.value) : []; }catch(e){ return []; }
  }

  function sessionAttendanceChipsHtml(session, roster){
    if(roster.length===0) return '<div class="empty-hint">Добавьте учеников на вкладке «Ученики»</div>';
    // Если у тренировки выбрана группа — показываем только учеников этой
    // группы (по полю trainingGroup), чтобы не искать нужных детей среди
    // всего списка. Без выбранной группы показываются все, как раньше.
    const groupFilter = String(session.group||'').trim();
    const filtered = groupFilter
      ? roster.filter(r => String(r.trainingGroup||'').trim() === groupFilter)
      : roster;
    if(groupFilter && filtered.length===0){
      return `<div class="empty-hint">В группе «${groupFilter}» пока нет учеников. Укажите эту группу у нужных учеников на вкладке «Ученики», или выберите другую группу.</div>`;
    }
    const status = session.attendanceStatus || {};
    const legacySet = new Set(session.attendance||[]);
    return `<div class="attendance-list">` + filtered.map(r=>{
      let st = status[r.name];
      if(!st && legacySet.has(r.name)) st = 'present'; // обратная совместимость со старыми данными
      const cls = st==='present' ? 'on att-present' : st==='excused' ? 'on att-excused' : st==='absent' ? 'on att-absent' : '';
      const icon = st==='present' ? '✓ ' : st==='excused' ? '△ ' : st==='absent' ? '✕ ' : '';
      return `<div class="chip ${cls}" data-name="${r.name.replace(/"/g,'&quot;')}" data-status="${st||''}">${icon}${r.name}</div>`;
    }).join('') + `</div>
    <div style="font-size:11px;color:var(--dim);margin-top:4px;">Тап по ученику переключает: не отмечен → был → по уваж. причине → отсутствовал</div>`;
  }

  // ---- единое текстовое окно тренировки (разминка/основная/заминка/заметки) ----
  const COMBINED_HEADERS = [
    {key:'warmup',   re:/^РАЗМИНКА:?\s*$/i,        label:'РАЗМИНКА:'},
    {key:'main',     re:/^ОСНОВНАЯ ЧАСТЬ:?\s*$/i,  label:'ОСНОВНАЯ ЧАСТЬ:'},
    {key:'cooldown', re:/^ЗАМИНКА:?\s*$/i,         label:'ЗАМИНКА:'},
    {key:'notes',    re:/^ЗАМЕТКИ:?\s*$/i,         label:'ЗАМЕТКИ:'}
  ];
  function combineSession(s){
    return COMBINED_HEADERS.map(h => `${h.label}\n${(s[h.key]||'').trim()}`).join('\n\n');
  }
  function parseCombined(text){
    const lines = String(text||'').split('\n');
    const result = {warmup:'', main:'', cooldown:'', notes:''};
    let current = null;
    for(const line of lines){
      const trimmed = line.trim();
      const hit = COMBINED_HEADERS.find(h => h.re.test(trimmed));
      if(hit){ current = hit.key; continue; }
      if(current) result[current] += (result[current] ? '\n' : '') + line;
    }
    for(const k in result) result[k] = result[k].replace(/^\n+|\n+$/g,'');
    return result;
  }

  async function renderSessions(){
    const wrap = document.getElementById('sessions-container');
    const roster = await getRoster();
    const groupsList = await getGroups();
    if(currentSessions.length===0){
      wrap.innerHTML = '<div class="empty-hint">На этот день пока нет тренировок. Нажми «Добавить тренировку».</div>';
      return;
    }
    wrap.innerHTML = currentSessions.map((s,i)=>`
      <div class="session" data-i="${i}">
        <div class="session-head" data-open="${i}">
          <input type="time" class="time" value="${s.time||'09:00'}" data-f="time" data-i="${i}" onclick="event.stopPropagation()">
          <div class="session-dot" style="background:${statusColor[s.status||'planned']}"></div>
          <div class="group-name">${s.group ? s.group : 'Без названия группы'}</div>
          <button class="btn gold small session-timer-btn" data-timer-i="${i}" type="button" onclick="event.stopPropagation()">⏱</button>
          <span class="chev">${s.open ? '▲' : '▼'}</span>
          <button class="session-del" data-del="${i}">✕</button>
        </div>
        <div class="session-body ${s.open?'open':''}">
          <div class="row2">
            <div><label>Группа</label>
              <select data-f="group" data-i="${i}">${groupOptionsHtmlSync(groupsList, s.group)}</select>
            </div>
            <div><label>Длительность, мин</label><input type="number" data-f="duration" data-i="${i}" value="${s.duration||60}"></div>
          </div>
          <label>Статус</label>
          <select data-f="status" data-i="${i}">
            <option value="planned" ${(!s.status||s.status==='planned')?'selected':''}>Запланирована</option>
            <option value="done" ${s.status==='done'?'selected':''}>Проведена</option>
            <option value="cancelled" ${s.status==='cancelled'?'selected':''}>Отменена</option>
          </select>
          <label>Тренировка целиком (разминка / основная часть / заминка / заметки — всё в одном окне)
            <button class="btn gold small voice-btn" data-i="${i}" type="button" style="margin-left:8px;">🎤 Голосом (в заметки)</button>
          </label>
          <textarea data-f="combined" data-i="${i}" style="min-height:320px;">${combineSession(s)}</textarea>
          <label>Присутствовали</label>
          ${sessionAttendanceChipsHtml(s, roster)}
        </div>
      </div>
    `).join('');

    wrap.querySelectorAll('[data-open]').forEach(h=>{
      h.addEventListener('click', ()=>{
        const i = Number(h.dataset.open);
        currentSessions[i].open = !currentSessions[i].open;
        activeSessionIndex = i;
        renderSessions();
      });
    });
    wrap.querySelectorAll('[data-timer-i]').forEach(b=>{
      b.addEventListener('click', ()=>{
        activeSessionIndex = Number(b.dataset.timerI);
        document.querySelector('.tab[data-tab="timers"]').click();
      });
    });
    wrap.querySelectorAll('[data-del]').forEach(b=>{
      b.addEventListener('click', (ev)=>{
        ev.stopPropagation();
        currentSessions.splice(Number(b.dataset.del),1);
        renderSessions();
      });
    });
    wrap.querySelectorAll('[data-f]').forEach(inp=>{
      inp.addEventListener('input', ()=>{
        const i = Number(inp.dataset.i);
        const f = inp.dataset.f;
        if(f === 'combined'){
          const parsed = parseCombined(inp.value);
          Object.assign(currentSessions[i], parsed);
        } else {
          currentSessions[i][f] = inp.value;
        }
      });
      inp.addEventListener('change', ()=>{
        const i = Number(inp.dataset.i);
        activeSessionIndex = i;
        // Смена группы тренировки — сразу перерисовываем, чтобы список
        // "Присутствовали" подтянул состав именно этой группы.
        if(inp.dataset.f === 'group'){
          currentSessions[i].open = true;
          renderSessions();
        }
      });
    });
    wrap.querySelectorAll('.chip').forEach(ch=>{
      ch.addEventListener('click', ()=>{
        const sessionEl = ch.closest('.session');
        const i = Number(sessionEl.dataset.i);
        const name = ch.dataset.name;
        const cur = ch.dataset.status || '';
        const cycle = {'': 'present', 'present':'excused', 'excused':'absent', 'absent':''};
        const next = cycle[cur];
        currentSessions[i].attendanceStatus = currentSessions[i].attendanceStatus || {};
        if(next===''){ delete currentSessions[i].attendanceStatus[name]; }
        else { currentSessions[i].attendanceStatus[name] = next; }
        // держим старое поле attendance в синхроне для обратной совместимости со статистикой
        const presentNames = Object.keys(currentSessions[i].attendanceStatus).filter(n=>currentSessions[i].attendanceStatus[n]==='present');
        currentSessions[i].attendance = presentNames;
        _attStatsCache = null;
        activeSessionIndex = i;
        renderSessions();
      });
    });
    setupVoiceButtons();
  }

  document.getElementById('add-session').addEventListener('click', ()=>{
    // FREE: не более одной тренировки на календарный день.
    if(window.ProFeatures && !window.ProFeatures.isPro && currentSessions.length >= 1){
      window.ProFeatures.requirePro('Вторая тренировка в этот день');
      return;
    }
    currentSessions.push({id:uid(), time:'09:00', group:'', duration:60, status:'planned', warmup:'', main:'', cooldown:'', notes:'', attendance:[], open:true});
    activeSessionIndex = currentSessions.length-1;
    renderSessions();
  });

  document.getElementById('save-day').addEventListener('click', async ()=>{
    if(window.ProFeatures && !window.ProFeatures.isPro && currentSessions.length > 1){
      window.ProFeatures.requirePro('Более одной тренировки в день');
      return;
    }
    const key = dateKey(selectedDate);
    if(currentSessions.length===0){
      try{ await S.delete(key); }catch(e){}
    } else {
      await S.set(key, JSON.stringify(currentSessions));
    }
    renderCalendar();
    try{ await exportAllData(true); }catch(e){}
  });

  document.getElementById('clear-day').addEventListener('click', async ()=>{
    if(currentSessions.length===0){ return; }
    const dateLabel = selectedDate.toLocaleDateString('ru-RU');
    if(!confirm(`Удалить ВСЕ тренировки на ${dateLabel}? Это действие нельзя отменить.`)) return;
    currentSessions = [];
    const key = dateKey(selectedDate);
    try{ await S.delete(key); }catch(e){}
    activeSessionIndex = null;
    renderSessions();
    renderCalendar();
    try{ await exportAllData(true); }catch(e){}
  });

  document.getElementById('prev-month').addEventListener('click', ()=>{ viewDate.setMonth(viewDate.getMonth()-1); renderCalendar(); });
  document.getElementById('next-month').addEventListener('click', ()=>{ viewDate.setMonth(viewDate.getMonth()+1); renderCalendar(); });
  document.getElementById('today-btn').addEventListener('click', ()=>{ viewDate = new Date(); renderCalendar(); selectDate(new Date()); });

  // ---- печать / PDF плана дня ----
  function escapeHtml(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  }
  function buildDayPlanHtml(date, sessions){
    const dateStr = date.toLocaleDateString('ru-RU', {day:'numeric', month:'long', year:'numeric', weekday:'long'});
    let body = `<h1>Тренировки — ${escapeHtml(dateStr)}</h1>`;
    if(!sessions || sessions.length===0){
      body += '<p>На этот день тренировок пока нет.</p>';
    } else {
      sessions.forEach((s,i)=>{
        body += `<h2>${i+1}. ${escapeHtml(s.time||'')} — ${escapeHtml(s.group||'Группа не указана')} (${escapeHtml(s.duration||'')} мин)</h2>`;
        COMBINED_HEADERS.forEach(h=>{
          const val = (s[h.key]||'').trim();
          if(val) body += `<p><b>${escapeHtml(h.label)}</b><br>${escapeHtml(val)}</p>`;
        });
      });
    }
    return `<html><body>${body}</body></html>`;
  }
  // ---- voice notes (per session) ----
  function setupVoiceButtons(){
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    document.querySelectorAll('.voice-btn').forEach(btn=>{
      if(!Rec){ btn.addEventListener('click', ()=> alert('Голосовой ввод не поддерживается в этом браузере.')); return; }
      let listening = false;
      const rec = new Rec();
      rec.lang = 'ru-RU'; rec.continuous = true; rec.interimResults = false;
      const i = Number(btn.dataset.i);
      rec.onresult = (e)=>{
        let text='';
        for(let k=e.resultIndex;k<e.results.length;k++){ if(e.results[k].isFinal) text += e.results[k][0].transcript+' '; }
        if(text.trim()){
          currentSessions[i].notes = (currentSessions[i].notes ? currentSessions[i].notes.trim()+'\n' : '') + text.trim();
          const ta = document.querySelector(`textarea[data-f="combined"][data-i="${i}"]`);
          if(ta) ta.value = combineSession(currentSessions[i]);
        }
      };
      rec.onend = ()=>{ if(listening){ try{ rec.start(); }catch(e){} } };
      btn.addEventListener('click', ()=>{
        listening = !listening;
        if(listening){ btn.textContent='⏺ Идёт запись...'; try{ rec.start(); }catch(e){} }
        else { btn.textContent='🎤 Голосом'; try{ rec.stop(); }catch(e){} }
      });
    });
  }

