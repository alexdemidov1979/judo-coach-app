  // ================= СФП-АТТЕСТАЦИЯ =================
  // Хранит результаты тестов (отжимания, пресс, броски за 30с/60с) по датам,
  // чтобы можно было сравнивать прогресс каждого ученика со временем.
  const OFP_METRICS = [
    { key: 'pullups', label: 'Подтягивания', unit: 'раз' },
    { key: 'pushups', label: 'Отжимания', unit: 'раз' },
    { key: 'legRaises', label: 'Подъём ног в висе', unit: 'раз' },
    { key: 'ropeClimb', label: 'Лазание по канату', unit: 'м' },
    { key: 'judoPull20', label: 'Подтягивания за 20 сек', unit: 'раз' },
    { key: 'situps', label: 'Подъём туловища за 30 сек', unit: 'раз' },
    { key: 'throws30', label: 'Броски за 30 сек', unit: 'бросков' },
    { key: 'throws60', label: 'Броски за минуту', unit: 'бросков' },
    { key: 'shuttle', label: 'Челночный бег 3×10 м', unit: 'сек' },
    { key: 'longJump', label: 'Прыжок в длину с места', unit: 'см' }
  ];
  async function getOfpAttestations(){
    try{
      const r = await S.get('sfp-attestations');
      if(r) return JSON.parse(r.value);
      // Однократная миграция старых результатов ОФП в раздел СФП.
      const old = await S.get('ofp-attestations');
      if(old){
        const migrated = JSON.parse(old.value || '[]');
        if(migrated.length) await S.set('sfp-attestations', JSON.stringify(migrated));
        return migrated;
      }
      return [];
    }catch(e){ return []; }
  }
  async function setOfpAttestations(list){ await S.set('sfp-attestations', JSON.stringify(list)); }

  function todayIso(){ return new Date().toISOString().slice(0,10); }

  function sfpRenderNewForm(roster){
    const holder = document.getElementById('sfp-new-form');
    if(!holder) return;
    if(!roster.length){
      holder.innerHTML = '<div class="empty-hint">Сначала добавьте учеников на вкладке «Спортсмены».</div>';
      return;
    }
    holder.innerHTML = roster.map((r,i)=>`
      <div class="lib-item" style="padding:10px 12px;">
        <div class="title" style="margin-bottom:6px;"><span>${r.name}</span></div>
        <div class="row3" style="grid-template-columns:repeat(4,1fr);gap:6px;">
          ${OFP_METRICS.map(m=>`
            <div>
              <label style="font-size:11px;">${m.label}</label>
              <input type="number" min="0" class="sfp-metric-input" data-ri="${i}" data-metric="${m.key}" placeholder="0">
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  async function renderSfp(){
    const roster = await getRoster();
    const dateInput = document.getElementById('sfp-new-date');
    if(dateInput && !dateInput.value) dateInput.value = todayIso();

    sfpRenderNewForm(roster);

    // ---- селект для прогресса ученика ----
    const sel = document.getElementById('sfp-progress-select');
    if(sel){
      const prevVal = sel.value;
      sel.innerHTML = '<option value="">Выбрать ученика...</option>' +
        roster.map(r=>`<option value="${r.name.replace(/"/g,'&quot;')}">${r.name}</option>`).join('');
      if(prevVal) sel.value = prevVal;
      sel.onchange = ()=> sfpRenderProgress(sel.value);
      sfpRenderProgress(sel.value);
    }

    // ---- история аттестаций ----
    const attestations = await getOfpAttestations();
    attestations.sort((a,b)=> (b.date||'').localeCompare(a.date||''));
    const histEl = document.getElementById('sfp-history-list');
    if(histEl){
      if(!attestations.length){
        histEl.innerHTML = '<div class="empty-hint">Аттестаций СФП пока нет — добавьте первую выше.</div>';
      } else {
        histEl.innerHTML = attestations.map((a,ai)=>`
          <div class="lib-item sfp-hist-item">
            <div class="title sfp-hist-title" data-ai="${ai}" style="cursor:pointer;">
              <span>${a.date ? new Date(a.date).toLocaleDateString('ru-RU') : 'без даты'}</span>
              <span style="color:var(--dim);font-weight:400;">участников: ${(a.results||[]).length}</span>
            </div>
            <div class="sfp-hist-detail" data-hslot="${ai}" style="display:none;">
              ${(a.results||[]).map(res=>`
                <div style="padding:6px 0;border-bottom:1px dashed var(--line);font-size:13px;">
                  <b>${res.name}</b>
                  <div style="color:var(--dim);">
                    ${OFP_METRICS.map(m=> `${m.label}: ${res[m.key] ?? '—'}`).join(' · ')}
                  </div>
                </div>
              `).join('') || '<div class="empty-hint">Нет результатов</div>'}
              <div class="actions" style="margin-top:8px;">
                <button class="del sfp-hist-del" data-ai="${ai}">Удалить аттестацию</button>
              </div>
            </div>
          </div>
        `).join('');
        histEl.querySelectorAll('.sfp-hist-title').forEach(t=>{
          t.addEventListener('click', ()=>{
            const detail = histEl.querySelector(`.sfp-hist-detail[data-hslot="${t.dataset.ai}"]`);
            if(detail) detail.style.display = detail.style.display==='none' ? 'block' : 'none';
          });
        });
        histEl.querySelectorAll('.sfp-hist-del').forEach(b=>{
          b.addEventListener('click', async ()=>{
            if(!confirm('Удалить эту аттестацию СФП? Данные нельзя будет восстановить.')) return;
            const list = await getOfpAttestations();
            list.sort((a,b2)=> (b2.date||'').localeCompare(a.date||''));
            list.splice(Number(b.dataset.ai), 1);
            await setOfpAttestations(list);
            renderSfp();
          });
        });
      }
    }
  }

  async function sfpRenderProgress(name){
    const el = document.getElementById('sfp-progress-view');
    if(!el) return;
    if(!name){ el.innerHTML = ''; return; }
    const attestations = await getOfpAttestations();
    const rows = attestations
      .filter(a=> (a.results||[]).some(r=>r.name===name))
      .map(a=> ({ date: a.date, res: (a.results||[]).find(r=>r.name===name) }))
      .sort((a,b)=> (a.date||'').localeCompare(b.date||''));
    if(!rows.length){ el.innerHTML = '<div class="empty-hint">Пока нет результатов по этому ученику.</div>'; return; }
    el.innerHTML = rows.map((row, i)=>{
      const prev = i>0 ? rows[i-1].res : null;
      return `
        <div class="lib-item" style="padding:8px 12px;margin-bottom:6px;">
          <div class="desc" style="color:var(--dim);margin-bottom:4px;">${row.date ? new Date(row.date).toLocaleDateString('ru-RU') : ''}</div>
          <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:13px;">
            ${OFP_METRICS.map(m=>{
              const val = row.res[m.key];
              if(val===undefined || val===null || val==='') return '';
              let arrow = '';
              if(prev && prev[m.key]!==undefined && prev[m.key]!==null && prev[m.key]!==''){
                const diff = Number(val) - Number(prev[m.key]);
                if(diff>0) arrow = ` <span style="color:var(--ok);">▲${diff}</span>`;
                else if(diff<0) arrow = ` <span style="color:var(--belt-red);">▼${Math.abs(diff)}</span>`;
                else arrow = ' <span style="color:var(--dim);">=</span>';
              }
              return `<span>${m.label}: <b>${val}</b>${arrow}</span>`;
            }).join('')}
          </div>
        </div>`;
    }).join('');
  }

  document.getElementById('sfp-save')?.addEventListener('click', async ()=>{
    const roster = await getRoster();
    const date = document.getElementById('sfp-new-date')?.value || todayIso();
    const inputs = document.querySelectorAll('.sfp-metric-input');
    const byIndex = {};
    inputs.forEach(inp=>{
      const ri = Number(inp.dataset.ri);
      const val = inp.value.trim();
      if(val==='') return;
      byIndex[ri] = byIndex[ri] || {};
      byIndex[ri][inp.dataset.metric] = Number(val);
    });
    const results = Object.keys(byIndex).map(ri=> ({ name: roster[Number(ri)].name, ...byIndex[ri] }));
    if(!results.length){ alert('Заполните хотя бы один результат.'); return; }
    const list = await getOfpAttestations();
    list.push({ date, results });
    await setOfpAttestations(list);
    alert('Аттестация СФП сохранена.');
    document.querySelectorAll('.sfp-metric-input').forEach(inp=> inp.value='');
    renderSfp();
  });
