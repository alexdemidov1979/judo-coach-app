/* Judo Coach 4.0 — Phase 7: Judo Fight Intelligence
 * Turns coach annotations into structured athlete feedback.
 * No AI/network required: deterministic, offline-first.
 */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={
    technical:'Техническая', tactical:'Тактическая', grip:'Kumi-kata',
    timing:'Тайминг', balance:'Баланс', continuation:'Нет продолжения',
    'ne-waza':'Ne-waza', positive:'Положительный момент'
  };
  const phaseLabels={kuzushi:'Kuzushi',tsukuri:'Tsukuri',kake:'Kake',continuation:'Продолжение атаки','ne-waza':'Переход в Ne-waza',grip:'Kumi-kata',tactics:'Тактика',defense:'Защита'};
  const keyForIssue=i=>({technical:'tachiWaza',tactical:'tactics',grip:'tactics',timing:'tactics',balance:'kuzushi',continuation:'tactics','ne-waza':'neWaza'})[i]||null;

  async function allReviews(){
    const out=[];
    try{
      const r=await S.list('video_feedback');
      for(const k of (r?.keys||[])){const x=await S.get(k); if(!x)continue; try{const v=JSON.parse(x.value);if(v?.markers)out.push(v)}catch(e){}}
    }catch(e){}
    return out;
  }
  function markersForAthlete(reviews,id){
    return reviews.flatMap(r=>(r.markers||[]).map(m=>({...m,reviewId:r.id,reviewTitle:r.title||r.url||'Видео'}))).filter(m=>m.athleteId===id);
  }

  function summarize(ms){
    const issues={}, techniques={}, phases={}, actions=[], positives=[];
    ms.forEach(m=>{
      if(m.issue) issues[m.issue]=(issues[m.issue]||0)+1;
      if(m.technique) techniques[m.technique]=(techniques[m.technique]||0)+1;
      if(m.phase) phases[m.phase]=(phases[m.phase]||0)+1;
      if(m.action) actions.push(m.action);
      if(m.issue==='positive') positives.push(m);
    });
    const sorted=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]);
    return {count:ms.length,issues:sorted(issues),techniques:sorted(techniques),phases:sorted(phases),actions,positives};
  }

  async function analyzeAthlete(id, persist=true){
    if(!id) return null;
    const reviews=await allReviews(), ms=markersForAthlete(reviews,id), sum=summarize(ms);
    let athlete=null, profile=null;
    try{
      const rr=await S.get('roster'); const roster=rr?.value?JSON.parse(rr.value):[];
      athlete=(Array.isArray(roster)?roster:[]).find(a=>String(a.id||a.playerId||'')===String(id))||null;
      profile=window.getAthleteProfile?await window.getAthleteProfile(id,athlete||{id}):null;
    }catch(e){}
    const topIssue=sum.issues[0]?.[0]||'';
    const topTech=sum.techniques[0]?.[0]||'';
    const recommendation=topIssue==='continuation'
      ? 'Отработать продолжение после первой защиты: O-soto → O-uchi / Uchi-mata и обязательное завершение действия.'
      : topIssue==='tactical'
      ? 'Сделать акцент на принятии решения: первая атака, реакция на защиту и второй темп.'
      : topIssue==='kuzushi'||topIssue==='balance'
      ? 'Усилить Kuzushi и контроль баланса через короткие серии входов и движение.'
      : topIssue==='ne-waza'
      ? 'Связать завершение броска с немедленным переходом в Ne-waza.'
      : topIssue ? `Отработать повторяющуюся проблему: ${labels[topIssue]||topIssue}.`
      : 'Накопите несколько размеченных эпизодов, чтобы получить устойчивую картину.';
    if(persist && profile && ms.length){
      profile.lastReviewAt=new Date().toISOString();
      profile.videoReviewSummary={
        totalMarks:sum.count, topIssue, topTechnique:topTech,
        topIssues:sum.issues.slice(0,5).map(([key,count])=>({key,count})),
        updatedAt:new Date().toISOString()
      };
      if(topIssue && topIssue!=='positive'){
        const weakness=labels[topIssue]||topIssue;
        profile.weaknesses=Array.isArray(profile.weaknesses)?profile.weaknesses:[];
        if(!profile.weaknesses.includes(weakness)) profile.weaknesses.unshift(weakness);
        profile.weaknesses=profile.weaknesses.slice(0,10);
        const skill=keyForIssue(topIssue);
        if(skill && profile.skills && Number(profile.skills[skill]||0)>=0 && Number(profile.skills[skill]||0)>0)
          profile.skills[skill]=Math.max(0,Number(profile.skills[skill])-1);
        profile.focusNext=recommendation;
      }
      if(topTech){
        profile.linkedTechniques=Array.isArray(profile.linkedTechniques)?profile.linkedTechniques:[];
        if(!profile.linkedTechniques.includes(topTech)) profile.linkedTechniques.push(topTech);
      }
      await window.saveAthleteProfile?.(profile);
    }
    return {athlete,profile,markers:ms,summary:sum,recommendation};
  }

  function render(data){
    const p=$('vm-intelligence-panel'); if(!p)return;
    if(!data){p.style.display='block';p.innerHTML='<div class="vfb-status">Выберите спортсмена.</div>';return;}
    const s=data.summary, issue=s.issues[0], tech=s.techniques[0];
    p.style.display='block';
    p.innerHTML=`
      <div style="font-weight:800;margin-bottom:6px;">🧠 Judo Fight Intelligence</div>
      <div class="vfb-status">Размечено эпизодов: <b>${s.count}</b></div>
      <div style="margin:7px 0;"><b>Повторяющаяся проблема:</b> ${issue?esc(labels[issue[0]]||issue[0]):'пока не определена'}</div>
      <div style="margin:7px 0;"><b>Частая техника:</b> ${tech?esc(tech[0]):'—'}</div>
      <div style="margin:7px 0;"><b>Фокус следующей тренировки:</b><br>${esc(data.recommendation)}</div>
      ${s.issues.length?'<div style="margin-top:8px;"><b>Проблемы:</b> '+s.issues.map(x=>`${esc(labels[x[0]]||x[0])} — ${x[1]}`).join(' · ')+'</div>':''}
      ${s.actions.length?'<div style="margin-top:8px;"><b>Рекомендации тренера:</b><ul style="margin:4px 0 0 18px;">'+s.actions.slice(-5).map(x=>`<li>${esc(x)}</li>`).join('')+'</ul></div>':''}
      <div class="vfb-status" style="margin-top:8px;">Результат сохранён в профиль спортсмена и может использоваться следующими модулями приложения.</div>`;
  }

  async function open(){
    if(window.ProFeatures && !window.ProFeatures.requirePro('Разбор видео схваток')) return;
    const id=$('vm-feedback-athlete')?.value||'';
    if(!id){render(null);return;}
    const b=$('vm-intelligence'); if(b){b.disabled=true;b.textContent='⏳ Анализ…';}
    try{render(await analyzeAthlete(id,true));}
    catch(e){const p=$('vm-intelligence-panel');if(p){p.style.display='block';p.textContent='Ошибка анализа: '+(e?.message||e);}}
    finally{if(b){b.disabled=false;b.textContent='🧠 Анализ спортсмена';}}
  }
  $('vm-intelligence')?.addEventListener('click',open);
  document.addEventListener('DOMContentLoaded',()=>{
    $('vm-feedback-athlete')?.addEventListener('change',()=>{const p=$('vm-intelligence-panel');if(p)p.style.display='none';});
  });
  window.JudoFightIntelligence={analyzeAthlete,allReviews,markersForAthlete,summarize};
})();
