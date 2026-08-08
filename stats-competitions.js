  // ================= STATS =================
  async function renderExams(){
    const list = await getRoster();
    const el = document.getElementById('exams-list');
    const withKyu = list.filter(r => kyuKeyFromLabel(r.kyu));
    if(!withKyu.length){ el.innerHTML = '<div class="empty-hint">Нет учеников с поясом от 5 до 1 кю с чеклистом техник.</div>'; return; }
    const ready = [], inProgress = [];
    withKyu.forEach(r=>{
      const prog = techProgressCount(r);
      if(prog && prog.total>0 && prog.done===prog.total) ready.push(r); else inProgress.push(r);
    });
    function rowHtml(r){
      const prog = techProgressCount(r);
      const pct = prog && prog.total>0 ? Math.round((prog.done/prog.total)*100) : 0;
      const next = nextKyuInfo(r.kyu);
      return `
        <div class="lib-item exam-row" data-name="${r.name.replace(/"/g,'&quot;')}" style="cursor:pointer;">
          <div class="title"><span>${r.name}</span><span style="color:var(--dim);font-weight:400;">${r.kyu||''}</span></div>
          <div class="desc">${prog?`${prog.done}/${prog.total} техник (${pct}%)`:''}${next?(' · следующий: '+next.label):''}</div>
          <div style="height:6px;background:var(--surface-2,var(--line));border-radius:4px;margin-top:6px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${pct===100?'var(--ok)':'var(--gold)'};"></div>
          </div>
        </div>`;
    }
    el.innerHTML = `
      ${ready.length ? `<div style="font-size:12px;font-weight:700;color:var(--ok);margin:6px 0;">🎓 ГОТОВЫ К ЭКЗАМЕНУ (${ready.length})</div>${ready.map(rowHtml).join('')}` : ''}
      <div style="font-size:12px;font-weight:700;color:var(--dim);margin:14px 0 6px;">В ПРОЦЕССЕ ПОДГОТОВКИ (${inProgress.length})</div>
      ${inProgress.map(rowHtml).join('') || '<div class="empty-hint">Все ученики готовы 🎉</div>'}
    `;
    el.querySelectorAll('.exam-row').forEach(row=>{
      row.addEventListener('click', ()=>{
        document.querySelector('.bn-item[data-nav="roster"]').click();
        setTimeout(()=>{
          const idx = list.findIndex(r=>r.name===row.dataset.name);
          const top = document.querySelector(`.roster-row .top[data-i="${idx}"]`);
          if(top){ top.click(); top.scrollIntoView({behavior:'smooth', block:'center'}); }
        }, 250);
      });
    });
  }

  // ================= СОРЕВНОВАНИЯ =================
  async function getCompetitions(){
    try{ const r = await S.get('competitions'); return r ? JSON.parse(r.value) : []; }catch(e){ return []; }
  }
  async function setCompetitions(list){ await S.set('competitions', JSON.stringify(list)); }
  let openCompIndex = null;
  let openFightsKey = null; // формат "ci-pi" — какая карточка "Схватки" сейчас раскрыта
  const medalIcon = {1:'🥇', 2:'🥈', 3:'🥉'};
  const fightResultLabel = {win:'Победа 🟢', loss:'Поражение 🔴'};

  async function renderCompetitions(){
    const comps = await getCompetitions();
    const roster = await getRoster();
    comps.sort((a,b)=> (a.date||'').localeCompare(b.date||''));

    let gold=0, silver=0, bronze=0;
    comps.forEach(c=> (c.participants||[]).forEach(p=>{
      if(p.place==='1') gold++; else if(p.place==='2') silver++; else if(p.place==='3') bronze++;
    }));
    document.getElementById('comp-medal-summary').innerHTML = `
      <div>🥇 <b>${gold}</b></div><div>🥈 <b>${silver}</b></div><div>🥉 <b>${bronze}</b></div>`;

    const el = document.getElementById('comp-list');
    if(!comps.length){ el.innerHTML = '<div class="empty-hint">Соревнований пока нет — добавьте первое ниже.</div>'; return; }
    const today = new Date().toISOString().slice(0,10);
    el.innerHTML = comps.map((c,i)=>{
      const isPast = c.date && c.date < today;
      const parts = c.participants || [];
      return `
      <div class="lib-item comp-item">
        <div class="title comp-title" data-i="${i}" style="cursor:pointer;">
          <span>${c.name} ${isPast?'':'<span style=\"color:var(--ok);\">· скоро</span>'}</span>
          <span style="color:var(--dim);font-weight:400;">${c.date ? new Date(c.date).toLocaleDateString('ru-RU') : ''}</span>
        </div>
        <div class="desc">${c.place||''}${c.ageCategory?(' · '+c.ageCategory):''} · участников: ${parts.length}</div>
        <div class="comp-detail" data-cslot="${i}" style="${openCompIndex===i?'':'display:none;'}">
          ${parts.length ? parts.map((p,pi)=>{
            const fights = p.fights || [];
            const wins = fights.filter(f=>f.result==='win').length;
            const fkey = `${i}-${pi}`;
            return `
            <div style="padding:6px 0;border-bottom:1px dashed var(--line);font-size:13px;">
              <div style="display:flex;align-items:center;gap:6px;">
                <div style="flex:1;">${p.name}${p.weightCat?(' · '+p.weightCat+' кг'):''}</div>
                <select class="comp-place-select" data-ci="${i}" data-pi="${pi}" style="width:auto;padding:4px 6px;">
                  <option value="" ${!p.place?'selected':''}>без места</option>
                  <option value="1" ${p.place==='1'?'selected':''}>1 место 🥇</option>
                  <option value="2" ${p.place==='2'?'selected':''}>2 место 🥈</option>
                  <option value="3" ${p.place==='3'?'selected':''}>3 место 🥉</option>
                  <option value="participation" ${p.place==='participation'?'selected':''}>участие</option>
                </select>
                <button class="del comp-part-del" data-ci="${i}" data-pi="${pi}">✕</button>
              </div>
              <div class="comp-fights-toggle" data-fkey="${fkey}" style="cursor:pointer;color:var(--dim);font-size:12px;margin-top:4px;">
                🥋 Схватки${fights.length?` (${wins}/${fights.length} побед)`:''} ${openFightsKey===fkey?'▲':'▼'}
              </div>
              <div class="comp-fights-block" data-fslot="${fkey}" style="${openFightsKey===fkey?'':'display:none;'}margin-top:6px;padding:8px;background:var(--surface-2,var(--line));border-radius:8px;">
                ${fights.length ? fights.map((f,fi)=>`
                  <div style="display:flex;align-items:flex-start;gap:6px;padding:4px 0;${fi?'border-top:1px dashed var(--line);':''}">
                    <div style="flex:1;">
                      <div><b>${fightResultLabel[f.result]||f.result}</b>${f.opponent?(' vs '+f.opponent):''}</div>
                      ${f.technique?`<div style="color:var(--dim);">Техника: ${f.technique}</div>`:''}
                      ${f.comment?`<div style="color:var(--dim);">${f.comment}</div>`:''}
                    </div>
                    <button class="del comp-fight-del" data-ci="${i}" data-pi="${pi}" data-fi="${fi}">✕</button>
                  </div>
                `).join('') : '<div class="empty-hint">Схваток пока не добавлено</div>'}
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">
                  <select class="cf-result" data-ci="${i}" data-pi="${pi}" style="width:auto;">
                    <option value="win">Победа</option>
                    <option value="loss">Поражение</option>
                  </select>
                  <input class="cf-opponent" data-ci="${i}" data-pi="${pi}" type="text" placeholder="Соперник" style="width:auto;flex:1;min-width:100px;">
                  <input class="cf-technique" data-ci="${i}" data-pi="${pi}" type="text" placeholder="Техника" style="width:auto;flex:1;min-width:100px;">
                  <input class="cf-comment" data-ci="${i}" data-pi="${pi}" type="text" placeholder="Комментарий" style="width:100%;">
                  <button class="btn small comp-fight-add" data-ci="${i}" data-pi="${pi}">+ Добавить схватку</button>
                </div>
              </div>
            </div>
          `;}).join('') : '<div class="empty-hint">Участников пока нет</div>'}
          <label style="margin-top:10px;">Добавить участника</label>
          <select class="comp-add-participant" data-ci="${i}">
            <option value="">Выбрать спортсмена...</option>
            ${roster.filter(r=>!parts.some(p=>p.name===r.name)).map(r=>`<option value="${r.name.replace(/"/g,'&quot;')}">${r.name}</option>`).join('')}
          </select>
        </div>
      </div>`;
    }).join('');

    el.querySelectorAll('.comp-title').forEach(t=>{
      t.addEventListener('click', ()=>{
        const i = Number(t.dataset.i);
        openCompIndex = openCompIndex===i ? null : i;
        renderCompetitions();
      });
    });
    el.querySelectorAll('.comp-add-participant').forEach(sel=>{
      sel.addEventListener('change', async ()=>{
        const ci = Number(sel.dataset.ci);
        const name = sel.value;
        if(!name) return;
        const list = await getCompetitions();
        list[ci].participants = list[ci].participants || [];
        list[ci].participants.push({name, place:''});
        await setCompetitions(list);
        openCompIndex = ci;
        renderCompetitions();
      });
    });
    el.querySelectorAll('.comp-part-del').forEach(b=>{
      b.addEventListener('click', async ()=>{
        const ci = Number(b.dataset.ci), pi = Number(b.dataset.pi);
        const list = await getCompetitions();
        list[ci].participants.splice(pi,1);
        await setCompetitions(list);
        openCompIndex = ci;
        renderCompetitions();
      });
    });
    el.querySelectorAll('.comp-fights-toggle').forEach(t=>{
      t.addEventListener('click', ()=>{
        const key = t.dataset.fkey;
        openFightsKey = openFightsKey===key ? null : key;
        renderCompetitions();
      });
    });
    el.querySelectorAll('.comp-fight-add').forEach(b=>{
      b.addEventListener('click', async ()=>{
        const ci = Number(b.dataset.ci), pi = Number(b.dataset.pi);
        const wrap = el.querySelector(`.comp-fights-block[data-fslot="${ci}-${pi}"]`);
        const result = wrap.querySelector('.cf-result').value;
        const opponent = wrap.querySelector('.cf-opponent').value.trim();
        const technique = wrap.querySelector('.cf-technique').value.trim();
        const comment = wrap.querySelector('.cf-comment').value.trim();
        const list = await getCompetitions();
        const participant = list[ci].participants[pi];
        participant.fights = participant.fights || [];
        participant.fights.push({id: uid(), result, opponent, technique, comment});
        await setCompetitions(list);
        openCompIndex = ci;
        openFightsKey = `${ci}-${pi}`;
        renderCompetitions();
      });
    });
    el.querySelectorAll('.comp-fight-del').forEach(b=>{
      b.addEventListener('click', async ()=>{
        const ci = Number(b.dataset.ci), pi = Number(b.dataset.pi), fi = Number(b.dataset.fi);
        const list = await getCompetitions();
        list[ci].participants[pi].fights.splice(fi,1);
        await setCompetitions(list);
        openCompIndex = ci;
        openFightsKey = `${ci}-${pi}`;
        renderCompetitions();
      });
    });
    el.querySelectorAll('.comp-place-select').forEach(sel=>{
      sel.addEventListener('change', async ()=>{
        const ci = Number(sel.dataset.ci), pi = Number(sel.dataset.pi);
        const list = await getCompetitions();
        const comp = list[ci];
        const participant = comp.participants[pi];
        participant.place = sel.value;
        await setCompetitions(list);
        if(sel.value==='1' || sel.value==='2' || sel.value==='3'){
          const rosterList = await getRoster();
          const idx = rosterList.findIndex(r=>r.name===participant.name);
          if(idx>-1){
            const placeText = {1:'1 место', 2:'2 место', 3:'3 место'}[sel.value];
            const entry = `${comp.date?new Date(comp.date).toLocaleDateString('ru-RU')+' — ':''}${comp.name}: ${placeText} ${medalIcon[sel.value]}`;
            rosterList[idx].achievements = (rosterList[idx].achievements ? rosterList[idx].achievements+'\n' : '') + entry;
            await setRoster(rosterList);
          }
        }
        openCompIndex = ci;
        renderCompetitions();
      });
    });
  }

  document.getElementById('comp-add').addEventListener('click', async ()=>{
    const name = document.getElementById('comp-new-name').value.trim();
    if(!name) return;
    const date = document.getElementById('comp-new-date').value;
    const place = document.getElementById('comp-new-place').value;
    const ageCategory = document.getElementById('comp-new-age').value;
    const list = await getCompetitions();
    list.push({id:uid(), name, date, place, ageCategory, participants:[]});
    await setCompetitions(list);
    document.getElementById('comp-new-name').value='';
    document.getElementById('comp-new-date').value='';
    document.getElementById('comp-new-place').value='';
    document.getElementById('comp-new-age').value='';
    renderCompetitions();
  });

