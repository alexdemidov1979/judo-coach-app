  function techBeltLabel(romaji){
    for(const key of Object.keys(KYU_DATA)){
      for(const g of KYU_DATA[key].groups){
        if(g.items.some(it=>it.romaji===romaji)) return KYU_DATA[key].label;
      }
    }
    return null;
  }

  async function techNote(romaji){
    try{ const r = await S.get('technote_'+romaji); return r ? r.value : ''; }catch(e){ return ''; }
  }
  async function saveTechNote(romaji, text){
    try{ await S.set('technote_'+romaji, text); }catch(e){}
  }

  function techDetailHtml(it){
    const d = TECH_DETAILS[it.romaji];
    const belt = techBeltLabel(it.romaji);
    let html = `<div class="tech-detail" data-romaji="${it.romaji.replace(/"/g,'&quot;')}" style="padding:10px 4px 4px;border-top:1px dashed var(--line);margin-top:6px;">`;
    if(belt) html += `<div style="font-size:11px;color:var(--gold);font-weight:600;margin-bottom:6px;">Пояс: ${belt}</div>`;
    if(d){
      html += `<div style="font-size:13px;margin-bottom:8px;">${d.desc}</div>`;
      if(d.stages) html += `<div style="font-size:12px;font-weight:600;color:var(--dim);margin-top:6px;">Этапы выполнения</div><ol style="margin:4px 0 0 18px;font-size:13px;">${d.stages.map(s=>`<li>${s}</li>`).join('')}</ol>`;
      if(d.mistakes) html += `<div style="font-size:12px;font-weight:600;color:var(--belt-red);margin-top:8px;">Типичные ошибки</div><ul style="margin:4px 0 0 18px;font-size:13px;">${d.mistakes.map(s=>`<li>${s}</li>`).join('')}</ul>`;
      if(d.combos) html += `<div style="font-size:12px;font-weight:600;color:var(--dim);margin-top:8px;">Комбинации</div><ul style="margin:4px 0 0 18px;font-size:13px;">${d.combos.map(s=>`<li>${s}</li>`).join('')}</ul>`;
      if(d.counters) html += `<div style="font-size:12px;font-weight:600;color:var(--dim);margin-top:8px;">Контрприёмы / защита</div><ul style="margin:4px 0 0 18px;font-size:13px;">${d.counters.map(s=>`<li>${s}</li>`).join('')}</ul>`;
      if(d.related && d.related.length) html += `<div style="font-size:12px;font-weight:600;color:var(--dim);margin-top:8px;">Похожие техники</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">${d.related.map(r=>`<span class="related-tech" data-romaji="${r}" style="font-size:12px;background:var(--surface-2,var(--card));border:1px solid var(--line);border-radius:8px;padding:3px 8px;cursor:pointer;">${r}</span>`).join('')}</div>`;
    } else {
      html += `<div class="empty-hint">Подробная карточка (этапы, ошибки, комбинации) для этой техники пока не заполнена — она появится в следующих обновлениях.</div>`;
    }
    html += `<div style="font-size:12px;font-weight:600;color:var(--dim);margin-top:10px;">Заметки тренера</div>
      <textarea class="tech-note-input" data-romaji="${it.romaji.replace(/"/g,'&quot;')}" rows="2" placeholder="Личные заметки по этой технике..." style="width:100%;margin-top:4px;"></textarea>`;
    html += `</div>`;
    return html;
  }

  function renderKodokan(){
    const tabsEl = document.getElementById('kodokan-tabs');
    tabsEl.innerHTML = KODOKAN_GROUPS.map(g =>
      `<div class="lib-cat ${kodokanFilter===g.key?'active':''}" data-kodokan="${g.key}">${g.label}</div>`).join('');
    tabsEl.querySelectorAll('[data-kodokan]').forEach(c=> c.addEventListener('click', ()=>{ kodokanFilter=c.dataset.kodokan; renderKodokan(); }));

    const group = KODOKAN_GROUPS.find(g=>g.key===kodokanFilter);
    const el = document.getElementById('kodokan-list');
    let html = `<a href="${group.playlist}" target="_blank" rel="noopener" class="btn ghost small" style="display:inline-block;text-decoration:none;margin:8px 0;">▶ Плейлист ${group.label} на Rutube</a>`;
    if(group.note){
      html += `<div class="desc" style="margin-bottom:8px;">${group.note}</div>`;
    }
    if(group.cat){
      const items = TERMINOLOGY_DATA.techniques.filter(t=>t.cat===group.cat);
      html += items.map(it => `
        <div class="lib-item tech-item">
          <div class="title tech-title" data-romaji="${it.romaji.replace(/"/g,'&quot;')}" style="cursor:pointer;">
            <span>${it.romaji} <span style="color:var(--dim);font-weight:400;">(${it.jp})</span></span>
            ${(it.video || group.playlist) ? `<span class="video-link" data-video="${it.video || group.playlist}">▶ Смотреть видео</span>` : ''}
          </div>
          <div class="desc">${it.ru_term || ''}</div>
          <div class="tech-detail-slot" data-romaji-slot="${it.romaji.replace(/"/g,'&quot;')}"></div>
        </div>
      `).join('');
    }
    el.innerHTML = html;
    wireTechCards(el);
  }

  function wireTechCards(container){
    container.querySelectorAll('.tech-title').forEach(titleEl=>{
      titleEl.addEventListener('click', async (e)=>{
        if(e.target.closest('.video-link')) return; // клик по видео не раскрывает карточку
        const romaji = titleEl.dataset.romaji;
        const slot = container.querySelector(`.tech-detail-slot[data-romaji-slot="${CSS.escape(romaji)}"]`);
        if(!slot) return;
        if(slot.dataset.open==='1'){ slot.innerHTML=''; slot.dataset.open='0'; return; }
        const it = TERMINOLOGY_DATA.techniques.find(t=>t.romaji===romaji) || {romaji, jp:'', ru_term:''};
        slot.innerHTML = techDetailHtml(it);
        slot.dataset.open = '1';
        const noteInput = slot.querySelector('.tech-note-input');
        if(noteInput){
          noteInput.value = await techNote(romaji);
          let saveTimer;
          noteInput.addEventListener('input', ()=>{
            clearTimeout(saveTimer);
            saveTimer = setTimeout(()=> saveTechNote(romaji, noteInput.value), 400);
          });
        }
        slot.querySelectorAll('.related-tech').forEach(rt=>{
          rt.addEventListener('click', ()=>{
            const target = container.querySelector(`.tech-title[data-romaji="${CSS.escape(rt.dataset.romaji)}"]`);
            if(target){ target.click(); target.scrollIntoView({behavior:'smooth', block:'center'}); }
          });
        });
      });
    });
  }

  function renderKyu(){
    const tabsEl = document.getElementById('kyu-tabs');
    tabsEl.innerHTML = Object.keys(KYU_DATA).map(k =>
      `<div class="lib-cat ${kyuFilter===k?'active':''}" data-kyu="${k}">${KYU_DATA[k].label}</div>`).join('');
    tabsEl.querySelectorAll('[data-kyu]').forEach(c=> c.addEventListener('click', ()=>{ kyuFilter=c.dataset.kyu; renderKyu(); }));

    const data = KYU_DATA[kyuFilter];
    const el = document.getElementById('kyu-list');
    el.innerHTML = data.groups.map(g => `
      <div style="margin:10px 0 4px;font-family:'Oswald';font-size:13px;color:var(--gold);text-transform:uppercase;letter-spacing:.04em;">${g.title}</div>
      ${g.items.map(it => `
        <div class="lib-item">
          <div class="title"><span>${it.romaji} <span style="color:var(--dim);font-weight:400;">(${it.jp})</span></span>
            ${videoFor(it.romaji) ? `<span class="video-link" data-video="${videoFor(it.romaji)}">▶ Смотреть видео</span>` : `<span style="font-size:12px;color:var(--dim);white-space:nowrap;">⚠ Видео пока отсутствует</span>`}
          </div>
          <div class="desc">${it.ru}</div>
        </div>
      `).join('')}
    `).join('');
  }

  const TERMS_CATS = [
    ['all','Все'],
    ['general','Общие термины'],
    ['scoring','Оценки'],
    ['Броски руками (Te-waza)','Броски руками'],
    ['Броски бедром (Koshi-waza)','Броски бедром'],
    ['Броски ногами (Ashi-waza)','Броски ногами'],
    ['Броски с падением на спину (Masutemi-waza)','Падение на спину'],
    ['Броски с падением на бок (Yokosutemi-waza)','Падение на бок'],
    ['Удержания (Osaekomi-waza)','Удержания'],
    ['Удушения (Shime-waza)','Удушения'],
    ['Болевые приёмы (Kansetsu-waza)','Болевые приёмы']
  ];

  function allTermsFlat(){
    const flat = [];
    TERMINOLOGY_DATA.general.forEach(x=> flat.push({cat:'general', term:x.term, meaning:x.meaning, video:null}));
    TERMINOLOGY_DATA.scoring.forEach(x=> flat.push({cat:'scoring', term:x.term, meaning:x.meaning, video:null}));
    TERMINOLOGY_DATA.techniques.forEach(x=> flat.push({cat:x.cat, term:`${x.romaji} (${x.ru_translit})`, meaning:x.ru_term, video:x.video, jp:x.jp}));
    return flat;
  }

  function renderTerms(){
    document.getElementById('terms-cats').innerHTML = TERMS_CATS.map(([k,l])=>
      `<div class="lib-cat ${termsFilter===k?'active':''}" data-tcat="${k}">${l}</div>`).join('');
    document.querySelectorAll('[data-tcat]').forEach(c=> c.addEventListener('click', ()=>{ termsFilter=c.dataset.tcat; renderTerms(); }));

    let list = allTermsFlat();
    if(termsFilter!=='all') list = list.filter(x=>x.cat===termsFilter);
    if(termsSearchQuery.trim()){
      const q = termsSearchQuery.trim().toLowerCase();
      list = list.filter(x => x.term.toLowerCase().includes(q) || x.meaning.toLowerCase().includes(q) || (x.jp||'').includes(q));
    }
    const el = document.getElementById('terms-list');
    if(list.length===0){ el.innerHTML = '<div class="empty-hint">Ничего не найдено.</div>'; return; }
    el.innerHTML = list.map(x => `
      <div class="lib-item">
        <div class="title"><span>${x.term}</span>${x.video ? `<span class="video-link" data-video="${x.video}">▶️ видео</span>` : ''}</div>
        <div class="desc">${x.meaning}</div>
      </div>
    `).join('');
  }

  document.getElementById('terms-search').addEventListener('input', (e)=>{
    termsSearchQuery = e.target.value;
    renderTerms();
  });

  // ================= СУДЕЙСКИЕ ПРАВИЛА МФД =================
  let rulesSearchQuery = '';
  function renderRules(){
    let list = REFEREE_RULES_DATA;
    if(rulesSearchQuery.trim()){
      const q = rulesSearchQuery.trim().toLowerCase();
      list = list.filter(r => r.title.toLowerCase().includes(q) || r.text.toLowerCase().includes(q) || r.num.toLowerCase().includes(q));
    }
    const el = document.getElementById('rules-list');
    if(!el) return;
    if(list.length===0){ el.innerHTML = '<div class="empty-hint">Ничего не найдено.</div>'; return; }
    el.innerHTML = list.map((r,i) => `
      <div class="lib-item rule-item" data-ridx="${i}">
        <div class="title" style="cursor:pointer;">
          <span style="color:var(--navy,var(--gold));font-weight:700;font-size:11.5px;">${r.num}</span>
          <span style="display:block;margin-top:2px;">${r.title}</span>
        </div>
        <div class="desc rule-body" style="display:none;">${r.text}</div>
      </div>
    `).join('');
    el.querySelectorAll('.rule-item .title').forEach(t=>{
      t.addEventListener('click', ()=>{
        const body = t.parentElement.querySelector('.rule-body');
        body.style.display = body.style.display==='none' ? 'block' : 'none';
      });
    });
  }
  const rulesSearchEl = document.getElementById('rules-search');
  if(rulesSearchEl){
    rulesSearchEl.addEventListener('input', (e)=>{
      rulesSearchQuery = e.target.value;
      renderRules();
    });
  }

