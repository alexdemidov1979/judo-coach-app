// ================= ГРУППЫ ПО ВОЗРАСТУ =================
// Хранятся в общем локальном хранилище (S.get/S.set), как и остальные данные,
// поэтому автоматически попадают в бэкап/синхронизацию Firebase — отдельного
// кода для облака здесь не нужно.

const DEFAULT_GROUPS = [
  { name: '5–6 лет',        ageMin: 5,  ageMax: 6   },
  { name: '6–7 лет',        ageMin: 6,  ageMax: 7   },
  { name: '7–9 лет',        ageMin: 7,  ageMax: 9   },
  { name: '9–12 лет',       ageMin: 9,  ageMax: 12  },
  { name: '12–16 лет',      ageMin: 12, ageMax: 16  },
  { name: 'Самбо 9–12',     ageMin: 9,  ageMax: 12  },
  { name: 'Взрослые 35+',   ageMin: 35, ageMax: 120 }
];

async function getGroups(){
  try{
    const res = await S.get('groups');
    if(res && res.value){
      const list = JSON.parse(res.value);
      if(Array.isArray(list) && list.length) return list;
    }
  }catch(e){}
  // Первый запуск — заполняем группы по умолчанию, дальше их можно
  // редактировать/удалять/добавлять через интерфейс.
  await saveGroups(DEFAULT_GROUPS);
  return DEFAULT_GROUPS;
}

async function saveGroups(list){
  await S.set('groups', JSON.stringify(list));
}

// Возвращает название группы, которой соответствует данный возраст
// (первое совпадение по диапазону). Если совпадений нет — пустая строка.
function matchGroupByAge(groups, age){
  if(age===null || age===undefined || isNaN(age)) return '';
  const found = (groups||[]).find(g => age >= Number(g.ageMin) && age <= Number(g.ageMax));
  return found ? found.name : '';
}

async function groupOptionsHtml(selectedValue){
  const groups = await getGroups();
  return groupOptionsHtmlSync(groups, selectedValue);
}

// Синхронный вариант — чтобы не делать S.get на каждую строку списка,
// когда группы уже загружены один раз перед рендером всего списка.
function groupOptionsHtmlSync(groups, selectedValue){
  const sel = String(selectedValue||'');
  let html = `<option value="">— выберите группу —</option>`;
  html += (groups||[]).map(g => {
    const v = (g.name||'').replace(/"/g,'&quot;');
    const isSel = sel === g.name ? 'selected' : '';
    return `<option value="${v}" ${isSel}>${v} (${g.ageMin}–${g.ageMax} лет)</option>`;
  }).join('');
  // Если у тренировки/спортсмена уже стоит текст, которого нет среди групп
  // (старые данные, миграция, ручной ввод) — не теряем его молча.
  if(sel && !(groups||[]).some(g => g.name === sel)){
    html += `<option value="${sel.replace(/"/g,'&quot;')}" selected>${sel} (не в списке групп)</option>`;
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
      <b>⚙️ Группы по возрасту (${groups.length})</b>
      <span id="groups-chev">${wasOpen ? '▴' : '▾'}</span>
    </div>
    <div id="groups-body" style="display:${wasOpen ? 'block' : 'none'};margin-top:10px;">
      <div style="font-size:12px;color:var(--dim);margin-bottom:8px;">
        Возраст спортсмена подставляется в группу автоматически по дате рождения.
        Здесь можно поменять названия и возрастные границы или добавить свою группу.
      </div>
      ${groups.map((g,i)=>`
        <div class="group-row" style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
          <input type="text" class="g-name" data-i="${i}" value="${(g.name||'').replace(/"/g,'&quot;')}" style="flex:2;min-width:0;" placeholder="Название группы">
          <input type="number" class="g-min" data-i="${i}" value="${g.ageMin}" style="width:56px;" placeholder="от">
          <span style="color:var(--dim);">–</span>
          <input type="number" class="g-max" data-i="${i}" value="${g.ageMax}" style="width:56px;" placeholder="до">
          <button class="btn ghost small g-del" data-i="${i}" type="button" title="Удалить группу">✕</button>
        </div>
      `).join('')}
      <button class="btn small" id="group-add" type="button">+ Добавить группу</button>
    </div>
  `;

  document.getElementById('groups-toggle').addEventListener('click', ()=>{
    const body = document.getElementById('groups-body');
    const chev = document.getElementById('groups-chev');
    const open = body.style.display !== 'none';
    body.style.display = open ? 'none' : 'block';
    chev.textContent = open ? '▾' : '▴';
    box.dataset.open = open ? '0' : '1';
  });

  async function persistRow(i){
    const cur = await getGroups();
    const nameInp = box.querySelector(`.g-name[data-i="${i}"]`);
    const minInp = box.querySelector(`.g-min[data-i="${i}"]`);
    const maxInp = box.querySelector(`.g-max[data-i="${i}"]`);
    if(!nameInp || !cur[i]) return;
    cur[i].name = nameInp.value;
    cur[i].ageMin = Number(minInp.value) || 0;
    cur[i].ageMax = Number(maxInp.value) || 0;
    await saveGroups(cur);
    try{ await renderRoster(); }catch(e){}
  }
  box.querySelectorAll('.g-name,.g-min,.g-max').forEach(inp=>{
    inp.addEventListener('change', ()=> persistRow(Number(inp.dataset.i)));
  });
  box.querySelectorAll('.g-del').forEach(b=>{
    b.addEventListener('click', async ()=>{
      const i = Number(b.dataset.i);
      const cur = await getGroups();
      cur.splice(i,1);
      await saveGroups(cur);
      await renderGroupsManager();
      try{ await renderRoster(); }catch(e){}
    });
  });
  const addBtn = document.getElementById('group-add');
  if(addBtn){
    addBtn.addEventListener('click', async ()=>{
      const cur = await getGroups();
      cur.push({ name: 'Новая группа', ageMin: 0, ageMax: 99 });
      await saveGroups(cur);
      box.dataset.open = '1';
      await renderGroupsManager();
    });
  }
}

window.getGroups = getGroups;
window.saveGroups = saveGroups;
window.matchGroupByAge = matchGroupByAge;
window.groupOptionsHtml = groupOptionsHtml;
window.groupOptionsHtmlSync = groupOptionsHtmlSync;
window.renderGroupsManager = renderGroupsManager;
