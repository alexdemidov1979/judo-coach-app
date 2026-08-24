// ================= ДИНАМИЧЕСКИЕ ГРУППЫ =================
// Группы НЕ создаются по умолчанию. Они появляются из реальных данных
// спортсменов (в первую очередь из столбца «Группа» в Excel).

const LEGACY_DEFAULT_GROUP_NAMES = new Set([
  '5–6 лет','6–7 лет','7–9 лет','9–12 лет','12–16 лет','Самбо 9–12','Взрослые 35+'
]);

async function getGroups(){
  try{
    const res = await S.get('groups');
    if(res && res.value){
      const list = JSON.parse(res.value);
      if(Array.isArray(list)) return list.filter(g => String(g?.name||'').trim());
    }
  }catch(e){ console.warn('getGroups failed', e); }
  // ВАЖНО: никаких групп по умолчанию.
  return [];
}

async function saveGroups(list){
  const clean = [];
  const seen = new Set();
  for(const g of (Array.isArray(list)?list:[])){
    const name = String(g?.name||'').trim();
    if(!name) continue;
    const key = name.toLocaleLowerCase('ru-RU');
    if(seen.has(key)) continue;
    seen.add(key);
    clean.push({name, ...(Number.isFinite(Number(g.ageMin)) ? {ageMin:Number(g.ageMin)} : {}), ...(Number.isFinite(Number(g.ageMax)) ? {ageMax:Number(g.ageMax)} : {})});
  }
  await S.set('groups', JSON.stringify(clean));
  return clean;
}

function uniqueGroupNames(values){
  const out=[]; const seen=new Set();
  for(const value of (values||[])){
    const name=String(value||'').trim();
    if(!name) continue;
    const key=name.toLocaleLowerCase('ru-RU');
    if(seen.has(key)) continue;
    seen.add(key); out.push(name);
  }
  return out;
}

async function syncGroupsFromRoster(roster){
  const list = Array.isArray(roster) ? roster : [];
  const current = await getGroups();
  const names = uniqueGroupNames([
    ...current.map(g=>g.name),
    ...list.map(r=>r.trainingGroup)
  ]);
  const currentByName = new Map(current.map(g=>[String(g.name).toLocaleLowerCase('ru-RU'),g]));
  const next = names.map(name => currentByName.get(name.toLocaleLowerCase('ru-RU')) || {name});
  return saveGroups(next);
}

async function ensureGroupsFromRoster(roster){
  const current = await getGroups();
  if(current.length) return current;
  return syncGroupsFromRoster(roster);
}

async function addGroups(names){
  const current=await getGroups();
  const existing=new Set(current.map(g=>String(g.name).toLocaleLowerCase('ru-RU')));
  const next=[...current];
  for(const name of uniqueGroupNames(names)){
    const key=name.toLocaleLowerCase('ru-RU');
    if(!existing.has(key)){ next.push({name}); existing.add(key); }
  }
  return saveGroups(next);
}

// Оставляем старую группу только если она реально используется спортсменом.
// Это позволяет обновить старые версии приложения без потери данных.
async function cleanupLegacyDefaultGroups(roster){
  const list=Array.isArray(roster)?roster:[];
  const used=new Set(list.map(r=>String(r.trainingGroup||'').trim().toLocaleLowerCase('ru-RU')));
  const current=await getGroups();
  const next=current.filter(g=>{
    const n=String(g.name||'').trim();
    return !LEGACY_DEFAULT_GROUP_NAMES.has(n) || used.has(n.toLocaleLowerCase('ru-RU'));
  });
  return saveGroups(next);
}

// Старую функцию оставляем для совместимости со старым кодом, но возраст
// больше НЕ определяет группу автоматически.
function matchGroupByAge(){ return ''; }

async function groupOptionsHtml(selectedValue){
  const groups = await getGroups();
  return groupOptionsHtmlSync(groups, selectedValue);
}

