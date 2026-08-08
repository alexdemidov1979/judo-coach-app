  // ================= ROSTER =================
  async function setRoster(list){ await S.set('roster', JSON.stringify(list)); }

  let editingIndex = null;
  const kyuOptions = ['Без пояса','6 кю (белый)','5 кю (жёлтый)','4 кю (оранжевый)','3 кю (зелёный)','2 кю (синий)','1 кю (коричневый)','1 дан (чёрный)','2 дан (чёрный)'];

  function ageFromBirth(dateStr){
    if(!dateStr) return null;
    const b = new Date(dateStr);
    if(isNaN(b)) return null;
    const now = new Date();
    let age = now.getFullYear()-b.getFullYear();
    if(now.getMonth()<b.getMonth() || (now.getMonth()===b.getMonth() && now.getDate()<b.getDate())) age--;
    return age;
  }
  function certBadge(dateStr){
    if(!dateStr) return '<span class="warn">нет справки</span>';
    const d = new Date(dateStr);
    if(isNaN(d)) return `<span class="warn">${escapeHtml(String(dateStr))}</span>`;
    const days = Math.round((d-new Date())/86400000);
    if(days<0) return '<span class="bad">справка просрочена</span>';
    if(days<=30) return `<span class="warn">справка до ${d.toLocaleDateString('ru-RU')} (${days} дн.)</span>`;
    return `справка до ${d.toLocaleDateString('ru-RU')}`;
  }
  // Компактный цветной значок для строки ученика — красный (просрочено/нет), жёлтый (<30 дней), без значка если всё в порядке
  function certPill(dateStr){
    if(!dateStr) return '<span class="cert-pill cert-pill-bad" title="Нет мед.справки">⚠ справки нет</span>';
    const d = new Date(dateStr);
    if(isNaN(d)) return '';
    const days = Math.round((d-new Date())/86400000);
    if(days<0) return `<span class="cert-pill cert-pill-bad" title="Просрочена ${d.toLocaleDateString('ru-RU')}">⚠ просрочена</span>`;
    if(days<=30) return `<span class="cert-pill cert-pill-warn" title="До ${d.toLocaleDateString('ru-RU')}">⏳ ${days} дн.</span>`;
    return '';
  }

  function subPill(dateStr){
    if(!dateStr) return '';
    const d = new Date(dateStr);
    const days = Math.round((d-new Date())/86400000);
    if(days<0) return `<span class="cert-pill cert-pill-bad" title="Абонемент закончился ${d.toLocaleDateString('ru-RU')}">⏰ абонемент истёк</span>`;
    if(days<=7) return `<span class="cert-pill cert-pill-warn" title="До ${d.toLocaleDateString('ru-RU')}">⏰ абонемент на ${days} дн.</span>`;
    return '';
  }
  // Считает количество последних месяцев с явно отмеченной неоплатой (долг)
  function debtMonthsCount(paid){
    if(!paid) return 0;
    return Object.keys(paid).filter(m => paid[m]===false).length;
  }

  function kyuKeyFromLabel(label){
    const m = /^(\d)\s*кю/.exec(label||'');
    return (m && KYU_DATA[m[1]]) ? m[1] : null;
  }
  function techProgressCount(r){
    const key = kyuKeyFromLabel(r.kyu);
    if(!key) return null;
    const items = KYU_DATA[key].groups.flatMap(g=>g.items);
    const done = items.filter(it => (r.techProgress||{})[it.romaji]).length;
    return {done, total: items.length};
  }
  function nextKyuInfo(label){
    const key = kyuKeyFromLabel(label);
    if(!key) return null;
    const order = ['5','4','3','2','1'];
    const idx = order.indexOf(key);
    if(idx===-1) return null;
    if(idx===order.length-1) return {label:'чёрный пояс (1 дан)'};
    return {label: KYU_DATA[order[idx+1]].label};
  }
  function techProgressChecklistHtml(r){
    const key = kyuKeyFromLabel(r.kyu);
    if(!key) return '<div class="empty-hint">Чеклист техник доступен для поясов с 5 по 1 кю.</div>';
    const progress = r.techProgress || {};
    return KYU_DATA[key].groups.map(g=>`
      <div style="font-size:12px;font-weight:600;color:var(--dim);margin:8px 0 4px;">${g.title}</div>
      ${g.items.map(it=>`
        <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;padding:3px 0;">
          <input type="checkbox" class="e-tech" data-romaji="${it.romaji.replace(/"/g,'&quot;')}" ${progress[it.romaji]?'checked':''}>
          ${it.romaji} <span style="color:var(--dim);">(${it.jp})</span>
        </label>
      `).join('')}
    `).join('');
  }

  async function buildStudentReportHtml(r, att){
    const age = ageFromBirth(r.birthDate);
    const prog = techProgressCount(r);
    const pct = (att && (att.present+att.absent)>0) ? Math.round((att.present/(att.present+att.absent))*100) : null;
    const paidMonths = Object.keys(r.paid||{}).filter(k=>r.paid[k]).sort().reverse().slice(0,6);
    const monthLabel = (k)=>{ const [y,m] = k.split('-'); return `${monthNames[Number(m)-1]||m} ${y}`; };
    return `<!doctype html><html><head><meta charset="utf-8"><title>Отчёт — ${escapeHtml(r.name)}</title>
    <style>
      body{font-family:sans-serif;padding:24px;line-height:1.55;color:#111;}
      h1{font-size:22px;margin-bottom:2px;}
      .sub{color:#666;font-size:13px;margin-bottom:18px;}
      h2{font-size:16px;margin:18px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px;}
      table{border-collapse:collapse;width:100%;}
      td{padding:4px 6px;font-size:14px;}
      td.k{color:#666;width:40%;}
      .big{font-size:32px;font-weight:700;}
      .ok{color:#1a8a3c;} .bad{color:#c0392b;}
      .foot{margin-top:26px;font-size:12px;color:#999;}
    </style></head><body>
      <h1>🥋 Отчёт по ученику: ${escapeHtml(r.name)}</h1>
      <div class="sub">Сформировано ${new Date().toLocaleDateString('ru-RU')}</div>
      <h2>Общие сведения</h2>
      <table>
        ${age!==null?`<tr><td class="k">Возраст</td><td>${age} лет</td></tr>`:''}
        ${r.weight?`<tr><td class="k">Вес</td><td>${escapeHtml(r.weight)} кг</td></tr>`:''}
        <tr><td class="k">Пояс / кю</td><td>${escapeHtml(r.kyu||'Без пояса')}</td></tr>
        ${r.rank?`<tr><td class="k">Разряд</td><td>${escapeHtml(r.rank)}</td></tr>`:''}
        ${r.trainingGroup?`<tr><td class="k">Группа</td><td>${escapeHtml(r.trainingGroup)}</td></tr>`:''}
      </table>
      <h2>Посещаемость</h2>
      ${pct!==null ? `<div class="big ${pct>=80?'ok':pct<50?'bad':''}">${pct}%</div><div style="font-size:13px;color:#666;">Присутствовал(а): ${att.present}, отсутствовал(а): ${att.absent}</div>` : '<div style="color:#999;">Данных пока нет</div>'}
      <h2>Прогресс по техникам</h2>
      ${prog ? `<div class="big">${prog.done} / ${prog.total}</div>` : '<div style="color:#999;">Чеклист недоступен для этого пояса</div>'}
      <h2>Оплата (последние месяцы)</h2>
      ${paidMonths.length ? `<ul>${paidMonths.map(k=>`<li>${monthLabel(k)} — оплачено ✓</li>`).join('')}</ul>` : '<div style="color:#999;">Нет отметок об оплате</div>'}
      <div class="foot">Judo Coach App — отчёт для родителей</div>
    </body></html>`;
  }

  let _attStatsCache = null, _attStatsCacheTime = 0;
  async function computeAttendanceStats(){
    if(_attStatsCache && (Date.now()-_attStatsCacheTime) < 8000) return _attStatsCache;
    const stats = {}; // name -> {present, absent}
    try{
      const res = await S.list('plan:');
      const keys = (res && res.keys) || [];
      for(const k of keys){
        try{
          const r = await S.get(k);
          if(!r) continue;
          const sessions = JSON.parse(r.value) || [];
          sessions.filter(s=>s.status==='done').forEach(s=>{
            const st = s.attendanceStatus || {};
            const legacy = new Set(s.attendance||[]);
            const names = new Set([...Object.keys(st), ...legacy]);
            names.forEach(name=>{
              const status = st[name] || (legacy.has(name) ? 'present' : null);
              if(status==='present' || status==='absent'){
                stats[name] = stats[name] || {present:0, absent:0};
                stats[name][status]++;
              }
            });
          });
        }catch(e){}
      }
    }catch(e){}
    _attStatsCache = stats;
    _attStatsCacheTime = Date.now();
    return stats;
  }

  async function renderRoster(){
    const list = await getRoster();
    const el = document.getElementById('roster-list');
    const curMonth = monthKey(new Date());
    const attStats = await computeAttendanceStats();
    if(list.length===0){
      el.innerHTML = '<div class="empty-hint">Список пуст. Добавь первого ученика ниже — по одному или сразу списком.</div>';
      return;
    }
    el.innerHTML = list.map((r,i)=>{
      const paid = !!(r.paid && r.paid[curMonth]);
      const age = ageFromBirth(r.birthDate);
      const prog = techProgressCount(r);
      const hist = (r.history||[]).slice().reverse();
      return `
      <div class="roster-row">
        <div class="top" data-i="${i}">
          ${r.photo ? `<img src="${r.photo}" alt="Фото ${r.name}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;margin-right:6px;">` : ''}
          <div class="name">${r.name}</div>
          ${certPill(r.medCert)}
          ${r.rating ? `<span class="rating-badge">★${r.rating}</span>` : ''}
          <div style="font-size:10.5px;color:${paid?'var(--ok)':'var(--belt-red)'}">${paid?'оплачено':'не оплачено'}</div>
          <button class="del" data-share="${i}" style="background:none;border:none;color:var(--dim);font-size:16px;cursor:pointer;">📤</button>
          <button class="del" data-pdf="${i}" title="PDF для родителей" style="background:none;border:none;color:var(--dim);font-size:16px;cursor:pointer;">📄</button>
          <button class="del" data-del="${i}">✕</button>
        </div>
        <div class="meta">
          <span>${age!==null?age+' лет':''}</span>
          <span>${r.height?r.height+' см':''}</span>
          <span>${r.weight?r.weight+' кг':''}</span>
          <span>${r.kyu||'Без пояса'}</span>
          ${r.rank ? `<span>Разряд: ${escapeHtml(r.rank)}</span>` : ''}
          ${r.trainingGroup ? `<span>Группа: ${escapeHtml(r.trainingGroup)}</span>` : ''}
          ${r.playerNumber ? `<span>№${escapeHtml(r.playerNumber)}</span>` : ''}
          <span>${r.parentPhone||''}</span>
          <span>${certBadge(r.medCert)}</span>
          ${prog ? `<span>🥋 ${prog.done}/${prog.total} техник</span>` : ''}
          ${prog && prog.total>0 && prog.done===prog.total ? `<span class="cert-pill" style="background:var(--ok);color:#fff;">🎓 готов${nextKyuInfo(r.kyu)?(' на '+nextKyuInfo(r.kyu).label):''}</span>` : ''}
          ${r.injuries ? `<span style="color:var(--belt-red);">⚠ травмы есть</span>` : ''}
          ${(()=>{ const a = attStats[r.name]; if(!a || (a.present+a.absent)===0) return ''; const pct = Math.round((a.present/(a.present+a.absent))*100); return `<span style="color:${pct>=80?'var(--ok)':pct>=50?'var(--gold)':'var(--belt-red)'};">📊 ${pct}% посещаемость</span>`; })()}
          ${subPill(r.subscriptionEnd)}
          ${debtMonthsCount(r.paid) > 0 ? `<span class="cert-pill cert-pill-bad">💰 долг: ${debtMonthsCount(r.paid)} мес.</span>` : ''}
        </div>
        <div class="edit-box ${editingIndex===i?'open':''}" data-box="${i}">
          <label>Фото</label>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            ${r.photo ? `<img class="e-photo-preview" src="${r.photo}" alt="Фото ${r.name}" style="width:56px;height:56px;border-radius:50%;object-fit:cover;">` : `<div class="e-photo-preview" role="img" aria-label="Фото не загружено" style="width:56px;height:56px;border-radius:50%;background:var(--surface-2,var(--line));"></div>`}
            <input type="file" accept="image/*" class="e-photo-input">
          </div>
          <div class="row3">
            <div><label>Дата рождения</label><input type="date" class="e-birth" value="${r.birthDate||''}"></div>
            <div><label>Рост, см</label><input type="text" inputmode="decimal" class="e-height" value="${r.height||''}"></div>
            <div><label>Вес, кг</label><input type="text" inputmode="decimal" class="e-weight" value="${r.weight||''}"></div>
          </div>
          <div class="row3">
            <div><label>Рейтинг 0–10</label><input type="number" min="0" max="10" class="e-rating" value="${r.rating||''}"></div>
            <div><label>Дата получения пояса</label><input type="date" class="e-beltdate" value="${r.beltDate||''}"></div>
            <div><label>Разряд</label><input type="text" class="e-rank" value="${r.rank||''}" placeholder="напр. 3 юн."></div>
          </div>
          <label>Кю / дан</label>
          <select class="e-kyu">${kyuOptions.map(k=>`<option ${k===r.kyu?'selected':''}>${k}</option>`).join('')}</select>
          <div class="row3">
            <div><label>Номер игрока</label><input type="text" class="e-playernum" value="${r.playerNumber||''}"></div>
            <div><label>Телефон</label><input type="tel" class="e-phone" value="${r.parentPhone||''}" placeholder="+7 900 000-00-00"></div>
            <div><label>Ответственное лицо</label><input type="text" class="e-responsible" value="${r.responsiblePerson||''}" placeholder="ФИО родителя"></div>
          </div>
          <div class="row3">
            <div><label>Свидетельство о рождении</label><input type="text" class="e-birthcert" value="${r.birthCertificate||''}" placeholder="номер / есть / отсутствует"></div>
            <div><label>Мед. справка</label><input type="text" class="e-cert" value="${r.medCert||''}" placeholder="дата или статус"></div>
            <div><label>Группа / тренировки</label><input type="text" class="e-group" value="${r.trainingGroup||''}" placeholder="напр. 9-12 лет"></div>
          </div>
          <div class="paid-toggle">
            <div class="switch ${paid?'on':''}" data-sw="${i}"></div>
            <span style="font-size:13px;">Оплачено за ${monthNames[new Date().getMonth()]}</span>
          </div>

          <div class="row3">
            <div><label>Тип абонемента</label><input type="text" class="e-subtype" value="${r.subscriptionType||''}" placeholder="8 занятий / безлимит"></div>
            <div><label>Абонемент до</label><input type="date" class="e-subend" value="${r.subscriptionEnd||''}"></div>
            <div><label>Сумма, ₽</label><input type="text" inputmode="numeric" class="e-payamount" placeholder="3000"></div>
          </div>
          <div class="actions" style="margin-top:0;margin-bottom:10px;">
            <button class="btn small ghost e-addpayment" data-i="${i}">+ Записать оплату сегодня</button>
          </div>
          ${(r.paymentHistory||[]).length ? `
          <label>История оплат</label>
          <div class="e-history" style="max-height:120px;overflow-y:auto;font-size:12px;color:var(--dim);border:1px solid var(--line);border-radius:8px;padding:6px 8px;margin-bottom:8px;">
            ${(r.paymentHistory||[]).slice().reverse().slice(0,20).map(p=>`<div style="padding:3px 0;border-bottom:1px dashed var(--line);">${p.date} — ${p.amount ? p.amount+' ₽' : 'оплата'}${p.note?(' · '+p.note):''}</div>`).join('')}
          </div>` : ''}

          <label style="margin-top:10px;">Прогресс по техникам текущего пояса</label>
          <div class="e-tech-list">${techProgressChecklistHtml(r)}</div>

          <label style="margin-top:10px;">Любимые техники</label>
          <textarea class="e-favtech" rows="2" placeholder="напр. Seoi-nage, De-ashi-harai">${r.favoriteTechniques||''}</textarea>
          <label>Слабые стороны</label>
          <textarea class="e-weak" rows="2" placeholder="над чем работать">${r.weaknesses||''}</textarea>
          <label>Травмы</label>
          <textarea class="e-injuries" rows="2" placeholder="перенесённые/текущие травмы, ограничения">${r.injuries||''}</textarea>
          <label>Индивидуальные задания</label>
          <textarea class="e-tasks" rows="2" placeholder="что отрабатывать индивидуально">${r.individualTasks||''}</textarea>
          <label>Достижения / соревнования</label>
          <textarea class="e-achieve" rows="2" placeholder="турниры, места, медали">${r.achievements||''}</textarea>
          <label>Заметки тренера</label>
          <textarea class="e-notes" rows="2" placeholder="общие заметки">${r.notes||''}</textarea>

          ${hist.length ? `
          <label style="margin-top:10px;">История изменений</label>
          <div class="e-history" style="max-height:120px;overflow-y:auto;font-size:12px;color:var(--dim);border:1px solid var(--line);border-radius:8px;padding:6px 8px;">
            ${hist.slice(0,15).map(h=>`<div style="padding:3px 0;border-bottom:1px dashed var(--line);">${h.date} — ${h.text}</div>`).join('')}
          </div>` : ''}

          <div class="actions">
            <button class="btn small e-save" data-save="${i}">Сохранить</button>
          </div>
        </div>
      </div>`;
    }).join('');

    el.querySelectorAll('.e-photo-input').forEach(inp=>{
      inp.addEventListener('change', (e)=>{
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (ev)=>{
          const img = new Image();
          img.onload = ()=>{
            const size = 160;
            const canvas = document.createElement('canvas');
            canvas.width = size; canvas.height = size;
            const ctx = canvas.getContext('2d');
            const scale = Math.max(size/img.width, size/img.height);
            const w = img.width*scale, h = img.height*scale;
            ctx.drawImage(img, (size-w)/2, (size-h)/2, w, h);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            const preview = inp.parentElement.querySelector('.e-photo-preview');
            if(preview.tagName==='IMG') preview.src = dataUrl;
            else { const newImg = document.createElement('img'); newImg.src = dataUrl; newImg.className='e-photo-preview'; newImg.style.cssText='width:56px;height:56px;border-radius:50%;object-fit:cover;'; preview.replaceWith(newImg); }
            inp.dataset.newphoto = dataUrl;
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      });
    });

    el.querySelectorAll('.top').forEach(t=>{
      t.addEventListener('click', (ev)=>{
        if(ev.target.classList.contains('del')) return;
        const i = Number(t.dataset.i);
        editingIndex = editingIndex===i ? null : i;
        renderRoster();
      });
    });
    el.querySelectorAll('[data-pdf]').forEach(b=>{
      b.addEventListener('click', async (ev)=>{
        ev.stopPropagation();
        const r = list[Number(b.dataset.pdf)];
        const attStats = await computeAttendanceStats();
        const html = await buildStudentReportHtml(r, attStats[r.name]);
        const w = window.open('', '_blank');
        w.document.write(html);
        w.document.close();
        setTimeout(()=> w.print(), 300);
      });
    });
    el.querySelectorAll('[data-share]').forEach(b=>{
      b.addEventListener('click', async (ev)=>{
        ev.stopPropagation();
        const r = list[Number(b.dataset.share)];
        const age = ageFromBirth(r.birthDate);
        const prog = techProgressCount(r);
        const text = `${r.name}\n` +
          (age!==null ? `Возраст: ${age} лет\n` : '') +
          (r.weight ? `Вес: ${r.weight} кг\n` : '') +
          `Пояс: ${r.kyu||'Без пояса'}\n` +
          (prog ? `Прогресс по техникам: ${prog.done}/${prog.total}\n` : '');
        if(navigator.share){
          try{ await navigator.share({title: r.name, text}); }catch(e){}
        } else {
          const url = `https://t.me/share/url?url=&text=${encodeURIComponent(text)}`;
          window.open(url, '_blank');
        }
      });
    });
    el.querySelectorAll('[data-del]').forEach(b=>{
      b.addEventListener('click', async (ev)=>{
        ev.stopPropagation();
        const list = await getRoster();
        list.splice(Number(b.dataset.del),1);
        await setRoster(list);
        renderRoster();
        renderSessions();
      });
    });
    el.querySelectorAll('[data-sw]').forEach(sw=> sw.addEventListener('click', ()=> sw.classList.toggle('on')));
    el.querySelectorAll('.e-addpayment').forEach(b=>{
      b.addEventListener('click', async ()=>{
        const i = Number(b.dataset.i);
        const box = el.querySelector(`[data-box="${i}"]`);
        const amount = box.querySelector('.e-payamount').value;
        const list = await getRoster();
        list[i].paymentHistory = list[i].paymentHistory || [];
        list[i].paymentHistory.push({date: new Date().toLocaleDateString('ru-RU'), amount});
        list[i].paid = list[i].paid || {};
        list[i].paid[curMonth] = true;
        list[i].history = list[i].history || [];
        list[i].history.push({date: new Date().toLocaleDateString('ru-RU'), text: `оплата${amount?(': '+amount+' ₽'):''}`});
        await setRoster(list);
        editingIndex = i;
        renderRoster();
      });
    });
    el.querySelectorAll('.e-save').forEach(b=>{
      b.addEventListener('click', async ()=>{
        const i = Number(b.dataset.save);
        const box = el.querySelector(`[data-box="${i}"]`);
        const list = await getRoster();
        const before = JSON.parse(JSON.stringify(list[i]));
        const paidOn = box.querySelector('.switch').classList.contains('on');
        list[i].birthDate = box.querySelector('.e-birth').value;
        list[i].height = box.querySelector('.e-height').value;
        list[i].weight = box.querySelector('.e-weight').value;
        list[i].rating = box.querySelector('.e-rating').value;
        list[i].beltDate = box.querySelector('.e-beltdate').value;
        list[i].rank = box.querySelector('.e-rank').value;
        list[i].playerNumber = box.querySelector('.e-playernum').value;
        list[i].responsiblePerson = box.querySelector('.e-responsible').value;
        list[i].birthCertificate = box.querySelector('.e-birthcert').value;
        list[i].trainingGroup = box.querySelector('.e-group').value;
        list[i].subscriptionType = box.querySelector('.e-subtype').value;
        list[i].subscriptionEnd = box.querySelector('.e-subend').value;
        list[i].kyu = box.querySelector('.e-kyu').value;
        list[i].parentPhone = box.querySelector('.e-phone').value;
        list[i].medCert = box.querySelector('.e-cert').value;
        list[i].favoriteTechniques = box.querySelector('.e-favtech').value;
        list[i].weaknesses = box.querySelector('.e-weak').value;
        list[i].injuries = box.querySelector('.e-injuries').value;
        list[i].individualTasks = box.querySelector('.e-tasks').value;
        list[i].achievements = box.querySelector('.e-achieve').value;
        list[i].notes = box.querySelector('.e-notes').value;
        const photoInput = box.querySelector('.e-photo-input');
        if(photoInput && photoInput.dataset.newphoto) list[i].photo = photoInput.dataset.newphoto;
        list[i].paid = list[i].paid || {};
        list[i].paid[curMonth] = paidOn;
        const techProgress = {};
        box.querySelectorAll('.e-tech').forEach(cb=>{ if(cb.checked) techProgress[cb.dataset.romaji] = true; });
        list[i].techProgress = techProgress;

        // авто-история изменений
        const changes = [];
        if(before.kyu !== list[i].kyu) changes.push(`пояс: ${before.kyu||'—'} → ${list[i].kyu}`);
        if(before.weight !== list[i].weight && list[i].weight) changes.push(`вес: ${list[i].weight} кг`);
        if(before.height !== list[i].height && list[i].height) changes.push(`рост: ${list[i].height} см`);
        if((before.injuries||'') !== list[i].injuries && list[i].injuries) changes.push(`травма: ${list[i].injuries.slice(0,40)}`);
        if((before.achievements||'') !== list[i].achievements && list[i].achievements) changes.push(`достижение: ${list[i].achievements.slice(0,40)}`);
        if(before.medCert !== list[i].medCert && list[i].medCert) changes.push(`новая мед.справка до ${list[i].medCert}`);
        if(!before.paid?.[curMonth] && paidOn) changes.push(`оплата за ${monthNames[new Date().getMonth()]}`);
        list[i].history = list[i].history || [];
        if(changes.length){
          list[i].history.push({date: new Date().toLocaleDateString('ru-RU'), text: changes.join('; ')});
        }

        await setRoster(list);
        editingIndex = null;
        renderRoster();
      });
    });
  }

  document.getElementById('add-name').addEventListener('click', async ()=>{
    const nameEl = document.getElementById('new-name');
    const name = nameEl.value.trim();
    if(!name) return;
    const list = await getRoster();
    list.push({name, birthDate:'', weight:'', kyu:'Без пояса', medCert:'', parentPhone:'', rating:'', paid:{}});
    await setRoster(list);
    nameEl.value='';
    renderRoster();
    renderSessions();
  });

  document.getElementById('bulk-add').addEventListener('click', async ()=>{
    const ta = document.getElementById('bulk-names');
    const names = ta.value.split('\n').map(s=>s.trim()).filter(Boolean);
    if(names.length===0) return;
    const list = await getRoster();
    names.forEach(name=> list.push({name, birthDate:'', weight:'', kyu:'Без пояса', medCert:'', parentPhone:'', rating:'', paid:{}}));
    await setRoster(list);
    ta.value='';
    renderRoster();
    renderSessions();
  });

