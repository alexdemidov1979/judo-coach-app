  // ================= КОНСТРУКТОР ТРЕНИРОВОК =================
  const BLOCK_TYPES = [
    {key:'warmup',   label:'Разминка',    icon:'🔥'},
    {key:'acro',     label:'Акробатика',  icon:'🤸'},
    {key:'ofp',      label:'ОФП',         icon:'💪'},
    {key:'sfp',      label:'СФП',         icon:'🏋'},
    {key:'technique',label:'Техника',     icon:'🥋'},
    {key:'newaza',   label:'Партер',      icon:'🤼'},
    {key:'randori',  label:'Рандори',     icon:'⚔️'},
    {key:'games',    label:'Игры',        icon:'🎲'},
    {key:'cooldown', label:'Заминка',     icon:'🧘'}
  ];
  let constructorBlocks = [];
  let constructorDragIndex = null;

  function renderConstructorPalette(){
    const el = document.getElementById('constructor-palette');
    el.innerHTML = BLOCK_TYPES.map(t=>`<div class="palette-btn" data-add="${t.key}">${t.icon} ${t.label}</div>`).join('');
    el.querySelectorAll('[data-add]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const type = BLOCK_TYPES.find(t=>t.key===b.dataset.add);
        constructorBlocks.push({type:type.key, title:type.label, duration:10, desc:''});
        renderConstructorBlocks();
      });
    });
  }

  function renderConstructorBlocks(){
    const el = document.getElementById('constructor-blocks');
    document.getElementById('constructor-empty').style.display = constructorBlocks.length ? 'none' : 'block';
    el.innerHTML = constructorBlocks.map((b,i)=>{
      const t = BLOCK_TYPES.find(x=>x.key===b.type) || {icon:'📋'};
      return `
      <div class="constructor-block" draggable="true" data-i="${i}">
        <div class="cb-head">
          <span class="cb-icon">${t.icon}</span>
          <input type="text" class="cb-title" data-i="${i}" value="${(b.title||'').replace(/"/g,'&quot;')}">
          <input type="number" class="cb-duration" data-i="${i}" value="${b.duration||10}" title="минут"> мин
          <button class="cb-del" data-i="${i}">✕</button>
        </div>
        <textarea class="cb-desc" data-i="${i}" placeholder="Что делаем, упражнения, техники...">${b.desc||''}</textarea>
      </div>`;
    }).join('');

    el.querySelectorAll('.constructor-block').forEach(blockEl=>{
      blockEl.addEventListener('dragstart', ()=>{ constructorDragIndex = Number(blockEl.dataset.i); blockEl.classList.add('dragging'); });
      blockEl.addEventListener('dragend', ()=>{ blockEl.classList.remove('dragging'); });
      blockEl.addEventListener('dragover', (e)=>{ e.preventDefault(); });
      blockEl.addEventListener('drop', (e)=>{
        e.preventDefault();
        const targetI = Number(blockEl.dataset.i);
        if(constructorDragIndex===null || constructorDragIndex===targetI) return;
        const [moved] = constructorBlocks.splice(constructorDragIndex,1);
        constructorBlocks.splice(targetI, 0, moved);
        constructorDragIndex = null;
        renderConstructorBlocks();
      });
    });
    el.querySelectorAll('.cb-title').forEach(inp=> inp.addEventListener('input', ()=>{ constructorBlocks[Number(inp.dataset.i)].title = inp.value; }));
    el.querySelectorAll('.cb-duration').forEach(inp=> inp.addEventListener('input', ()=>{ constructorBlocks[Number(inp.dataset.i)].duration = Number(inp.value)||0; }));
    el.querySelectorAll('.cb-desc').forEach(ta=> ta.addEventListener('input', ()=>{ constructorBlocks[Number(ta.dataset.i)].desc = ta.value; }));
    el.querySelectorAll('.cb-del').forEach(b=> b.addEventListener('click', ()=>{ constructorBlocks.splice(Number(b.dataset.i),1); renderConstructorBlocks(); }));
  }

  async function getWorkoutTemplates(){
    try{ const r = await S.get('workout_templates'); return r ? JSON.parse(r.value) : []; }catch(e){ return []; }
  }
  async function setWorkoutTemplates(list){ await S.set('workout_templates', JSON.stringify(list)); }

  const DEFAULT_WORKOUT_TEMPLATES = [
    {
      name: 'Разминка СШ 12-16',
      blocks: [
        { type:'acro', title:'Акробатика', duration:15, desc:
`Кувырок вперёд, кувырок назад
Падение через плечо
Колесо
Хождение на руках
Рандат
Прыжки в длину
Прыжки боком
Прыжки спиной
На коленях
Паучок
Гусиный шаг
По-пластунски
Без ног
Ползём руками, отталкиваясь от мата
Забегания вокруг рук
Забегания вокруг рук спиной вперёд
Прыжки в подхвате боком с наклоном вперёд
Попаход
Подсечка под пятку у стенки` },
        { type:'acro', title:'Упражнения в парах', duration:12, desc:
`Прыжки в зацепе
Один на животе, второй захватом на шее и за пояс протаскивает вперёд
Тащим за пояс: один лежит на спине
Ускорение — второй тормозит за пояс
Спину качаем в паре: один на животе, второй сидит на ногах партнёра, тот, что внизу, приподнимается и тянется вперёд
Eco ukemi через спину партнёра
Тачка во всевозможных вариантах
Подвороты ногами друг к другу, взявшись за руки
Один номер садится на попу, второй обнимает его за корпус — далее «санки» назад
Один номер ложится на спину, второй берёт за рукава и делает тягу на себя с поворотом кисти из положения ладони вверх в положение ладонь вниз` },
        { type:'warmup', title:'Разминка на месте', duration:5, desc:'' },
        { type:'randori', title:'Борьба в партере', duration:8, desc:'2 схватки' }
      ]
    },
    {
      name: 'Разминка 6-7 дошкольники',
      blocks: [
        { type:'acro', title:'Акробатика', duration:10, desc:
`Кувырок вперёд, кувырок назад, колесо, сосиска, без ног, колесо, тачка, лягушка, прыжки боком, забегания вокруг рук` },
        { type:'warmup', title:'Элементы разминки', duration:10, desc:
`Разминка в движении, разминка на месте с растяжкой и ОФП
Упор головой в пол с колен, переход на борцовский мост
Передвижения Шинтай в паре (Аюми-аши, Цуги-аши)
Передний мост и гимнастический мост, переход с переднего моста на борцовский
Разминка на месте — «запрещённое движение»` }
      ]
    },
    {
      name: 'Разминка 7-9 лет МШ',
      blocks: [
        { type:'warmup', title:'Разминка в движении', duration:8, desc:
`По хлопку два раза выпрыгиваем, отброс ног, кувырок вперёд, разворот, кувырок вперёд
Прыжки по кругу через друг друга, чехарда по кругу` },
        { type:'acro', title:'Акробатика', duration:15, desc:
`Кувырок вперёд, кувырок назад
Падение через плечо
Колесо
Хождение на руках
Рандат
Прыжки в длину
Прыжки боком
Прыжки спиной
На коленях
Паучок
Гусиный шаг
По-пластунски
Без ног
Ползём руками, отталкиваясь от мата
Забегания вокруг рук
Забегания вокруг рук спиной вперёд
Прыжки в подхвате боком с наклоном вперёд
Попаход
Подсечка под пятку у стенки` },
        { type:'acro', title:'Упражнения в парах', duration:12, desc:
`Прыжки в зацепе
Один на животе, второй захватом на шее и за пояс протаскивает вперёд
Тащим за пояс: один лежит на спине
Ускорение — второй тормозит за пояс
Носим на спине
Носим на руках с захватом на пояс, второй обхватывает ногами
Спину качаем в паре: один на животе, второй сидит на ногах партнёра, тот, что внизу, приподнимается и тянется вперёд
Тачка
Тачка спиной вперёд
Закатывание — один под другого, второй перепрыгивает
Прыжки в подхвате
Eco ukemi через спину партнёра
Подвороты ногами друг к другу, взявшись за руки
Один номер садится на попу, второй обнимает его за корпус — далее «санки» назад
Один номер ложится на спину, второй берёт за рукава и делает тягу на себя с поворотом кисти из положения ладони вверх в положение ладонь вниз` },
        { type:'warmup', title:'Разминка на месте', duration:5, desc:
`У стенки пробуем встать на гимнастический мостик
У стенки тренируем подхват` }
      ]
    }
  ];

  // Добавляет стандартные шаблоны разминки один раз, если их ещё нет (по названию) — не трогает то, что тренер уже сохранил сам
  async function seedDefaultWorkoutTemplates(){
    const existing = await getWorkoutTemplates();
    const existingNames = new Set(existing.map(t=>t.name));
    let changed = false;
    DEFAULT_WORKOUT_TEMPLATES.forEach(def=>{
      if(!existingNames.has(def.name)){
        existing.push({ id: uid(), name: def.name, blocks: JSON.parse(JSON.stringify(def.blocks)) });
        changed = true;
      }
    });
    if(changed) await setWorkoutTemplates(existing);
  }

  async function renderConstructorTemplates(){
    const el = document.getElementById('constructor-templates');
    if(window.ProFeatures && !window.ProFeatures.guardPanel('constructor-templates','Шаблоны тренировок')){
      el.style.minHeight = '110px';
      return;
    }
    await seedDefaultWorkoutTemplates();
    const templates = await getWorkoutTemplates();
    if(!templates.length){ el.innerHTML = '<div class="empty-hint">Сохранённых шаблонов пока нет.</div>'; return; }
    el.innerHTML = templates.map((t,i)=>`
      <div class="lib-item" style="display:flex;align-items:center;gap:8px;">
        <div style="flex:1;">
          <div class="title" style="display:block;">${escapeHtml(t.name)}</div>
          <div class="desc">${t.blocks.length} блоков · ${t.blocks.reduce((s,b)=>s+(b.duration||0),0)} мин</div>
        </div>
        <button class="btn small ghost" data-load="${i}">Загрузить</button>
        <button class="del" data-deltpl="${i}">✕</button>
      </div>
    `).join('');
    el.querySelectorAll('[data-load]').forEach(b=>{
      b.addEventListener('click', ()=>{
        constructorBlocks = JSON.parse(JSON.stringify(templates[Number(b.dataset.load)].blocks));
        renderConstructorBlocks();
      });
    });
    el.querySelectorAll('[data-deltpl]').forEach(b=>{
      b.addEventListener('click', async ()=>{
        const list = await getWorkoutTemplates();
        list.splice(Number(b.dataset.deltpl),1);
        await setWorkoutTemplates(list);
        renderConstructorTemplates();
      });
    });
  }

  function renderConstructor(){
    renderConstructorPalette();
    renderConstructorBlocks();
    renderConstructorTemplates();
  }

  document.getElementById('constructor-clear').addEventListener('click', ()=>{
    constructorBlocks = [];
    renderConstructorBlocks();
  });
  document.getElementById('constructor-save-template').addEventListener('click', async ()=>{
    if(!constructorBlocks.length) return;
    const name = prompt('Название шаблона:', 'Тренировка ' + new Date().toLocaleDateString('ru-RU'));
    if(!name) return;
    const list = await getWorkoutTemplates();
    list.push({id:uid(), name, blocks: JSON.parse(JSON.stringify(constructorBlocks))});
    await setWorkoutTemplates(list);
    renderConstructorTemplates();
  });
  document.getElementById('constructor-apply-today').addEventListener('click', async ()=>{
    if(!constructorBlocks.length){ alert('Сначала добавьте блоки.'); return; }
    const key = dateKey(new Date());
    let sessions = [];
    try{ const r = await S.get(key); if(r) sessions = JSON.parse(r.value) || []; }catch(e){}
    if(sessions.length===0){
      sessions.push({id:uid(), time:'09:00', group:'', duration:60, status:'planned', warmup:'', main:'', cooldown:'', notes:'', attendance:[], attendanceStatus:{}, open:true});
    }
    const target = sessions[0];
    const warmupBlocks = constructorBlocks.filter(b=>b.type==='warmup');
    const cooldownBlocks = constructorBlocks.filter(b=>b.type==='cooldown');
    const mainBlocks = constructorBlocks.filter(b=>b.type!=='warmup' && b.type!=='cooldown');
    function fmt(blocks){ return blocks.map(b=>{ const t = BLOCK_TYPES.find(x=>x.key===b.type); return `${t?t.icon:''} ${b.title} (${b.duration} мин)${b.desc?'\n'+b.desc:''}`; }).join('\n\n'); }
    target.warmup = fmt(warmupBlocks);
    target.main = fmt(mainBlocks);
    target.cooldown = fmt(cooldownBlocks);
    target.duration = constructorBlocks.reduce((s,b)=>s+(b.duration||0),0) || target.duration;
    await S.set(key, JSON.stringify(sessions));
    alert('Структура тренировки вставлена в план на сегодня. Откройте вкладку «План», чтобы посмотреть.');
  });

  async function renderStats(){
    document.getElementById('stats-month-label').textContent = `Статистика за ${monthNames[viewDate.getMonth()].toLowerCase()} ${viewDate.getFullYear()}`;
    let allSessions = [];
    try{
      const res = await S.list(monthPrefix(viewDate));
      const keys = (res && res.keys) || [];
      for(const k of keys){
        try{ const r = await S.get(k); if(r){ const arr = JSON.parse(r.value); allSessions = allSessions.concat(arr||[]); } }catch(e){}
      }
    }catch(e){}
    const total = allSessions.length;
    const planned = allSessions.filter(p=>!p.status||p.status==='planned').length;
    const done = allSessions.filter(p=>p.status==='done').length;
    const cancelled = allSessions.filter(p=>p.status==='cancelled').length;
    const doneSessions = allSessions.filter(p=>p.status==='done');
    const roster = await getRoster();
    let avgAttendance = 0;
    if(doneSessions.length>0 && roster.length>0){
      let sum = 0, cnt = 0;
      doneSessions.forEach(p=>{
        const st = p.attendanceStatus || {};
        roster.forEach(r=>{
          const s = st[r.name] || (((p.attendance||[]).includes(r.name)) ? 'present' : null);
          if(s==='present'){ sum+=1; cnt+=1; }
          else if(s==='absent'){ cnt+=1; }
          // excused и неотмеченные не участвуют в расчёте процента
        });
      });
      avgAttendance = cnt>0 ? Math.round((sum/cnt)*100) : 0;
    }
    document.getElementById('st-total').textContent = total;
    document.getElementById('st-attendance').textContent = avgAttendance+'%';
    document.getElementById('st-planned').textContent = planned;
    document.getElementById('st-done').textContent = done;
    document.getElementById('st-cancelled').textContent = cancelled;
    document.getElementById('st-roster').textContent = roster.length;

    await renderStatsCharts();
  }

  const CHART_COLORS = {navy:'#1a2f4a', gold:'#c9a227', ok:'#2e8b57', red:'#b3312c', grid:'rgba(128,128,128,.15)'};
  let chartInstances = {};
  function destroyChart(id){ if(chartInstances[id]){ chartInstances[id].destroy(); delete chartInstances[id]; } }

  async function renderStatsCharts(){
    await loadChartJS();
    if(typeof Chart==='undefined') return;
    const textColor = getComputedStyle(document.body).getPropertyValue('--dim') || '#888';
    Chart.defaults.color = textColor.trim() || '#888';
    Chart.defaults.font.family = "'Inter', sans-serif";

    // ---- 1) Тренировки и часы за 6 месяцев ----
    const months = [];
    for(let i=5;i>=0;i--){
      const d = new Date(); d.setMonth(d.getMonth()-i);
      months.push(d);
    }
    const sessionsPerMonth = [], hoursPerMonth = [], attendancePerMonth = [];
    for(const d of months){
      let sess = [];
      try{
        const res = await S.list(monthPrefix(d));
        const keys = (res && res.keys) || [];
        for(const k of keys){ try{ const r = await S.get(k); if(r) sess = sess.concat(JSON.parse(r.value)||[]); }catch(e){} }
      }catch(e){}
      const doneM = sess.filter(p=>p.status==='done');
      sessionsPerMonth.push(doneM.length);
      hoursPerMonth.push(Math.round(doneM.reduce((s,p)=>s+(p.duration||0),0)/60*10)/10);
      let sum=0, cnt=0;
      doneM.forEach(p=>{
        const st = p.attendanceStatus || {};
        roster.forEach(r=>{
          const s = st[r.name] || (((p.attendance||[]).includes(r.name)) ? 'present' : null);
          if(s==='present'){ sum++; cnt++; } else if(s==='absent'){ cnt++; }
        });
      });
      attendancePerMonth.push(cnt>0 ? Math.round((sum/cnt)*100) : null);
    }
    const monthLabels = months.map(d=>monthNames[d.getMonth()].slice(0,3));

    destroyChart('sessions');
    chartInstances['sessions'] = new Chart(document.getElementById('chart-sessions'), {
      type:'bar',
      data:{ labels: monthLabels, datasets:[
        {label:'Тренировок', data: sessionsPerMonth, backgroundColor: CHART_COLORS.navy, yAxisID:'y'},
        {label:'Часов', data: hoursPerMonth, type:'line', borderColor: CHART_COLORS.gold, backgroundColor: CHART_COLORS.gold, yAxisID:'y1', tension:.3}
      ]},
      options:{ responsive:true, scales:{
        y:{ beginAtZero:true, position:'left', grid:{color:CHART_COLORS.grid} },
        y1:{ beginAtZero:true, position:'right', grid:{drawOnChartArea:false} }
      }}
    });

    destroyChart('attendance');
    chartInstances['attendance'] = new Chart(document.getElementById('chart-attendance'), {
      type:'line',
      data:{ labels: monthLabels, datasets:[
        {label:'Посещаемость, %', data: attendancePerMonth, borderColor: CHART_COLORS.ok, backgroundColor: CHART_COLORS.ok+'33', fill:true, tension:.3, spanGaps:true}
      ]},
      options:{ responsive:true, scales:{ y:{ beginAtZero:true, max:100, grid:{color:CHART_COLORS.grid} } } }
    });

    // ---- 3) Прогресс по поясам ----
    const beltCounts = {};
    roster.forEach(r=>{ const k = r.kyu || 'Без пояса'; beltCounts[k] = (beltCounts[k]||0)+1; });
    destroyChart('belts');
    chartInstances['belts'] = new Chart(document.getElementById('chart-belts'), {
      type:'bar',
      data:{ labels: Object.keys(beltCounts), datasets:[{label:'Учеников', data: Object.values(beltCounts), backgroundColor: CHART_COLORS.gold}]},
      options:{ responsive:true, indexAxis:'y', scales:{ x:{ beginAtZero:true, grid:{color:CHART_COLORS.grid} } } }
    });

    // ---- 4) Освоенные техники по категориям ----
    const catLabels = {te:'Te-waza', koshi:'Koshi-waza', ashi:'Ashi-waza', masutemi:'Masutemi', yokosutemi:'Yokosutemi', osaekomi:'Удержания', shime:'Удушения', kansetsu:'Болевые'};
    const catCounts = {};
    roster.forEach(r=>{
      Object.keys(r.techProgress||{}).forEach(romaji=>{
        const t = TERMINOLOGY_DATA.techniques.find(x=>x.romaji===romaji);
        if(t){ catCounts[t.cat] = (catCounts[t.cat]||0)+1; }
      });
    });
    destroyChart('techniques');
    chartInstances['techniques'] = new Chart(document.getElementById('chart-techniques'), {
      type:'bar',
      data:{ labels: Object.keys(catCounts).map(k=>catLabels[k]||k), datasets:[{label:'Отмечено освоенными (по всем ученикам)', data: Object.values(catCounts), backgroundColor: CHART_COLORS.navy}]},
      options:{ responsive:true, scales:{ y:{ beginAtZero:true, grid:{color:CHART_COLORS.grid} } } }
    });

    // ---- 5) Медали на соревнованиях ----
    const comps = await getCompetitions();
    let gold=0, silver=0, bronze=0;
    comps.forEach(c=> (c.participants||[]).forEach(p=>{
      if(p.place==='1') gold++; else if(p.place==='2') silver++; else if(p.place==='3') bronze++;
    }));
    destroyChart('medals');
    chartInstances['medals'] = new Chart(document.getElementById('chart-medals'), {
      type:'doughnut',
      data:{ labels:['Золото','Серебро','Бронза'], datasets:[{data:[gold,silver,bronze], backgroundColor:['#d4af37','#adb5bd','#cd7f32']}]},
      options:{ responsive:true }
    });
  }

  // ================= TIMERS (Табата / Отсчёт / Секундомер / Судейский) =================
  document.querySelectorAll('.timer-tab').forEach(t=>{
    t.addEventListener('click', ()=>{
      document.querySelectorAll('.timer-tab').forEach(x=>x.classList.remove('active'));
      document.querySelectorAll('.timer-view').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById('view-'+t.dataset.t).classList.add('active');
    });
  });
  document.getElementById('voice-toggle').checked = voiceEnabled;
  document.getElementById('voice-toggle').addEventListener('change', (e)=>{
    voiceEnabled = e.target.checked;
    localStorage.setItem('voice_announce', voiceEnabled ? '1' : '0');
  });

  function fmt(sec){ const m=Math.floor(sec/60); const s=sec%60; return `${pad(m)}:${pad(s)}`; }

  let tabInterval=null, tabState=null;
  function renderDots(){
    const rounds = parseInt(document.getElementById('tab-rounds').value)||8;
    document.getElementById('tab-dots').innerHTML = Array.from({length:rounds}).map(()=>'<div class="dot"></div>').join('');
  }
  document.getElementById('tab-rounds').addEventListener('input', renderDots);
  renderDots();
  function tabInit(){
    const work = parseInt(document.getElementById('tab-work').value)||20;
    const rest = parseInt(document.getElementById('tab-rest').value)||10;
    const rounds = parseInt(document.getElementById('tab-rounds').value)||8;
    const cycles = parseInt(document.getElementById('tab-cycles').value)||1;
    tabState = { work, rest, rounds, cycles, curCycle:1, curRound:0, phase:'ready', remaining:3 };
    updateTabDisplay();
  }
  function updateTabDisplay(){
    const phaseEl = document.getElementById('tab-phase');
    document.getElementById('tab-display').textContent = fmt(tabState.remaining);
    document.getElementById('tab-round').textContent = `Раунд ${tabState.curRound} / ${tabState.rounds}  ·  Цикл ${tabState.curCycle}/${tabState.cycles}`;
    phaseEl.className = 'timer-phase' + (tabState.phase==='work'?' work':tabState.phase==='rest'?' rest':'');
    phaseEl.textContent = tabState.phase==='ready'?'ГОТОВНОСТЬ':tabState.phase==='work'?'РАБОТА':tabState.phase==='rest'?'ОТДЫХ':'ГОТОВО';
    document.querySelectorAll('#tab-dots .dot').forEach((d,i)=> d.classList.toggle('done', i < tabState.curRound - (tabState.phase==='work'?1:0)));
  }
  function tabTick(){
    tabState.remaining--;
    if(tabState.remaining<=0){
      if(tabState.phase==='ready'){ tabState.phase='work'; tabState.curRound=1; tabState.remaining=tabState.work; beepStart(); speak('Хаджиме'); vibrate([200]); }
      else if(tabState.phase==='work'){
        beepRoundEnd();
        if(tabState.curRound>=tabState.rounds){
          if(tabState.curCycle>=tabState.cycles){ tabState.phase='done'; clearInterval(tabInterval); tabInterval=null; beep(660,400); speak('Соремадэ'); vibrate([150,80,150,80,300]); updateTabDisplay(); return; }
          else { tabState.curCycle++; tabState.curRound=1; tabState.phase='work'; tabState.remaining=tabState.work; beep(880,150); speak('Хаджиме'); vibrate([200]); }
        } else { tabState.phase='rest'; tabState.remaining=tabState.rest; speak('Матэ'); vibrate([80,60,80]); }
      } else if(tabState.phase==='rest'){ tabState.curRound++; tabState.phase='work'; tabState.remaining=tabState.work; beep(880,150); speak('Хаджиме'); vibrate([200]); }
    } else if(tabState.remaining===10 && tabState.phase!=='ready'){ beep(770,120,0.2); }
    else if(tabState.remaining<=3 && tabState.remaining>0 && tabState.phase!=='ready'){ beep(660,80,0.15); vibrate([50]); }
    updateTabDisplay();
  }
  // ---------- Пресеты Табата ----------
  function getTabPresets(){
    try{ return JSON.parse(localStorage.getItem('tabata_presets')||'[]'); }catch(e){ return []; }
  }
  function setTabPresets(list){ localStorage.setItem('tabata_presets', JSON.stringify(list)); }
  function renderTabPresetSelect(){
    const sel = document.getElementById('tab-preset-select');
    const presets = getTabPresets();
    sel.innerHTML = '<option value="">Пресеты...</option>' + presets.map((p,i)=>`<option value="${i}">${p.name} (${p.work}/${p.rest}×${p.rounds}×${p.cycles})</option>`).join('');
  }
  renderTabPresetSelect();
  document.getElementById('tab-preset-save').addEventListener('click', ()=>{
    const name = prompt('Название пресета:', 'Мой пресет');
    if(!name) return;
    const presets = getTabPresets();
    presets.push({
      name,
      work: parseInt(document.getElementById('tab-work').value)||20,
      rest: parseInt(document.getElementById('tab-rest').value)||10,
      rounds: parseInt(document.getElementById('tab-rounds').value)||8,
      cycles: parseInt(document.getElementById('tab-cycles').value)||1
    });
    setTabPresets(presets);
    renderTabPresetSelect();
  });
  document.getElementById('tab-preset-select').addEventListener('change', (e)=>{
    const del = document.getElementById('tab-preset-del');
    if(e.target.value===''){ del.style.display='none'; return; }
    del.style.display='inline-block';
    const p = getTabPresets()[Number(e.target.value)];
    if(!p) return;
    document.getElementById('tab-work').value = p.work;
    document.getElementById('tab-rest').value = p.rest;
    document.getElementById('tab-rounds').value = p.rounds;
    document.getElementById('tab-cycles').value = p.cycles;
  });
  document.getElementById('tab-preset-del').addEventListener('click', ()=>{
    const sel = document.getElementById('tab-preset-select');
    if(sel.value==='') return;
    const presets = getTabPresets();
    presets.splice(Number(sel.value),1);
    setTabPresets(presets);
    renderTabPresetSelect();
    document.getElementById('tab-preset-del').style.display='none';
  });

  document.getElementById('tab-start').addEventListener('click', ()=>{ if(!tabState||tabState.phase==='done') tabInit(); if(tabInterval) return; tabInterval=setInterval(tabTick,1000); });
  document.getElementById('tab-pause').addEventListener('click', ()=>{ if(tabInterval){clearInterval(tabInterval); tabInterval=null;} });
  document.getElementById('tab-reset').addEventListener('click', ()=>{ if(tabInterval){clearInterval(tabInterval); tabInterval=null;} tabInit(); renderDots(); });
  tabInit();

  let cdInterval=null, cdRemaining=60;
  function cdRender(){ document.getElementById('cd-display').textContent = fmt(cdRemaining); }
  document.getElementById('cd-start').addEventListener('click', ()=>{
    if(cdInterval) return;
    if(cdRemaining<=0){ const m=parseInt(document.getElementById('cd-min').value)||0; const s=parseInt(document.getElementById('cd-sec').value)||0; cdRemaining=m*60+s; }
    cdInterval = setInterval(()=>{
      cdRemaining--;
      if(cdRemaining<=0){ cdRemaining=0; cdRender(); clearInterval(cdInterval); cdInterval=null; beep(660,500); vibrate([150,80,150,80,300]); return; }
      if(cdRemaining===10) beep(770,120,0.2);
      if(cdRemaining<=3){ beep(660,80,0.15); vibrate([50]); }
      cdRender();
    },1000);
  });
  document.getElementById('cd-pause').addEventListener('click', ()=>{ if(cdInterval){clearInterval(cdInterval); cdInterval=null;} });
  document.getElementById('cd-reset').addEventListener('click', ()=>{
    if(cdInterval){clearInterval(cdInterval); cdInterval=null;}
    const m=parseInt(document.getElementById('cd-min').value)||0; const s=parseInt(document.getElementById('cd-sec').value)||0;
    cdRemaining=m*60+s; cdRender();
  });
  cdRender();

  let swInterval=null, swStart=0, swElapsed=0, lapCount=0;
  function swFmt(ms){ const t=ms/1000; const m=Math.floor(t/60); const s=Math.floor(t%60); const th=Math.floor((ms%1000)/100); return `${pad(m)}:${pad(s)}.${th}`; }
  function swRender(){ document.getElementById('sw-display').textContent = swFmt(swElapsed); }
  document.getElementById('sw-start').addEventListener('click', (e)=>{
    if(swInterval){ clearInterval(swInterval); swInterval=null; e.target.textContent='Продолжить'; }
    else { swStart=Date.now()-swElapsed; swInterval=setInterval(()=>{ swElapsed=Date.now()-swStart; swRender(); },100); e.target.textContent='Пауза'; }
  });
  document.getElementById('sw-lap').addEventListener('click', ()=>{
    if(!swInterval) return; lapCount++;
    const el = document.getElementById('sw-laps');
    el.innerHTML = `<div>Круг ${lapCount} — ${swFmt(swElapsed)}</div>` + el.innerHTML;
  });
  document.getElementById('sw-reset').addEventListener('click', ()=>{
    clearInterval(swInterval); swInterval=null; swElapsed=0; lapCount=0;
    document.getElementById('sw-start').textContent='Старт';
    document.getElementById('sw-laps').innerHTML=''; swRender();
  });
  swRender();

  let refInterval=null, refRemaining=240, refGolden=false;
  function refRender(){
    document.getElementById('ref-display').textContent = fmt(refRemaining);
    const phaseEl = document.getElementById('ref-phase');
    phaseEl.className = 'timer-phase' + (refGolden?' golden':'');
    phaseEl.textContent = refGolden ? 'GOLDEN SCORE' : 'СХВАТКА';
  }
  function refStartClock(){
    if(refInterval) return;
    speak('Хаджиме');
    vibrate([200]);
    refInterval = setInterval(()=>{
      if(!refGolden){
        refRemaining--;
        if(refRemaining<=0){ refRemaining=0; refRender(); beep(660,500); speak('Соремадэ'); vibrate([150,80,150,80,300]); enterGolden(); return; }
        if(refRemaining===10) beep(770,120,0.2);
        if(refRemaining<=3){ beep(660,80,0.15); vibrate([50]); }
      } else { refRemaining++; }
      refRender();
    },1000);
  }
  function enterGolden(){ refGolden=true; refRemaining=0; refRender(); }
  document.getElementById('ref-start').addEventListener('click', refStartClock);
  document.getElementById('ref-pause').addEventListener('click', ()=>{ if(refInterval){clearInterval(refInterval); refInterval=null; speak('Матэ');} });
  document.getElementById('ref-golden').addEventListener('click', ()=>{ enterGolden(); refStartClock(); });
  document.getElementById('ref-reset').addEventListener('click', ()=>{
    if(refInterval){clearInterval(refInterval); refInterval=null;} refGolden=false;
    const m=parseInt(document.getElementById('ref-min').value)||4; refRemaining=m*60; refRender();
  });
  document.getElementById('ref-min').addEventListener('change', ()=>{
    if(!refInterval && !refGolden){ const m=parseInt(document.getElementById('ref-min').value)||4; refRemaining=m*60; refRender(); }
  });
  refRender();

  let osaInterval=null, osaElapsed=0;
  function osaRender(){
    document.getElementById('osa-display').textContent = pad(osaElapsed);
    const badge = document.getElementById('osa-badge');
    if(osaElapsed>=20) badge.innerHTML='<span class="badge ippon">ИППОН</span>';
    else if(osaElapsed>=10) badge.innerHTML='<span class="badge wazaari">ВАЗА-АРИ</span>';
    else badge.innerHTML='';
  }
  document.getElementById('osa-start').addEventListener('click', (e)=>{
    if(osaInterval){ clearInterval(osaInterval); osaInterval=null; e.target.textContent='Старт удержания'; return; }
    e.target.textContent='Стоп';
    osaInterval = setInterval(()=>{
      osaElapsed++;
      if(osaElapsed===10) beep(660,120);
      if(osaElapsed===20){ beep(880,300); clearInterval(osaInterval); osaInterval=null; document.getElementById('osa-start').textContent='Старт удержания'; }
      osaRender();
    },1000);
  });
  document.getElementById('osa-reset').addEventListener('click', ()=>{
    if(osaInterval){clearInterval(osaInterval); osaInterval=null;}
    document.getElementById('osa-start').textContent='Старт удержания'; osaElapsed=0; osaRender();
  });
  osaRender();