function groupOptionsHtmlSync(groups, selectedValue){
  const sel = String(selectedValue||'');
  let html = `<option value="">— без группы —</option>`;
  html += (groups||[]).map(g => {
    const v = String(g.name||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
    const isSel = sel === g.name ? 'selected' : '';
    return `<option value="${v}" ${isSel}>${v}</option>`;
  }).join('');
  if(sel && !(groups||[]).some(g => g.name === sel)){
    const safe=sel.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
    html += `<option value="${safe}" selected>${safe}</option>`;
  }
  return html;
}

async function renderGroupsManager(){
  const box = document.getElementById('groups-manager');
  if(!box) return;
  const groups = await getGroups();
  const wasOpen = box.dataset.open === '1';
  box.innerHTML = `
    <div id="groups-toggle" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;">
      <b>Группы (${groups.length})</b><span id="groups-chev">${wasOpen ? '▴' : '▾'}</span>
    </div>
    <div id="groups-body" style="display:${wasOpen ? 'block' : 'none'};margin-top:10px;">
      <div style="font-size:12px;color:var(--dim);margin-bottom:8px;">
        Группы создаются автоматически из столбца «Группа» при импорте Excel. Здесь можно переименовать или удалить группу.
      </div>
      ${groups.length ? groups.map((g,i)=>`
        <div class="group-row" style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
          <input type="text" class="g-name" data-i="${i}" value="${String(g.name||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" style="flex:1;min-width:0;" placeholder="Название группы">
          <button class="btn ghost small g-del" data-i="${i}" type="button" title="Удалить группу">✕</button>
        </div>`).join('') : '<div class="empty-hint">Групп пока нет. Импортируйте Excel со столбцом «Группа».</div>'}
      <button class="btn small" id="group-add" type="button">+ Добавить группу вручную</button>
    </div>`;

  document.getElementById('groups-toggle').addEventListener('click',()=>{
    const body=document.getElementById('groups-body'), chev=document.getElementById('groups-chev');
    const open=body.style.display!=='none'; body.style.display=open?'none':'block'; chev.textContent=open?'▾':'▴'; box.dataset.open=open?'0':'1';
  });
  async function persistRow(i){
    const cur=await getGroups(), inp=box.querySelector(`.g-name[data-i="${i}"]`);
    if(!inp || !cur[i]) return;
    const old=String(cur[i].name||'').trim(), name=String(inp.value||'').trim();
    if(!name) return;
    cur[i].name=name; await saveGroups(cur);
    // Переносим спортсменов вместе с переименованием группы.
    try{
      const res=await S.get('roster'); const roster=res?JSON.parse(res.value):[];
      if(Array.isArray(roster) && old && old!==name){ roster.forEach(r=>{if(String(r.trainingGroup||'').trim()===old) r.trainingGroup=name;}); await S.set('roster',JSON.stringify(roster)); }
      await renderRoster();
    }catch(e){ console.warn(e); }
  }
  box.querySelectorAll('.g-name').forEach(inp=>inp.addEventListener('change',()=>persistRow(Number(inp.dataset.i))));
  box.querySelectorAll('.g-del').forEach(b=>b.addEventListener('click',async()=>{
    const i=Number(b.dataset.i), cur=await getGroups(); if(!cur[i]) return;
    const name=cur[i].name;
    if(!confirm(`Удалить группу «${name}»? Ученики останутся в программе без группы.`)) return;
    const res=await S.get('roster').catch(()=>null); const roster=res?JSON.parse(res.value):[];
    if(Array.isArray(roster)) roster.forEach(r=>{if(String(r.trainingGroup||'').trim()===name) r.trainingGroup='';});
    await saveGroups(cur.filter((_,idx)=>idx!==i)); await S.set('roster',JSON.stringify(roster));
    await renderGroupsManager(); try{await renderRoster();}catch(e){}
  }));
  document.getElementById('group-add')?.addEventListener('click',async()=>{
    const name=prompt('Название новой группы:',''); if(!name?.trim()) return;
    await addGroups([name.trim()]); box.dataset.open='1'; await renderGroupsManager();
  });
}

window.getGroups=getGroups; window.saveGroups=saveGroups; window.matchGroupByAge=matchGroupByAge;
window.groupOptionsHtml=groupOptionsHtml; window.groupOptionsHtmlSync=groupOptionsHtmlSync;
window.renderGroupsManager=renderGroupsManager; window.addGroups=addGroups;
window.syncGroupsFromRoster=syncGroupsFromRoster; window.ensureGroupsFromRoster=ensureGroupsFromRoster;
window.cleanupLegacyDefaultGroups=cleanupLegacyDefaultGroups;
