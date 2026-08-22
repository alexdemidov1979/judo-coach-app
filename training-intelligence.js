/* Judo Coach 4.0 — Phase 8: Training Tasks
 * Converts repeated fight-review findings into concrete training tasks.
 * Offline-first. Без внешнего сервера и ИИ.
 */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid=()=> 'task_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
  const now=()=>new Date().toISOString();
  const issueLabel={technical:'Техническая',tactical:'Тактическая',grip:'Kumi-kata',timing:'Тайминг',balance:'Баланс',continuation:'Продолжение атаки','ne-waza':'Ne-waza',positive:'Положительный момент'};

  async function getTasks(){
    try{const r=await S.get('training_tasks');return r?.value?JSON.parse(r.value):[];}catch(e){return []}
  }
  async function saveTasks(tasks){await S.set('training_tasks',JSON.stringify(tasks));return tasks;}

  function buildTask(analysis){
    const topIssue=analysis?.summary?.issues?.[0]?.[0]||'';
    const topTech=analysis?.summary?.techniques?.[0]?.[0]||'';
    const count=Number(analysis?.summary?.issues?.[0]?.[1]||0);
    let objective=''; let drill=''; let constraint='';
    if(topIssue==='continuation'){
      objective='Продолжать атаку после первой защиты соперника.';
      drill='O-soto-gari → реакция партнёра → O-uchi-gari / Uchi-mata → завершение в Ne-waza.';
      constraint='После первой защиты нельзя остановить атаку: обязательна вторая атака или переход в Ne-waza.';
    }else if(topIssue==='kuzushi'||topIssue==='balance'){
      objective='Улучшить Kuzushi и контроль баланса в движении.';
      drill='Короткие серии входов 3–5 повторений в движении с изменением направления.';
      constraint='Оценивать не сам бросок, а качество вывода из равновесия до Kake.';
    }else if(topIssue==='ne-waza'){
      objective='Ускорить переход из завершения броска в Ne-waza.';
      drill='Бросок → мгновенный контроль → удержание / болевой сценарий по возрасту и правилам.';
      constraint='Переход начинается сразу после контакта с татами, без паузы.';
    }else if(topIssue==='grip'){
      objective='Улучшить Kumi-kata и подготовку атаки.';
      drill='Захват → движение → срыв/смена захвата → первая атака.';
      constraint='Не атаковать из статичного неудобного захвата.';
    }else if(topIssue==='tactical'||topIssue==='timing'){
      objective='Улучшить выбор момента и второго темпа атаки.';
      drill='Условный randori: партнёр задаёт 2–3 типа реакции, спортсмен должен выбрать продолжение.';
      constraint='После первой защиты решение принимается в течение одного темпа.';
    }else{
      objective=analysis?.recommendation||'Закрепить выявленную проблему через игровую задачу.';
      drill=topTech?`Серия упражнений вокруг ${topTech} с постепенным переходом к randori.`:'Подводящее упражнение → ситуация → randori.';
      constraint='Фокусироваться на качестве выполнения, а не на количестве повторений.';
    }
    return {
      id:uid(), athleteId:analysis?.athlete?.id||analysis?.profile?.id||'',
      athleteName:analysis?.athlete?.name||'', source:'fight-intelligence',
      sourceMarks:Number(analysis?.summary?.count||0), sourceIssue:topIssue,
      sourceTechnique:topTech, repeatedCount:count, objective, drill, constraint,
      status:'planned', createdAt:now(), updatedAt:now()
    };
  }

  async function createFromAthlete(id){
    if(!id || !window.JudoFightIntelligence) return null;
    const analysis=await window.JudoFightIntelligence.analyzeAthlete(id,true);
    if(!analysis || !analysis.summary?.count) return null;
    const task=buildTask(analysis);
    const tasks=await getTasks(); tasks.unshift(task); await saveTasks(tasks); render();
    return task;
  }

  async function addTaskToToday(taskId){
    const tasks=await getTasks(); const task=tasks.find(t=>t.id===taskId); if(!task) return;
    const d=new Date(); const key='plan:'+d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    let sessions=[]; try{const r=await S.get(key);if(r?.value)sessions=JSON.parse(r.value)||[]}catch(e){}
    if(!sessions.length){
      sessions=[{id:'sess_'+Date.now().toString(36),time:'09:00',group:'',duration:60,status:'planned',warmup:'',main:'',cooldown:'',notes:'',attendance:[],open:true}];
    }
    const idx=Math.max(0,sessions.length-1);
    const s=sessions[idx];
    const block=`\n\nТРЕНИРОВОЧНАЯ ЗАДАЧА: ${task.objective}\nУПРАЖНЕНИЕ: ${task.drill}\nУСЛОВИЕ: ${task.constraint}`;
    s.main=(s.main||'').trim()+block;
    s.trainingTaskIds=Array.isArray(s.trainingTaskIds)?s.trainingTaskIds:[];
    if(!s.trainingTaskIds.includes(task.id))s.trainingTaskIds.push(task.id);
    await S.set(key,JSON.stringify(sessions));
    task.status='added-to-training'; task.updatedAt=now(); await saveTasks(tasks);
    render();
    alert('Задача добавлена в сегодняшнюю тренировку.');
  }

  async function markDone(id){const tasks=await getTasks();const t=tasks.find(x=>x.id===id);if(!t)return;t.status='done';t.completedAt=now();t.updatedAt=now();await saveTasks(tasks);render();}
  async function remove(id){const tasks=(await getTasks()).filter(x=>x.id!==id);await saveTasks(tasks);render();}

  async function render(){
    const el=$('training-intelligence-list');if(!el)return;
    const tasks=await getTasks();
    if(!tasks.length){el.innerHTML='<div class="empty-hint">Пока нет тренировочных задач. Создайте задачу из анализа спортсмена после разбора схватки.</div>';return;}
    el.innerHTML=tasks.slice(0,12).map(t=>`
      <div class="card" style="margin:8px 0;padding:12px;">
        <div style="font-weight:800;">🎯 ${esc(t.athleteName||'Спортсмен')} · ${esc(issueLabel[t.sourceIssue]||t.sourceIssue||'Фокус')}</div>
        <div style="font-size:13px;margin-top:5px;"><b>Цель:</b> ${esc(t.objective)}</div>
        <div style="font-size:13px;margin-top:4px;"><b>Упражнение:</b> ${esc(t.drill)}</div>
        <div style="font-size:12px;color:var(--dim);margin-top:4px;"><b>Условие:</b> ${esc(t.constraint)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
          ${t.status!=='done'?`<button class="btn gold small" data-ti-add="${esc(t.id)}">➕ В тренировку сегодня</button><button class="btn secondary small" data-ti-done="${esc(t.id)}">✓ Выполнено</button>`:''}
          <button class="btn ghost small" data-ti-remove="${esc(t.id)}">Удалить</button>
        </div>
      </div>`).join('');
    el.querySelectorAll('[data-ti-add]').forEach(b=>b.addEventListener('click',()=>addTaskToToday(b.dataset.tiAdd)));
    el.querySelectorAll('[data-ti-done]').forEach(b=>b.addEventListener('click',()=>markDone(b.dataset.tiDone)));
    el.querySelectorAll('[data-ti-remove]').forEach(b=>b.addEventListener('click',()=>remove(b.dataset.tiRemove)));
  }

  document.addEventListener('DOMContentLoaded',()=>{
    const btn=$('vm-training-task');
    btn?.addEventListener('click',async()=>{
      const id=$('vm-feedback-athlete')?.value||'';
      if(!id){alert('Сначала выберите спортсмена.');return;}
      btn.disabled=true;btn.textContent='⏳ Создание…';
      try{const task=await createFromAthlete(id);alert(task?'Тренировочная задача создана. Она появилась в разделе «Тренировочные задачи».':'Недостаточно размеченных эпизодов для задачи.');}
      catch(e){alert('Не удалось создать задачу: '+(e?.message||e));}
      finally{btn.disabled=false;btn.textContent='🎯 Создать тренировочную задачу';}
    });
    render();
  });
  window.JudoTrainingTasks={getTasks,saveTasks,createFromAthlete,addTaskToToday,render};
  window.JudoTrainingIntelligence=window.JudoTrainingTasks;
  window.addEventListener('judo:pro-status', render);
})();
