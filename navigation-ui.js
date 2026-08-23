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
      holder.innerHTML = '<div class="empty-hint">Не удалось открыть файл правил. Откройте PDF отдельной кнопкой — просмотрщик PDF зависит от устройства.</div>';
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
      if(t.dataset.tab==='exams'){ renderExams(); }
      if(t.dataset.tab==='ofp'){ renderOfp(); }
      if(t.dataset.tab==='competitions'){ renderCompetitions(); renderCompReports(); }
      if(t.dataset.tab==='constructor'){ renderConstructor(); }
      if(t.dataset.tab==='rules-pdf'){ loadRulesPdf(); }
      if(t.dataset.tab==='today'){ renderToday(); }
      if(t.dataset.tab==='training'){ renderTraining(); }
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
    const focus = document.getElementById('today-focus-summary');
    if(sessions.length){
      const current = sessions.slice().sort((a,b)=>String(a.time||'').localeCompare(String(b.time||'')))[0];
      const group = current.group || 'Тренировка';
      const duration = current.duration ? `${current.duration} мин` : '';
      if(focus) focus.innerHTML = `<strong>${escapeHtml(current.time||'Сегодня')}</strong><span>${escapeHtml(group)}</span><span>${duration || 'План занятия готов'}</span>`;
      card.innerHTML = sessions.map((item,idx)=>`
        <div class="jc-session-row ${idx===0?'is-primary':''}">
          <div class="jc-session-time">${escapeHtml(item.time||'—')}</div>
          <div class="jc-session-main">
            <div class="jc-session-title">${escapeHtml(item.group||'Тренировка')}</div>
            <div class="jc-session-meta">${item.duration?escapeHtml(String(item.duration))+' мин · ':''}${item.attendance && item.attendance.length ? escapeHtml(String(item.attendance.length))+' спортсменов' : 'спортсмены не отмечены'}</div>
          </div>
          ${idx===0?'<span class="jc-session-arrow">›</span>':''}
        </div>`).join('');
    } else {
      if(focus) focus.innerHTML = `<strong>Сегодня</strong><span>Тренировок пока нет</span><span>Добавьте занятие в расписание</span>`;
      card.innerHTML = `<div class="jc-empty-session"><div class="jc-empty-icon">🥋</div><div><b>На сегодня ничего не запланировано</b><span>Добавьте тренировку — она появится здесь.</span></div><button class="btn small" id="today-add-session-link" type="button">Добавить</button></div>`;
      const link = document.getElementById('today-add-session-link');
      if(link) link.addEventListener('click', scrollToCalendarSection);
    }
    window.__judoTodaySessions = sessions;
    renderTraining();

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

  // Фокусный экран тренировки: здесь тренер работает во время занятия, не возвращаясь к общей навигации.
  function renderTraining(){
    const list = Array.isArray(window.__judoTodaySessions) ? window.__judoTodaySessions : [];
    const title = document.getElementById('training-panel-title');
    const plan = document.getElementById('training-plan-content');
    const next = document.getElementById('training-next-exercise');
    const dose = document.getElementById('training-next-dose');
    if(!title || !plan) return;
    if(!list.length){
      title.textContent = 'Сегодня';
      plan.innerHTML = `<div class="jc-empty-plan"><b>Тренировка не выбрана</b><span>Откройте «Сегодня → Расписание» и добавьте занятие.</span><button class="btn small" type="button" id="training-add-plan">Открыть расписание</button></div>`;
      if(next) next.textContent='Uchikomi';
      if(dose) dose.textContent='3 × 30 сек';
      document.getElementById('training-add-plan')?.addEventListener('click', ()=>{
        document.querySelector('.tab[data-tab="today"]')?.click();
        setTimeout(scrollToCalendarSection,120);
      });
      return;
    }
    const s=list.slice().sort((a,b)=>String(a.time||'').localeCompare(String(b.time||'')))[0];
    title.textContent = s.group || 'Тренировка';
    const sections=[
      s.warmup ? `<div><b>Разминка</b><span>${escapeHtml(s.warmup)}</span></div>` : '',
      s.main ? `<div><b>Основная часть</b><span>${escapeHtml(s.main)}</span></div>` : '',
      s.cooldown ? `<div><b>Заминка</b><span>${escapeHtml(s.cooldown)}</span></div>` : '',
      s.notes ? `<div><b>Заметки</b><span>${escapeHtml(s.notes)}</span></div>` : ''
    ].filter(Boolean);
    plan.innerHTML = sections.length ? sections.join('') : `<div class="jc-empty-plan"><b>${escapeHtml(s.time||'Сегодня')} · ${escapeHtml(s.group||'Тренировка')}</b><span>План пока пустой. Его можно заполнить в расписании.</span></div>`;
    if(next) next.textContent = s.main ? 'Следующий блок' : 'Uchikomi';
    if(dose) dose.textContent = s.duration ? `${s.duration} мин занятие` : '3 × 30 сек';
  }

  // Плавно открывает расписание на главном экране.
  function scrollToCalendarSection(){
    const details = document.getElementById('today-schedule-details');
    if(details) details.open = true;
    const el = document.getElementById('cal-month');
    if(el) setTimeout(()=>el.scrollIntoView({behavior:'smooth', block:'start'}),80);
  }

  function openPanel(name){
    const tab=document.querySelector('.tab[data-tab="'+name+'"]');
    if(tab) tab.click();
  }

  document.getElementById('today-open-schedule')?.addEventListener('click', scrollToCalendarSection);
  document.getElementById('today-open-roster')?.addEventListener('click', ()=>openPanel('roster'));
  document.getElementById('today-open-timer')?.addEventListener('click', ()=>openPanel('timers'));
  document.getElementById('today-open-note')?.addEventListener('click', ()=>{
    const note=document.getElementById('today-note-card');
    if(note) note.scrollIntoView({behavior:'smooth',block:'center'});
    document.getElementById('today-quick-note')?.focus();
  });
  document.getElementById('today-start-training')?.addEventListener('click', ()=>openPanel('training'));
  document.getElementById('training-back-today')?.addEventListener('click', ()=>openPanel('today'));
  document.getElementById('training-finish')?.addEventListener('click', ()=>openPanel('today'));
  document.getElementById('training-open-roster')?.addEventListener('click', ()=>openPanel('roster'));
  document.getElementById('training-open-timer')?.addEventListener('click', ()=>openPanel('timers'));
  document.getElementById('training-open-video')?.addEventListener('click', ()=>openPanel('library'));
  document.getElementById('training-open-note')?.addEventListener('click', ()=>{
    openPanel('today');
    setTimeout(()=>{ const note=document.getElementById('today-note-card'); note?.scrollIntoView({behavior:'smooth',block:'center'}); document.getElementById('today-quick-note')?.focus(); },120);
  });

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

