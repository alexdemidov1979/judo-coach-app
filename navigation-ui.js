  // ================= ПЕРЕКЛЮЧЕНИЕ ГЛАВНЫХ ВКЛАДОК =================
  // Полный PDF судейских правил грузится только при открытии вкладки — не при старте приложения.
  // ВАЖНО: <iframe src="....pdf"> НЕ работает внутри Android-приложения (Capacitor WebView),
  // потому что у системного WebView, в отличие от настольного браузера, нет встроенного
  // просмотрщика PDF. Поэтому рендерим страницы через PDF.js прямо в canvas — это работает
  // одинаково и в браузере, и в приложении на телефоне.
  let rulesPdfLoaded = false;
  let rulesPdfDoc = null;
  let rulesPdfPage = 1;
  let rulesPdfRendering = false;

  async function renderRulesPdfPage(num){
    if(!rulesPdfDoc || rulesPdfRendering) return;
    rulesPdfRendering = true;
    const holder = document.getElementById('rules-pdf-holder');
    try{
      const page = await rulesPdfDoc.getPage(num);
      const containerWidth = holder.clientWidth || 360;
      const baseViewport = page.getViewport({scale:1});
      const scale = containerWidth / baseViewport.width;
      const viewport = page.getViewport({scale});
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = '100%';
      canvas.style.display = 'block';
      canvas.style.background = '#fff';
      const ctx = canvas.getContext('2d');
      await page.render({canvasContext: ctx, viewport}).promise;
      holder.innerHTML = '';
      holder.appendChild(canvas);
      const label = document.getElementById('rules-pdf-page-label');
      if(label) label.textContent = `Страница ${num} из ${rulesPdfDoc.numPages}`;
      rulesPdfPage = num;
    }catch(e){
      console.error('Не удалось отрисовать страницу PDF:', e);
      holder.innerHTML = '<div class="empty-hint">Не удалось показать страницу правил. Попробуйте открыть файл отдельно.</div>';
    }finally{
      rulesPdfRendering = false;
    }
  }

  // Модуль PDF.js грузим только при открытии вкладки (как и Excel-модуль в roster.js) —
  // чтобы не тратить трафик и время запуска, если правила никто не открывает.
  function loadPdfJsLib(){
    return new Promise((resolve, reject)=>{
      if(window.pdfjsLib) return resolve(window.pdfjsLib);
      const existing = document.getElementById('pdfjs-lib-script');
      if(existing){
        existing.addEventListener('load', ()=>resolve(window.pdfjsLib), {once:true});
        existing.addEventListener('error', ()=>reject(new Error('Не удалось загрузить модуль PDF.')), {once:true});
        return;
      }
      const sc = document.createElement('script');
      sc.id = 'pdfjs-lib-script';
      sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      sc.onload = ()=> window.pdfjsLib ? resolve(window.pdfjsLib) : reject(new Error('Модуль PDF загрузился без pdfjsLib.'));
      sc.onerror = ()=> reject(new Error('Не удалось загрузить модуль PDF.'));
      document.head.appendChild(sc);
    });
  }

  async function loadRulesPdf(){
    if(rulesPdfLoaded) return;
    rulesPdfLoaded = true;
    const holder = document.getElementById('rules-pdf-holder');
    holder.innerHTML = '<div class="empty-hint">Загружаю документ…</div>';
    try{
      const pdfjsLib = await loadPdfJsLib();
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      rulesPdfDoc = await pdfjsLib.getDocument('pravila-mfd.pdf').promise;
      await renderRulesPdfPage(1);
    }catch(e){
      console.error('Не удалось открыть PDF правил:', e);
      rulesPdfLoaded = false;
      holder.innerHTML = '<div class="empty-hint">Не удалось открыть файл правил. Проверьте интернет-соединение или откройте файл отдельно кнопкой выше.</div>';
    }
  }

  document.getElementById('rules-pdf-prev')?.addEventListener('click', ()=>{
    if(rulesPdfDoc && rulesPdfPage > 1) renderRulesPdfPage(rulesPdfPage - 1);
  });
  document.getElementById('rules-pdf-next')?.addEventListener('click', ()=>{
    if(rulesPdfDoc && rulesPdfPage < rulesPdfDoc.numPages) renderRulesPdfPage(rulesPdfPage + 1);
  });

  document.querySelectorAll('.tab').forEach(t=>{
    t.addEventListener('click', ()=>{
      document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById('panel-'+t.dataset.tab).classList.add('active');
      document.querySelectorAll('.bn-item').forEach(b=>b.classList.toggle('active', b.dataset.nav===t.dataset.tab));
      if(t.dataset.tab==='roster'){ renderRoster(); try{ renderGroupsManager(); }catch(e){} }
      if(t.dataset.tab==='library'){ renderLibCats(); renderLibrary(); renderTerms(); renderKyu(); renderKodokan(); renderRules(); }
      if(t.dataset.tab==='stats'){
        if(!window.ProFeatures || window.ProFeatures.guardPanel('panel-stats','Статистика тренировок')) renderStats();
      }
      if(t.dataset.tab==='ai-coach'){
        window.ProFeatures?.guardPanel('panel-ai-coach','ИИ-тренер');
      }
      if(t.dataset.tab==='exams'){ renderExams(); }
      if(t.dataset.tab==='ofp'){ renderOfp(); }
      if(t.dataset.tab==='competitions'){ renderCompetitions(); renderCompReports(); }
      if(t.dataset.tab==='constructor'){ renderConstructor(); }
      if(t.dataset.tab==='rules-pdf'){ loadRulesPdf(); }
      if(t.dataset.tab==='today'){ renderToday(); }
      window.scrollTo(0,0);
    });
  });

  window.addEventListener('judo:pro-status', ()=>{
    if(document.getElementById('panel-stats')?.classList.contains('active')) renderStats();
    if(document.getElementById('panel-constructor')?.classList.contains('active')) renderConstructor();
  });

  // ================= НИЖНЯЯ НАВИГАЦИЯ (Сегодня/Техника/Спортсмены/План/Ещё) =================
  document.querySelectorAll('.bn-item').forEach(b=>{
    b.addEventListener('click', ()=>{
      const tab = document.querySelector('.tab[data-tab="'+b.dataset.nav+'"]');
      if(tab) tab.click();
    });
  });

  // Переносим старый блок (облако/экспорт-импорт/телеграм) внутрь панели "Ещё"
  (function moveLegacyIntoMore(){
    const legacy = document.getElementById('legacy-more-content');
    const slot = document.getElementById('more-legacy-slot');
    if(legacy && slot){ legacy.style.display='block'; slot.appendChild(legacy); }
  })();

  // Подменю внутри "Ещё": Таймеры / Терминология / Статистика
  document.querySelectorAll('.more-subnav .chip').forEach(c=>{
    c.addEventListener('click', ()=>{
      const tab = document.querySelector('.tab[data-tab="'+c.dataset.subtab+'"]');
      if(tab) tab.click();
    });
  });

  // Плавающая кнопка "ИИ-тренер" — видна на любом экране приложения.
  document.getElementById('ai-coach-fab')?.addEventListener('click', ()=>{
    const tab = document.querySelector('.tab[data-tab="ai-coach"]');
    if(tab) tab.click();
  });

  // ================= ГЛАВНЫЙ ЭКРАН "СЕГОДНЯ" =================
  async function renderToday(){
    const now = new Date();
    const dStr = now.toLocaleDateString('ru-RU', {weekday:'long', day:'numeric', month:'long'});
    document.getElementById('today-date-str').textContent = dStr.charAt(0).toUpperCase()+dStr.slice(1);

    const hour = now.getHours();
    const greet = hour<6?'Доброй ночи':hour<12?'Доброе утро':hour<18?'Добрый день':'Добрый вечер';
    document.getElementById('today-title-str').textContent = greet + ', тренер!';

    // сегодняшняя тренировка (из календаря)
    const key = dateKey(now);
    let sessions = [];
    try{ const r = await S.get(key); if(r) sessions = JSON.parse(r.value) || []; }catch(e){}
    const card = document.getElementById('today-session-card');
    if(sessions.length){
      card.innerHTML = sessions.map(s=>`
        <div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--line);">
          <div style="font-weight:600;font-size:14.5px;">${escapeHtml(s.group||'Тренировка')} ${s.time?('· '+escapeHtml(s.time)):''}</div>
          <div style="font-size:13px;color:var(--dim);">${escapeHtml((s.main||s.warmup||'').slice(0,90))}${(s.main||'').length>90?'…':''}</div>
        </div>`).join('');
    } else {
      card.innerHTML = `<div style="color:var(--dim);font-size:13.5px;">На сегодня тренировок не запланировано. <span style="color:var(--navy);cursor:pointer;font-weight:600;" id="today-add-session-link">Добавить тренировку →</span></div>`;
      const link = document.getElementById('today-add-session-link');
      if(link) link.addEventListener('click', scrollToCalendarSection);
    }

    const roster = await getRoster();

    // последние видео
    const videosWrap = document.getElementById('today-recent-videos');
    try{
      const histR = await S.get('video_history');
      const hist = histR ? JSON.parse(histR.value) : {};
      const urls = Object.keys(hist).sort((a,b)=> (hist[b].ts||0)-(hist[a].ts||0)).slice(0,8);
      const items = urls.map(u => TERMINOLOGY_DATA.techniques.find(t=>t.video===u)).filter(Boolean);
      videosWrap.innerHTML = items.length ? items.map(t=>`
        <div class="mini-card video-link" data-video="${t.video}"><div class="m-t">${escapeHtml(t.romaji)}</div><div class="m-s">${escapeHtml(t.ru_term||'')}</div></div>`).join('')
        : `<div class="mini-card"><div class="m-s">Пока нет просмотренных видео</div></div>`;
    }catch(e){ videosWrap.innerHTML = ''; }

    // ближайшее соревнование
    try{
      const comps = await getCompetitions();
      const todayStr = now.toISOString().slice(0,10);
      const upcoming = comps.filter(c=>c.date && c.date>=todayStr).sort((a,b)=>a.date.localeCompare(b.date));
      const wrap = document.getElementById('today-next-comp-wrap');
      if(upcoming.length){
        const c = upcoming[0];
        const days = Math.round((new Date(c.date)-now)/86400000);
        document.getElementById('today-next-comp').innerHTML = `
          <div style="font-weight:600;font-size:15px;">${escapeHtml(c.name)}</div>
          <div style="font-size:13px;color:var(--dim);margin-top:4px;">${new Date(c.date).toLocaleDateString('ru-RU')} · через ${days} дн.${c.place?(' · '+escapeHtml(c.place)):''}</div>
          ${c.participants && c.participants.length ? `<div style="font-size:13px;margin-top:6px;">Участников: ${c.participants.length}</div>` : ''}
        `;
        wrap.style.display = 'block';
      } else {
        wrap.style.display = 'none';
      }
    }catch(e){}

    // быстрая заметка
    const noteEl = document.getElementById('today-quick-note');
    try{ const r = await S.get('today_quicknote'); noteEl.value = r ? r.value : ''; }catch(e){}
    let noteTimer;
    noteEl.oninput = ()=>{ clearTimeout(noteTimer); noteTimer=setTimeout(()=>S.set('today_quicknote', noteEl.value), 400); };
  }

  // Плавно прокручивает к блоку календаря на главном экране (вместо перехода на отдельную вкладку — её больше нет)
  function scrollToCalendarSection(){
    const el = document.getElementById('cal-month');
    if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
  }

  document.getElementById('today-open-timer').addEventListener('click', ()=>document.querySelector('.tab[data-tab="timers"]').click());
  document.getElementById('today-start-training').addEventListener('click', scrollToCalendarSection);

  // ---------- Голосовая заметка (Web Speech API) ----------
  (function initVoiceNote(){
    const btn = document.getElementById('voice-note-btn');
    const statusEl = document.getElementById('voice-note-status');
    const noteEl = document.getElementById('today-quick-note');
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!Recognition){
      statusEl.textContent = 'Голосовой ввод не поддерживается этим браузером — печатайте текстом.';
      btn.style.opacity = '.4';
      btn.disabled = true;
      return;
    }
    const rec = new Recognition();
    rec.lang = 'ru-RU';
    rec.interimResults = false;
    rec.continuous = false;
    let listening = false;
    rec.onresult = (e)=>{
      const text = Array.from(e.results).map(r=>r[0].transcript).join(' ');
      noteEl.value = (noteEl.value ? noteEl.value.trim()+' ' : '') + text;
      noteEl.dispatchEvent(new Event('input'));
    };
    rec.onerror = ()=>{ statusEl.textContent = 'Не удалось распознать речь, попробуйте снова.'; };
    rec.onend = ()=>{ listening = false; btn.style.background = 'var(--navy,var(--belt-red))'; statusEl.textContent = ''; };
    btn.addEventListener('click', ()=>{
      if(listening){ rec.stop(); return; }
      try{
        rec.start();
        listening = true;
        btn.style.background = 'var(--belt-red)';
        statusEl.textContent = 'Слушаю… говорите';
      }catch(e){}
    });
  })();

  // ================= ТЕМА (тёмная/светлая) =================
  (function initTheme(){
    function syncThemeColorMeta(){
      const meta = document.querySelector('meta[name="theme-color"]');
      if(!meta) return;
      meta.setAttribute('content', document.documentElement.dataset.theme === 'light' ? '#f3f5f9' : '#17211a');
    }
    function applyAutoTheme(){
      const hour = new Date().getHours();
      const light = hour >= 7 && hour < 20; // светлая тема днём 07:00–20:00, тёмная вечером/ночью
      if(light) document.documentElement.dataset.theme = 'light';
      else delete document.documentElement.dataset.theme;
      syncThemeColorMeta();
    }
    const saved = localStorage.getItem('app_theme') || 'light';
    if(saved === 'auto') applyAutoTheme();
    else if(saved === 'light') document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
    syncThemeColorMeta();
    if(saved === 'auto') setInterval(applyAutoTheme, 15*60*1000);
    document.getElementById('theme-toggle').addEventListener('click', ()=>{
      // Клики циклически переключают: авто (по времени суток) → светлая → тёмная → авто...
      const cur = localStorage.getItem('app_theme') || 'auto';
      const order = ['auto','light','dark'];
      const next = order[(order.indexOf(cur)+1) % order.length];
      if(next === 'auto') applyAutoTheme();
      else if(next === 'light') document.documentElement.dataset.theme = 'light';
      else delete document.documentElement.dataset.theme;
      localStorage.setItem('app_theme', next);
      syncThemeColorMeta();
      const label = next==='auto' ? 'авто (по времени)' : next==='light' ? 'светлая' : 'тёмная';
      const btn = document.getElementById('theme-toggle');
      btn.textContent = '🌓 Тема: ' + label;
      setTimeout(()=> btn.textContent = '🌓 Тема', 1500);
    });
  })();

  // ================= ИНДИКАТОР ОНЛАЙН/ОФЛАЙН =================
  (function initNetStatus(){
    const badge = document.getElementById('net-status-badge');
    function update(){
      if(navigator.onLine){
        badge.textContent = '🟢 Онлайн';
        badge.style.background = 'var(--ok)';
      } else {
        badge.textContent = '⚪ Офлайн';
        badge.title = 'Нет интернета: видео из библиотеки не откроется, но данные учеников и расписание работают как обычно.';
        badge.style.background = 'var(--dim,#888)';
      }
    }
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  })();

  // ================= SOS: ЭКСТРЕННЫЕ КОНТАКТЫ РОДИТЕЛЕЙ =================
  document.getElementById('sos-btn').addEventListener('click', async ()=>{
    const roster = await getRoster();
    const withPhone = roster.filter(r=>r.parentPhone);
    const w = document.createElement('div');
    w.style.cssText = 'position:fixed;inset:0;z-index:500;background:rgba(10,14,24,.94);display:flex;flex-direction:column;padding:16px;overflow:auto;';
    w.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div style="color:#fff;font-size:19px;font-weight:700;">🚨 SOS — связь с родителями</div>
        <button id="sos-close" style="background:none;border:none;color:#fff;font-size:26px;cursor:pointer;">✕</button>
      </div>
      ${withPhone.length===0 ? '<div style="color:#ccc;">У учеников пока не указаны телефоны родителей. Добавьте их в карточке ученика.</div>' : withPhone.map(r=>`
        <a href="tel:${(r.parentPhone||'').replace(/[^+\\d]/g,'')}" style="display:flex;justify-content:space-between;align-items:center;background:#fff;border-radius:12px;padding:14px 16px;margin-bottom:10px;text-decoration:none;color:#111;">
          <div>
            <div style="font-weight:600;font-size:15.5px;">${escapeHtml(r.name)}</div>
            <div style="font-size:12.5px;color:#666;">${escapeHtml(r.responsiblePerson||'Родитель')} · ${escapeHtml(r.parentPhone||'')}</div>
          </div>
          <div style="font-size:24px;">📞</div>
        </a>
      `).join('')}
    `;
    document.body.appendChild(w);
    w.querySelector('#sos-close').addEventListener('click', ()=> w.remove());
  });

