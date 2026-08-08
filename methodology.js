  // ================= МОЯ МЕТОДИКА =================
  // Личные методические заметки тренера: название, возраст/уровень, свободный текст
  // (упражнение, типичные ошибки, исправления, комбинации, контрприёмы — как удобно).
  async function getMethodology(){
    try{ const r = await S.get('methodology'); return r ? JSON.parse(r.value) : []; }catch(e){ return []; }
  }
  async function setMethodology(list){ await S.set('methodology', JSON.stringify(list)); }

  async function renderMethodology(){
    const list = await getMethodology();
    const el = document.getElementById('meth-list');
    const query = (document.getElementById('meth-search').value || '').trim().toLowerCase();
    const filtered = query
      ? list.filter(m => (m.title||'').toLowerCase().includes(query) || (m.text||'').toLowerCase().includes(query) || (m.ageLevel||'').toLowerCase().includes(query))
      : list;
    if(!list.length){ el.innerHTML = '<div class="empty-hint">Записей пока нет — добавьте первую ниже.</div>'; return; }
    if(!filtered.length){ el.innerHTML = '<div class="empty-hint">Ничего не найдено.</div>'; return; }
    const sorted = filtered.slice().reverse();
    el.innerHTML = sorted.map(m=>{
      const realIndex = list.indexOf(m);
      return `
      <div class="lib-item meth-item">
        <div class="title meth-title" data-i="${realIndex}" style="cursor:pointer;">
          <span>${escapeHtml(m.title)}</span>
          ${m.ageLevel ? `<span style="color:var(--dim);font-weight:400;">${escapeHtml(m.ageLevel)}</span>` : ''}
        </div>
        <div class="meth-detail" data-mslot="${realIndex}" style="${openMethIndex===realIndex?'':'display:none;'}white-space:pre-wrap;font-size:13px;padding-top:6px;">
          ${escapeHtml(m.text||'')}
          <div class="actions" style="margin-top:10px;">
            <button class="del meth-del" data-i="${realIndex}">✕ Удалить</button>
          </div>
        </div>
      </div>`;
    }).join('');

    el.querySelectorAll('.meth-title').forEach(t=>{
      t.addEventListener('click', ()=>{
        const i = Number(t.dataset.i);
        openMethIndex = openMethIndex===i ? null : i;
        renderMethodology();
      });
    });
    el.querySelectorAll('.meth-del').forEach(b=>{
      b.addEventListener('click', async ()=>{
        if(!confirm('Удалить эту запись методики?')) return;
        const i = Number(b.dataset.i);
        const list2 = await getMethodology();
        list2.splice(i,1);
        await setMethodology(list2);
        openMethIndex = null;
        renderMethodology();
      });
    });
  }
  let openMethIndex = null;

  document.getElementById('meth-search').addEventListener('input', ()=> renderMethodology());

  document.getElementById('meth-add').addEventListener('click', async ()=>{
    const title = document.getElementById('meth-new-title').value.trim();
    if(!title){ alert('Введите название записи.'); return; }
    const ageLevel = document.getElementById('meth-new-age').value.trim();
    const text = document.getElementById('meth-new-text').value.trim();
    const list = await getMethodology();
    list.push({id: uid(), title, ageLevel, text, createdAt: new Date().toISOString()});
    await setMethodology(list);
    document.getElementById('meth-new-title').value = '';
    document.getElementById('meth-new-age').value = '';
    document.getElementById('meth-new-text').value = '';
    renderMethodology();
  });
