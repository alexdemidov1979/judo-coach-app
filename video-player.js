(function videoPlayerModule(){
  const modal = document.getElementById('video-modal');
  const frameHolder = document.getElementById('video-modal-iframe-holder');
  const miniPlayer = document.getElementById('mini-player');
  const miniHolder = document.getElementById('mini-player-iframe-holder');
  let currentList = [];
  let currentIndex = 0;
  let dragOffset = null;

  function extractRutubeId(url){
    const m = String(url||'').match(/rutube\.ru\/(?:video|play\/embed)\/([a-zA-Z0-9]+)/);
    return m ? m[1] : null;
  }
  function extractDriveId(url){
    const m = String(url||'').match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
  }
  function embedUrl(url){
    const id = extractRutubeId(url);
    return id ? `https://rutube.ru/play/embed/${id}` : url;
  }
  // Открывает ссылку в системном браузере телефона (не в окне приложения).
  // Google Drive отказывается показывать видео внутри встроенного окна
  // Android-приложения — это ограничение самого Google, куки его не обходят.
  // Единственный надёжный способ — открыть видео в обычном браузере (Chrome и т.п.).
  window.__openDriveVideo = function(url){
    if(!url) return;
    const isNativeApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if(isNativeApp){
      // Переход на "чужой" домен из приложения Capacitor автоматически
      // открывается во внешнем браузере телефона, а не внутри самого приложения.
      window.location.href = url;
    } else {
      window.open(url, '_blank', 'noopener');
    }
  };

  function playerMarkup(url){
    const driveId = extractDriveId(url);
    if(driveId){
      const viewUrl = `https://drive.google.com/file/d/${driveId}/view`;
      const isNativeApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
      if(isNativeApp){
        return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;height:100%;padding:24px;text-align:center;">
          <div style="font-size:40px;">🎬</div>
          <div style="font-size:14px;opacity:.75;max-width:280px;">Google Drive не разрешает показывать видео внутри приложения — откройте его в браузере телефона.</div>
          <button class="btn" onclick="window.__openDriveVideo('${viewUrl}')">▶ Открыть видео в браузере</button>
        </div>`;
      }
      // В обычном браузере / PWA официальный embed Google Drive работает нормально.
      return `<iframe src="https://drive.google.com/file/d/${driveId}/preview" allow="autoplay; clipboard-write" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe>`;
    }
    return `<iframe src="${embedUrl(url)}" allow="clipboard-write; autoplay" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe>`;
  }
  function findTechnique(url){
    try{ return (typeof TERMINOLOGY_DATA!=='undefined') ? TERMINOLOGY_DATA.techniques.find(t=>t.video===url || t.video2===url) : null; }catch(e){ return null; }
  }
  // Стабильный идентификатор техники (для избранного/истории/навигации) — не меняется при переключении RuTube ↔ Диск
  function techId(t){ return t.video || t.video2; }
  function buildList(url){
    const t = findTechnique(url);
    if(t){
      const list = TERMINOLOGY_DATA.techniques.filter(x=>x.cat===t.cat);
      const idx = list.findIndex(x=>techId(x)===techId(t));
      return { list, idx: idx<0?0:idx };
    }
    return { list: [{video:url, ru_term:'Видео', jp:'', romaji:''}], idx:0 };
  }
  // Выбранный пользователем источник для текущего видео: 'rutube' или 'drive'
  let currentSourcePref = 'rutube';
  function activeUrlFor(t){
    if(currentSourcePref === 'drive' && t.video2) return t.video2;
    if(currentSourcePref === 'rutube' && t.video) return t.video;
    return t.video || t.video2 || null;
  }
  function updateSourceButtons(t){
    const rBtn = document.getElementById('vm-src-rutube');
    const dBtn = document.getElementById('vm-src-drive');
    if(!rBtn || !dBtn) return;
    // Drive link can be restored by the standalone bridge if an older cached
    // data object reached the player.
    if(!t.video2){
      const mapped = window.JUDO_DRIVE_VIDEO_URLS?.[t.romaji];
      if(mapped) t.video2 = mapped;
    }
    if(!t.video2 && window.JUDO_TERMINOLOGY_TECHNIQUES){
      const found = window.JUDO_TERMINOLOGY_TECHNIQUES.find(x=>x && x.romaji===t.romaji && x.video2);
      if(found) t.video2 = found.video2;
    }
    rBtn.style.display = t.video ? 'flex' : 'none';
    dBtn.style.display = t.video2 ? 'flex' : 'none';
    rBtn.classList.toggle('active', currentSourcePref==='rutube');
    dBtn.classList.toggle('active', currentSourcePref==='drive');
  }
  function renderCurrentFrame(t){
    const activeUrl = activeUrlFor(t);
    document.getElementById('vm-open-rutube').href = activeUrl || '#';
    frameHolder.innerHTML = playerMarkup(activeUrl);
    if(miniPlayer.classList.contains('open')) miniHolder.innerHTML = frameHolder.innerHTML;
  }

  async function getSet(key){
    try{ const r = await S.get(key); return r ? new Set(JSON.parse(r.value)) : new Set(); }catch(e){ return new Set(); }
  }
  async function saveSet(key, set){ try{ await S.set(key, JSON.stringify(Array.from(set))); }catch(e){} }

  async function markHistory(url){
    try{
      const r = await S.get('video_history');
      const hist = r ? JSON.parse(r.value) : {};
      const rec = hist[url] || {count:0};
      rec.count = (rec.count||0)+1;
      rec.ts = Date.now();
      hist[url] = rec;
      await S.set('video_history', JSON.stringify(hist));
    }catch(e){}
  }

  async function refreshActionButtons(url){
    const favs = await getSet('video_favorites');
    const watched = await getSet('video_watched');
    document.getElementById('vm-fav').classList.toggle('active', favs.has(url));
    document.getElementById('vm-watched').classList.toggle('active', watched.has(url));
  }

  function renderRelated(){
    const wrap = document.getElementById('vm-related');
    const items = currentList.filter((_,i)=>i!==currentIndex).slice(0,8);
    if(!items.length){ wrap.innerHTML = '<div style="opacity:.6;font-size:13px;">Больше техник в этой группе нет.</div>'; return; }
    wrap.innerHTML = items.map(it=>`
      <div class="vm-related-item" data-video="${escapeHtml(techId(it)||'')}">
        <div><div style="font-weight:600;font-size:13.5px;">${escapeHtml(it.romaji||it.ru_term||'')}</div><div style="font-size:11.5px;opacity:.65;">${escapeHtml(it.ru_term||'')}</div></div>
        <span>▶</span>
      </div>`).join('');
    wrap.querySelectorAll('.vm-related-item').forEach(el=>{
      el.addEventListener('click', ()=> openVideoByUrl(el.dataset.video));
    });
  }

  async function showAt(index){
    if(window.JudoFightReview?.closeLocal) window.JudoFightReview.closeLocal();
    if(!currentList.length) return;
    currentIndex = ((index % currentList.length) + currentList.length) % currentList.length;
    const t = currentList[currentIndex];
    document.getElementById('vm-title1').textContent = t.romaji || t.ru_term || 'Видео';
    document.getElementById('vm-title2').textContent = [t.jp, t.ru_term].filter(Boolean).join(' · ');
    document.getElementById('vm-desc').textContent = t.ru_term ? `${t.ru_term}${t.cat? ' — '+t.cat : ''}` : (t.cat||'');
    currentSourcePref = t.video ? 'rutube' : 'drive';
    updateSourceButtons(t);
    renderCurrentFrame(t);
    if(window.VideoFeedback) window.VideoFeedback.open(activeUrlFor(t), t.romaji || t.ru_term || 'Видео');
    const id = techId(t);
    await refreshActionButtons(id);
    await markHistory(id);
    renderRelated();
  }

  // Уровень кю техники по romaji (5 = самый базовый уровень, дальше цифра меньше — выше пояс).
  function kyuLevelOf(romaji){
    if(!romaji || typeof KYU_DATA === 'undefined') return null;
    for(const key of Object.keys(KYU_DATA)){
      const n = Number(key);
      if(!Number.isFinite(n)) continue; // пропускаем даны и прочие нечисловые уровни
      if(KYU_DATA[key].groups.some(g=>g.items.some(it=>it.romaji===romaji))) return n;
    }
    return null;
  }

  window.openVideoByUrl = function(url){
    if(!url) return;
    const t = findTechnique(url);
    if(t && window.ProFeatures && !window.ProFeatures.isPro){
      const level = kyuLevelOf(t.romaji);
      // В FREE-версии открыт только базовый уровень 5 кю. Более высокие
      // пояса (меньшее число кю) и даны — функция полной версии.
      if(level !== null && level < window.ProFeatures.limits.maxTechniqueRank){
        window.ProFeatures.requirePro('Видео-библиотека техник');
        return;
      }
    }
    const built = buildList(url);
    currentList = built.list;
    currentIndex = built.idx;
    modal.classList.add('open');
    document.body.style.overflow='hidden';
    const reviewPanel = document.getElementById('video-feedback-toolbar');
    const reviewBtn = document.getElementById('vm-toggle-review');
    if(reviewPanel){ reviewPanel.style.display='none'; }
    if(reviewBtn){ reviewBtn.classList.remove('active'); }
    showAt(currentIndex);
  };

  // Делегирование кликов по ссылкам-видео, сгенерированным в разных разделах приложения
  document.addEventListener('click', (e)=>{
    const el = e.target.closest('.video-link');
    if(el && el.dataset.video){ e.preventDefault(); openVideoByUrl(el.dataset.video); }
  });

  // ================= ГЛОБАЛЬНЫЙ ПОИСК =================
  async function performGlobalSearch(q){
    const query = q.trim().toLowerCase();
    const resultsEl = document.getElementById('global-search-results');
    if(!query){ resultsEl.innerHTML = `<div class="empty-hint">Начните вводить запрос — поиск идёт сразу по техникам, ученикам, терминам, правилам, играм и заметке дня.</div>`; return; }

    const groups = [];

    // Техники (Кодокан)
    const techMatches = TERMINOLOGY_DATA.techniques.filter(t =>
      t.romaji.toLowerCase().includes(query) || (t.ru_term||'').toLowerCase().includes(query) || (t.jp||'').includes(q));
    if(techMatches.length) groups.push({label:'Техники', items: techMatches.map(t=>({
      title: t.romaji, sub: `${t.ru_term} · ${t.cat}`, action: ()=>openTechniqueFromSearch(t.romaji)
    }))});

    // Термины
    const allTerms = [...TERMINOLOGY_DATA.general, ...TERMINOLOGY_DATA.scoring];
    const termMatches = allTerms.filter(t => t.term.toLowerCase().includes(query) || t.meaning.toLowerCase().includes(query));
    if(termMatches.length) groups.push({label:'Термины', items: termMatches.map(t=>({
      title: t.term, sub: t.meaning, action: ()=>{ document.querySelector('.bn-item[data-nav="library"]').click(); closeSearchModal(); }
    }))});

    // Судейские правила
    const ruleMatches = REFEREE_RULES_DATA.filter(r => r.title.toLowerCase().includes(query) || r.text.toLowerCase().includes(query) || r.num.toLowerCase().includes(query));
    if(ruleMatches.length) groups.push({label:'Судейские правила', items: ruleMatches.map(r=>({
      title: `${r.num} — ${r.title}`, sub: r.text.slice(0,70)+'…', action: ()=>{ document.querySelector('.bn-item[data-nav="library"]').click(); closeSearchModal(); }
    }))});

    // Кю-программа
    const kyuMatches = [];
    Object.keys(KYU_DATA).forEach(key=>{
      KYU_DATA[key].groups.forEach(g=>{
        g.items.forEach(it=>{
          if((it.romaji||'').toLowerCase().includes(query) || (it.ru||'').toLowerCase().includes(query)){
            kyuMatches.push({title: it.romaji || it.ru, sub: `${KYU_DATA[key].label} · ${g.title||''}`});
          }
        });
      });
    });
    if(kyuMatches.length) groups.push({label:'Программа по кю', items: kyuMatches.map(k=>({
      title:k.title, sub:k.sub, action: ()=>{ document.querySelector('.bn-item[data-nav="library"]').click(); closeSearchModal(); }
    }))});

    // Библиотека (игры/разминка/СФП)
    const libMatches = LIBRARY_SEED_V3.filter(x => x.title.toLowerCase().includes(query) || x.desc.toLowerCase().includes(query));
    if(libMatches.length) groups.push({label:'Разминка / игры / СФП', items: libMatches.slice(0,15).map(x=>({
      title:x.title, sub:x.desc.slice(0,70)+'…', action: ()=>{ document.querySelector('.bn-item[data-nav="library"]').click(); closeSearchModal(); }
    }))});

    // Спортсмены
    try{
      const roster = await getRoster();
      const rMatches = roster.filter(r => (r.name||'').toLowerCase().includes(query));
      if(rMatches.length) groups.push({label:'Спортсмены', items: rMatches.map(r=>({
        title:r.name, sub:`Пояс: ${r.kyu||'—'}`, action: ()=>{ document.querySelector('.bn-item[data-nav="roster"]').click(); closeSearchModal(); }
      }))});
    }catch(e){}

    // Заметка дня
    try{
      const noteR = await S.get('today_quicknote');
      const note = noteR ? noteR.value : '';
      if(note && note.toLowerCase().includes(query)){
        groups.push({label:'Заметки', items:[{title:'Заметка дня', sub: note.slice(0,80), action: ()=>{ document.querySelector('.bn-item[data-nav="today"]').click(); closeSearchModal(); }}]});
      }
    }catch(e){}

    if(!groups.length){ resultsEl.innerHTML = `<div class="empty-hint">Ничего не найдено по запросу «${q}».</div>`; return; }

    resultsEl.innerHTML = groups.map(g => `
      <div style="margin-bottom:14px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:var(--dim);font-weight:700;margin:6px 0;">${g.label} (${g.items.length})</div>
        ${g.items.slice(0,20).map((it,i)=>`
          <div class="lib-item search-result-item" data-gidx="${groups.indexOf(g)}" data-iidx="${i}" style="cursor:pointer;">
            <div class="title">${it.title}</div>
            <div class="desc">${it.sub}</div>
          </div>
        `).join('')}
      </div>
    `).join('');

    resultsEl.querySelectorAll('.search-result-item').forEach(el=>{
      el.addEventListener('click', ()=>{
        const g = groups[+el.dataset.gidx];
        const it = g.items[+el.dataset.iidx];
        if(it.action) it.action();
      });
    });
  }

  function openTechniqueFromSearch(romaji){
    document.querySelector('.bn-item[data-nav="library"]').click();
    closeSearchModal();
    setTimeout(()=>{
      const t = document.querySelector(`.tech-title[data-romaji="${CSS.escape(romaji)}"]`);
      if(t){ t.scrollIntoView({behavior:'smooth', block:'center'}); t.click(); }
    }, 300);
  }

  function openSearchModal(){
    document.getElementById('search-modal').classList.add('open');
    document.body.style.overflow='hidden';
    const input = document.getElementById('global-search-input');
    input.value='';
    performGlobalSearch('');
    setTimeout(()=>input.focus(), 100);
  }
  function closeSearchModal(){
    document.getElementById('search-modal').classList.remove('open');
    document.body.style.overflow='';
  }
  document.getElementById('global-search-fab').addEventListener('click', openSearchModal);

  // ---------- Доступность: Escape закрывает модалки, Enter/Space активируют role="button" ----------
  document.addEventListener('keydown', (e)=>{
    if(e.key==='Escape'){
      const searchModal = document.getElementById('search-modal');
      const videoModal = document.getElementById('video-modal');
      if(searchModal && searchModal.classList.contains('open')) closeSearchModal();
      else if(videoModal && videoModal.classList.contains('open')) document.getElementById('vm-close').click();
    }
    if((e.key==='Enter' || e.key===' ') && e.target.getAttribute && e.target.getAttribute('role')==='button'){
      e.preventDefault();
      e.target.click();
    }
  });

  document.getElementById('search-modal-close').addEventListener('click', closeSearchModal);
  let globalSearchTimer;
  document.getElementById('global-search-input').addEventListener('input', (e)=>{
    clearTimeout(globalSearchTimer);
    globalSearchTimer = setTimeout(()=> performGlobalSearch(e.target.value), 200);
  });


  document.getElementById('vm-close').addEventListener('click', ()=>{
    modal.classList.remove('open');
    document.body.style.overflow='';
    if(!miniPlayer.classList.contains('open')) frameHolder.innerHTML='';
  });
  document.getElementById('vm-prev').addEventListener('click', ()=>showAt(currentIndex-1));
  document.getElementById('vm-next').addEventListener('click', ()=>showAt(currentIndex+1));

  document.getElementById('vm-fav').addEventListener('click', async ()=>{
    const t = currentList[currentIndex]; if(!t) return;
    const id = techId(t);
    const favs = await getSet('video_favorites');
    if(favs.has(id)) favs.delete(id); else favs.add(id);
    await saveSet('video_favorites', favs);
    refreshActionButtons(id);
  });
  document.getElementById('vm-watched').addEventListener('click', async ()=>{
    const t = currentList[currentIndex]; if(!t) return;
    const id = techId(t);
    const watched = await getSet('video_watched');
    if(watched.has(id)) watched.delete(id); else watched.add(id);
    await saveSet('video_watched', watched);
    refreshActionButtons(id);
  });
  document.getElementById('vm-share').addEventListener('click', async ()=>{
    const t = currentList[currentIndex]; if(!t) return;
    const url = activeUrlFor(t);
    const shareData = { title: t.romaji||'Техника дзюдо', text: t.ru_term||'', url };
    if(navigator.share){ try{ await navigator.share(shareData); }catch(e){} }
    else { try{ await navigator.clipboard.writeText(url); alert('Ссылка на видео скопирована'); }catch(e){} }
  });
  document.getElementById('vm-src-rutube').addEventListener('click', ()=>{
    const t = currentList[currentIndex]; if(!t || !t.video) return;
    currentSourcePref = 'rutube';
    updateSourceButtons(t);
    renderCurrentFrame(t);
  });
  document.getElementById('vm-src-drive').addEventListener('click', ()=>{
    const t = currentList[currentIndex]; if(!t || !t.video2) return;
    currentSourcePref = 'drive';
    updateSourceButtons(t);
    renderCurrentFrame(t);
  });

  // ===== Мини-плеер (свободно перемещаемое окно внутри приложения) =====
  function positionMiniDefault(){
    miniPlayer.style.right = '12px';
    miniPlayer.style.bottom = 'calc(84px + var(--safe-bottom))';
    miniPlayer.style.left = 'auto';
    miniPlayer.style.top = 'auto';
  }
  document.getElementById('vm-mini').addEventListener('click', ()=>{
    miniHolder.innerHTML = frameHolder.innerHTML;
    miniPlayer.classList.add('open');
    positionMiniDefault();
    modal.classList.remove('open');
    document.body.style.overflow='';
  });
  document.getElementById('mp-expand').addEventListener('click', ()=>{
    miniPlayer.classList.remove('open');
    modal.classList.add('open');
    document.body.style.overflow='hidden';
  });
  document.getElementById('mp-close').addEventListener('click', ()=>{
    miniPlayer.classList.remove('open');
    miniHolder.innerHTML='';
    frameHolder.innerHTML='';
  });
  // Перетаскивание мини-плеера (мышь и тач)
  function startDrag(clientX, clientY){
    const rect = miniPlayer.getBoundingClientRect();
    dragOffset = { x: clientX-rect.left, y: clientY-rect.top };
  }
  function moveDrag(clientX, clientY){
    if(!dragOffset) return;
    miniPlayer.style.left = Math.max(4,Math.min(window.innerWidth-204, clientX-dragOffset.x))+'px';
    miniPlayer.style.top = Math.max(4,Math.min(window.innerHeight-120, clientY-dragOffset.y))+'px';
    miniPlayer.style.right = 'auto';
    miniPlayer.style.bottom = 'auto';
  }
  miniPlayer.addEventListener('mousedown', (e)=>{ if(e.target.tagName==='BUTTON') return; startDrag(e.clientX,e.clientY); });
  document.addEventListener('mousemove', (e)=>moveDrag(e.clientX,e.clientY));
  document.addEventListener('mouseup', ()=>dragOffset=null);
  miniPlayer.addEventListener('touchstart', (e)=>{ if(e.target.tagName==='BUTTON') return; const tt=e.touches[0]; startDrag(tt.clientX,tt.clientY); }, {passive:true});
  document.addEventListener('touchmove', (e)=>{ if(dragOffset){ const tt=e.touches[0]; moveDrag(tt.clientX,tt.clientY); } }, {passive:true});
  document.addEventListener('touchend', ()=>dragOffset=null);
})();
