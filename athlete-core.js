// ================= ATHLETE CORE / JUDO DNA =================
// Phase 3: профиль спортсмена отделён от legacy roster.
// Roster остаётся совместимым источником базовых данных, а расширенный профиль
// хранится отдельно как athlete:<id>. Это позволяет постепенно развивать модель
// без разрушения старых данных.
(function(){
  'use strict';

  const PROFILE_PREFIX = 'athlete:';
  const SKILLS = [
    ['ukemi','Ukemi'],
    ['kuzushi','Kuzushi'],
    ['tsukuri','Tsukuri'],
    ['kake','Kake'],
    ['tachiWaza','Tachi-waza'],
    ['neWaza','Ne-waza'],
    ['randori','Randori'],
    ['tactics','Тактика']
  ];

  function uid(){
    if(window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'ath-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,10);
  }
  function now(){ return new Date().toISOString(); }
  function esc(v){
    if(typeof escapeHtml === 'function') return escapeHtml(v == null ? '' : String(v));
    return String(v == null ? '' : v).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function defaultProfile(athlete){
    const t = now();
    return {
      id: athlete.id,
      schemaVersion: 1,
      createdAt: athlete.createdAt || t,
      updatedAt: t,
      goals: [],
      strengths: [],
      weaknesses: [],
      skills: Object.fromEntries(SKILLS.map(([k])=>[k,0])),
      assessments: [],
      gamePlan: { grip:'', firstAttack:'', continuation:'', neWaza:'', notes:'' },
      coachNotes: '',
      focusNext: '',
      linkedTechniques: [],
      linkedExercises: [],
      lastReviewAt: null
    };
  }

  async function getProfile(id, athlete){
    if(!id) return null;
    const res = await S.get(PROFILE_PREFIX + id);
    if(res){
      try { return JSON.parse(res.value); } catch(e){}
    }
    const profile = defaultProfile(athlete || {id});
    await S.set(PROFILE_PREFIX + id, JSON.stringify(profile));
    return profile;
  }

  async function saveProfile(profile){
    profile.updatedAt = now();
    await S.set(PROFILE_PREFIX + profile.id, JSON.stringify(profile));
    return profile;
  }

  async function ensureAthleteProfile(athlete){
    if(!athlete || !athlete.id) return null;
    return getProfile(athlete.id, athlete);
  }

  async function getAllProfiles(){
    const out = [];
    try{
      const res = await S.list(PROFILE_PREFIX);
      for(const key of (res && res.keys) || []){
        const r = await S.get(key);
        if(r){ try { out.push(JSON.parse(r.value)); } catch(e){} }
      }
    }catch(e){}
    return out;
  }

  function skillBar(value){
    const n = Math.max(0, Math.min(5, Number(value)||0));
    return `<div class="judo-skillbar" aria-label="Оценка ${n} из 5">${[1,2,3,4,5].map(i=>`<span class="${i<=n?'on':''}"></span>`).join('')}</div>`;
  }

  async function recentTrainingStats(athlete){
    const result = {done:0, present:0, absent:0, lastDate:null, recent:[]};
    if(!athlete) return result;
    try{
      const res = await S.list('plan:');
      const sessions = [];
      for(const key of (res && res.keys)||[]){
        const r = await S.get(key); if(!r) continue;
        let arr=[]; try{arr=JSON.parse(r.value)||[]}catch(e){continue;}
        for(const s of arr){
          if(!s || s.status!=='done') continue;
          const st=s.attendanceStatus||{};
          const legacy=new Set(s.attendance||[]);
          const names=new Set([...Object.keys(st),...legacy]);
          if(names.has(athlete.name)){
            const status=st[athlete.name] || (legacy.has(athlete.name)?'present':null);
            if(status==='present') result.present++;
            if(status==='absent') result.absent++;
            sessions.push({date:s.date||key.replace(/^plan:/,''), group:s.group||'Тренировка', status});
          }
        }
      }
      sessions.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
      result.done=sessions.length;
      result.lastDate=sessions[0]?.date||null;
      result.recent=sessions.slice(0,5);
    }catch(e){}
    return result;
  }

  async function openProfile(id){
    const roster = await getRoster();
    const athlete = roster.find(x=>x.id===id);
    if(!athlete) return;
    const profile = await ensureAthleteProfile(athlete);
    const stats = await recentTrainingStats(athlete);
    const modal=document.getElementById('athlete-profile-modal');
    if(!modal) return;
    modal.dataset.id=id;
    modal.querySelector('.athlete-profile-title').textContent='🥋 '+athlete.name;
    modal.querySelector('.athlete-profile-sub').textContent=[athlete.kyu||'Без пояса', ageFromBirth(athlete.birthDate)!=null?ageFromBirth(athlete.birthDate)+' лет':'', athlete.trainingGroup||''].filter(Boolean).join(' · ');
    modal.querySelector('#ap-goals').value=(profile.goals||[]).join('\n');
    modal.querySelector('#ap-strengths').value=(profile.strengths||[]).join(', ');
    modal.querySelector('#ap-weaknesses').value=(profile.weaknesses||[]).join(', ');
    modal.querySelector('#ap-focus').value=profile.focusNext||'';
    modal.querySelector('#ap-notes').value=profile.coachNotes||'';
    modal.querySelector('#ap-grip').value=profile.gamePlan?.grip||'';
    modal.querySelector('#ap-first-attack').value=profile.gamePlan?.firstAttack||'';
    modal.querySelector('#ap-continuation').value=profile.gamePlan?.continuation||'';
    modal.querySelector('#ap-newaza').value=profile.gamePlan?.neWaza||'';
    modal.querySelector('#ap-game-notes').value=profile.gamePlan?.notes||'';
    modal.querySelector('#ap-stats').innerHTML=`<div class="ap-stat"><b>${stats.done}</b><span>тренировок</span></div><div class="ap-stat"><b>${stats.present}</b><span>посещено</span></div><div class="ap-stat"><b>${stats.absent}</b><span>пропущено</span></div><div class="ap-stat"><b>${stats.lastDate?esc(stats.lastDate):'—'}</b><span>последняя</span></div>`;
    const skills=modal.querySelector('#ap-skills');
    skills.innerHTML=SKILLS.map(([key,label])=>`<div class="ap-skill"><div><b>${label}</b><span class="ap-skill-value" data-skill-value="${key}">${Number(profile.skills?.[key]||0)}/5</span></div><input type="range" min="0" max="5" step="1" value="${Number(profile.skills?.[key]||0)}" data-skill="${key}">${skillBar(profile.skills?.[key]||0)}</div>`).join('');
    skills.querySelectorAll('input[data-skill]').forEach(inp=>inp.addEventListener('input',()=>{
      inp.parentElement.querySelector('[data-skill-value]').textContent=inp.value+'/5';
      inp.parentElement.querySelector('.judo-skillbar').innerHTML=[1,2,3,4,5].map(i=>`<span class="${i<=Number(inp.value)?'on':''}"></span>`).join('');
    }));
    modal.querySelector('#ap-recent').innerHTML=stats.recent.length ? stats.recent.map(x=>`<div class="ap-recent-row"><span>${esc(x.date)}</span><span>${esc(x.group)}</span><span>${x.status==='present'?'🟢 Был':'🔴 Нет'}</span></div>`).join('') : '<div class="empty-hint">История посещений пока пуста.</div>';
    modal.classList.add('open');
    document.body.classList.add('modal-open');
  }

  async function saveOpenProfile(){
    const modal=document.getElementById('athlete-profile-modal');
    const id=modal?.dataset.id; if(!id) return;
    const profile=await getProfile(id);
    profile.goals=modal.querySelector('#ap-goals').value.split('\n').map(x=>x.trim()).filter(Boolean);
    profile.strengths=modal.querySelector('#ap-strengths').value.split(',').map(x=>x.trim()).filter(Boolean);
    profile.weaknesses=modal.querySelector('#ap-weaknesses').value.split(',').map(x=>x.trim()).filter(Boolean);
    profile.focusNext=modal.querySelector('#ap-focus').value.trim();
    profile.coachNotes=modal.querySelector('#ap-notes').value.trim();
    profile.gamePlan={
      grip:modal.querySelector('#ap-grip').value.trim(),
      firstAttack:modal.querySelector('#ap-first-attack').value.trim(),
      continuation:modal.querySelector('#ap-continuation').value.trim(),
      neWaza:modal.querySelector('#ap-newaza').value.trim(),
      notes:modal.querySelector('#ap-game-notes').value.trim()
    };
    modal.querySelectorAll('input[data-skill]').forEach(inp=>{ profile.skills[inp.dataset.skill]=Number(inp.value)||0; });
    profile.assessments=profile.assessments||[];
    profile.assessments.push({date:new Date().toISOString(), skills:{...profile.skills}, focusNext:profile.focusNext});
    profile.lastReviewAt=now();
    await saveProfile(profile);
    closeProfile();
    if(typeof renderRoster==='function') renderRoster();
  }

  function closeProfile(){
    const modal=document.getElementById('athlete-profile-modal');
    if(modal) modal.classList.remove('open');
    document.body.classList.remove('modal-open');
  }

  function injectProfileButtons(){
    const list=document.getElementById('roster-list'); if(!list) return;
    list.querySelectorAll('.roster-row .top[data-i]').forEach(top=>{
      if(top.querySelector('[data-athlete-profile]')) return;
      const i=Number(top.dataset.i);
      const btn=document.createElement('button');
      btn.className='del athlete-profile-btn'; btn.dataset.athleteProfile=String(i); btn.title='Профиль спортсмена'; btn.textContent='🥋';
      btn.addEventListener('click',async e=>{
        e.stopPropagation();
        const roster=await getRoster(); const athlete=roster[i];
        if(athlete) openProfile(athlete.id);
      });
      const first=top.querySelector('[data-share]');
      top.insertBefore(btn, first || top.firstChild);
    });
  }

  // renderRoster заканчивает DOM синхронно, поэтому MutationObserver позволяет
  // добавить кнопку профиля без переписывания legacy-render целиком.
  const obs=new MutationObserver(()=>injectProfileButtons());
  window.addEventListener('DOMContentLoaded',()=>{
    const el=document.getElementById('roster-list');
    if(el) obs.observe(el,{childList:true,subtree:true});
    document.getElementById('ap-close')?.addEventListener('click',closeProfile);
    document.getElementById('ap-cancel')?.addEventListener('click',closeProfile);
    document.getElementById('ap-save')?.addEventListener('click',saveOpenProfile);
    document.getElementById('athlete-profile-modal')?.addEventListener('click',e=>{if(e.target.id==='athlete-profile-modal') closeProfile();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape') closeProfile();});
  });

  window.ensureAthleteProfile=ensureAthleteProfile;
  window.openAthleteProfile=openProfile;
  window.closeAthleteProfile=closeProfile;
  window.getAthleteProfile=getProfile;
  window.saveAthleteProfile=saveProfile;
  window.getAllAthleteProfiles=getAllProfiles;
})();
