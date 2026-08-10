/* Judo Coach 4.0 — Fight Review Studio
 * Phase 6:
 * - local HTML5 video for precise review
 * - exact currentTime markers
 * - drawing/annotations stored as normalized strokes
 * - comments linked to athlete + timestamp
 * - optional upload of local video to the user's Google Drive
 */
(function(){
  'use strict';

  const modal = document.getElementById('video-modal');
  const stage = document.getElementById('video-frame-stage');
  const holder = document.getElementById('video-modal-iframe-holder');
  const canvas = document.getElementById('video-annotation-canvas');
  if(!modal || !stage || !holder || !canvas) return;

  const ctx = canvas.getContext('2d');
  let localVideo = null;
  let localObjectUrl = '';
  let currentReviewUrl = '';
  let currentReviewTitle = '';
  let currentReview = null;
  let strokes = [];
  let drawing = false;
  let currentStroke = null;
  let annotate = false;
  let selectedMarkerId = null;

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = () => 'fr_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9);
  const fmt = s => {
    s=Math.max(0,Number(s)||0);
    const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=Math.floor(s%60);
    return (h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
  };

  function setStatus(t){ const el=$('vm-feedback-status'); if(el) el.textContent=t; }
  function storageKey(url){ return 'video_feedback'; }

  async function readReview(url){
    try{
      const r=await S.get(storageKey(url));
      const all=r?.value?JSON.parse(r.value):{};
      return all && all.url===url ? all : {id:uid(),url,title:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),athleteId:'',markers:[]};
    }catch(e){
      return {id:uid(),url,title:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),athleteId:'',markers:[]};
    }
  }
  async function writeReview(){
    if(!currentReview) return false;
    currentReview.updatedAt=new Date().toISOString();
    try{ await S.set(storageKey(currentReviewUrl),JSON.stringify(currentReview)); return true; }catch(e){ return false; }
  }

  function ensureLocalVideo(){
    if(localVideo) return localVideo;
    localVideo=document.createElement('video');
    localVideo.className='judo-local-video';
    localVideo.controls=false;
    localVideo.playsInline=true;
    localVideo.preload='metadata';
    localVideo.setAttribute('aria-label','Видео для разбора');
    holder.innerHTML='';
    holder.appendChild(localVideo);
    ['loadedmetadata','timeupdate','durationchange','play','pause','seeked'].forEach(ev=>localVideo.addEventListener(ev,updateTime));
    return localVideo;
  }

  function isLocal(){ return !!localVideo; }

  function resize(){
    const r=stage.getBoundingClientRect();
    const dpr=Math.max(1,Math.min(3,window.devicePixelRatio||1));
    canvas.width=Math.max(1,Math.round(r.width*dpr));
    canvas.height=Math.max(1,Math.round(r.height*dpr));
    canvas.style.width=r.width+'px'; canvas.style.height=r.height+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
    redraw();
  }
  function point(e){
    const r=canvas.getBoundingClientRect();
    return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};
  }
  function redraw(){
    const r=canvas.getBoundingClientRect();
    ctx.clearRect(0,0,r.width,r.height);
    for(const st of strokes){
      if(!st.points || st.points.length<2) continue;
      ctx.beginPath();
      st.points.forEach((p,i)=>{const x=p.x*r.width,y=p.y*r.height;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
      ctx.strokeStyle=st.color||'#ffcc00';
      ctx.lineWidth=st.width||4;
      ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
    }
  }
  function setAnnotate(on){
    annotate=!!on;
    canvas.classList.toggle('active',annotate);
    const b=$('vm-annotate');
    if(b) b.textContent=annotate?'✏️ Рисование включено':'✏️ Разбор';
    if(!annotate){ drawing=false; currentStroke=null; }
  }
  function clearDrawing(){ strokes=[]; currentStroke=null; redraw(); }

  function updateLocalControls(){
    const bar=$('local-video-controls');
    if(bar) bar.style.display=isLocal()?'flex':'none';
    const source=$('vm-local-source');
    if(source) source.style.display=isLocal()?'flex':'none';
    const drive=$('vm-local-upload-drive');
    if(drive) drive.style.display=isLocal()?'flex':'none';
    const seek=$('local-video-seek-row');
    if(seek) seek.style.display=isLocal()?'flex':'none';
  }
  function updateTime(){
    if(!localVideo) return;
    const cur=Number(localVideo.currentTime)||0, dur=Number(localVideo.duration)||0;
    const time=$('local-video-time'), range=$('local-video-seek');
    if(time) time.textContent=`${fmt(cur)} / ${fmt(dur)}`;
    if(range){ range.max=String(dur||0); range.value=String(cur); }
  }

  function renderMarkers(){
    const list=$('vm-feedback-list');
    if(!list) return;
    const items=currentReview?.markers||[];
    if(!items.length){ list.innerHTML='<span style="font-size:11px;color:var(--dim)">Сохранённых отметок пока нет.</span>'; return; }
    list.innerHTML=items.slice().sort((a,b)=>(a.timeSeconds||0)-(b.timeSeconds||0)).map(m=>
      `<button type="button" class="vfb-marker ${m.id===selectedMarkerId?'active':''}" data-fr-marker="${esc(m.id)}">${esc(fmt(m.timeSeconds))} · ${esc((m.comment||'Без комментария').slice(0,34))}</button>`
    ).join('');
    list.querySelectorAll('[data-fr-marker]').forEach(b=>b.addEventListener('click',()=>{
      const m=items.find(x=>x.id===b.dataset.frMarker); if(!m)return;
      selectedMarkerId=m.id; strokes=JSON.parse(JSON.stringify(m.strokes||[]));
      if(localVideo) localVideo.currentTime=Number(m.timeSeconds)||0;
      const tc=$('vm-timecode'); if(tc) tc.value=fmt(m.timeSeconds);
      const ci=$('vm-feedback-comment'); if(ci) ci.value=m.comment||'';
      const tf=$('vm-feedback-technique'); if(tf) tf.value=m.technique||'';
      const pf=$('vm-feedback-phase'); if(pf) pf.value=m.phase||'';
      const inf=$('vm-feedback-issue'); if(inf) inf.value=m.issue||'';
      const af=$('vm-feedback-action'); if(af) af.value=m.action||'';
      const afn=$('vm-feedback-athlete'); if(afn) afn.value=m.athleteId||'';
      redraw(); renderMarkers(); setAnnotate(true);
      setStatus(`Отметка ${fmt(m.timeSeconds)} загружена.`);
    }));
  }

  async function saveMarker(){
    if(!currentReview || !localVideo){ setStatus('Сначала загрузите видео для точного разбора.'); return; }
    const athleteId=$('vm-feedback-athlete')?.value||'';
    const sec=Math.max(0,Number(localVideo.currentTime)||0);
    const comment=($('vm-feedback-comment')?.value||'').trim();
    const technique=$('vm-feedback-technique')?.value||'';
    const phase=$('vm-feedback-phase')?.value||'';
    const issue=$('vm-feedback-issue')?.value||'';
    const action=($('vm-feedback-action')?.value||'').trim();
    const marker={
      id:selectedMarkerId||uid(),
      timeSeconds:sec,
      timecode:fmt(sec),
      athleteId,
      technique,
      phase,
      issue,
      action,
      comment,
      strokes:JSON.parse(JSON.stringify(strokes)),
      createdAt:new Date().toISOString(),
      updatedAt:new Date().toISOString()
    };
    const arr=currentReview.markers||[];
    const idx=arr.findIndex(x=>x.id===marker.id);
    if(idx>=0) arr[idx]=marker; else arr.push(marker);
    currentReview.markers=arr;
    currentReview.athleteId=athleteId;
    const ok=await writeReview();
    if(ok){ selectedMarkerId=marker.id; renderMarkers(); window.dispatchEvent(new CustomEvent('judo:review-saved',{detail:{athleteId,marker}})); setStatus(`Сохранено ${marker.timecode}. Комментарий и рисунок привязаны к кадру.`); }
    else setStatus('Не удалось сохранить разбор.');
  }

  function captureMarker(){
    if(!localVideo){ setStatus('Сначала загрузите локальное видео.'); return; }
    const sec=Number(localVideo.currentTime)||0;
    const tc=$('vm-timecode'); if(tc) tc.value=fmt(sec);
    setStatus(`Точный таймкод: ${fmt(sec)}.`);
  }

  async function loadAthletes(){
    const sel=$('vm-feedback-athlete'); if(!sel)return;
    try{
      const r=await S.get('roster');
      const roster=r?.value?JSON.parse(r.value):[];
      sel.innerHTML='<option value="">Без привязки к спортсмену</option>'+
        (Array.isArray(roster)?roster:[]).map(a=>`<option value="${esc(a.id||a.playerId||'')}">${esc(a.name||'Без имени')}</option>`).join('');
    }catch(e){}
  }

  async function openLocalFile(file){
    if(!file || !file.type.startsWith('video/')){ alert('Выберите видеофайл.'); return; }
    if(localObjectUrl) URL.revokeObjectURL(localObjectUrl);
    localObjectUrl=URL.createObjectURL(file);
    localVideo=ensureLocalVideo();
    localVideo.src=localObjectUrl;
    localVideo.load();
    currentReviewUrl='local:'+file.name+':'+file.size+':'+file.lastModified;
    currentReviewTitle=file.name;
    currentReview=await readReview(currentReviewUrl);
    currentReview.title=file.name;
    await loadAthletes();
    renderMarkers();
    clearDrawing(); selectedMarkerId=null;
    const title1=$('vm-title1'); if(title1) title1.textContent=file.name;
    const title2=$('vm-title2'); if(title2) title2.textContent='🎥 Локальное видео · точный разбор';
    const desc=$('vm-desc'); if(desc) desc.textContent='Локальное видео: точный таймкод, покадровый анализ, рисунки и комментарии тренера.';
    updateLocalControls();
    setAnnotate(false);
    resize();
    setStatus('Видео загружено. Поставьте на паузу и нажмите «Метка» для точного таймкода.');
    try{ await localVideo.play(); }catch(e){}
  }

  async function uploadToDrive(){
    if(!localVideo || !currentReview) return;
    const api=window.JudoCloud;
    if(!api?.uploadBlob){ alert('Сначала войдите в Google и подключите Google Диск.'); return; }
    const fileInput=$('vm-local-file');
    const file=fileInput?.files?.[0];
    if(!file){ alert('Исходный файл не найден. Загрузите видео ещё раз.'); return; }
    setStatus('Загрузка видео в Google Диск…');
    try{
      const result=await api.uploadBlob(file,file.name,file.type||'video/mp4');
      if(!result?.webViewLink && !result?.id) throw new Error('Google Drive не вернул идентификатор файла');
      const url=result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`;
      currentReview.cloudFileId=result.id;
      currentReview.cloudUrl=url;
      await writeReview();
      setStatus('Видео сохранено в Google Диск. Разбор сохранён отдельно и привязан к этому файлу.');
    }catch(e){
      setStatus('Ошибка загрузки: '+(e?.message||e));
    }
  }

  function newMarker(){
    selectedMarkerId=null; clearDrawing();
    const ci=$('vm-feedback-comment'); if(ci) ci.value='';
    ['vm-feedback-technique','vm-feedback-phase','vm-feedback-issue','vm-feedback-action'].forEach(id=>{const el=$(id);if(el)el.value='';});
    setAnnotate(true); captureMarker();
    setStatus('Новая отметка. Нарисуйте поверх кадра и добавьте комментарий.');
  }

  // Controls
  $('vm-local-file')?.addEventListener('change',e=>openLocalFile(e.target.files?.[0]));
  $('vm-local-play')?.addEventListener('click',()=>{if(localVideo){localVideo.paused?localVideo.play():localVideo.pause();}});
  $('vm-local-back')?.addEventListener('click',()=>{if(localVideo)localVideo.currentTime=Math.max(0,localVideo.currentTime-5);});
  $('vm-local-forward')?.addEventListener('click',()=>{if(localVideo)localVideo.currentTime=Math.min(localVideo.duration||Infinity,localVideo.currentTime+5);});
  $('vm-local-frame-back')?.addEventListener('click',()=>{if(localVideo)localVideo.currentTime=Math.max(0,localVideo.currentTime-1/25);});
  $('vm-local-frame-forward')?.addEventListener('click',()=>{if(localVideo)localVideo.currentTime=Math.min(localVideo.duration||Infinity,localVideo.currentTime+1/25);});
  $('vm-local-speed')?.addEventListener('change',e=>{if(localVideo)localVideo.playbackRate=Number(e.target.value)||1;});
  $('vm-local-seek')?.addEventListener('input',e=>{if(localVideo)localVideo.currentTime=Number(e.target.value)||0;});
  $('vm-local-upload-drive')?.addEventListener('click',uploadToDrive);
  $('vm-annotate')?.addEventListener('click',()=>setAnnotate(!annotate));
  $('vm-marker')?.addEventListener('click',captureMarker);
  $('vm-save-feedback')?.addEventListener('click',saveMarker);
  $('vm-new-feedback')?.addEventListener('click',newMarker);
  $('vm-clear-drawing')?.addEventListener('click',clearDrawing);

  canvas.addEventListener('pointerdown',e=>{
    if(!annotate)return;
    e.preventDefault(); canvas.setPointerCapture?.(e.pointerId); drawing=true;
    currentStroke={color:'#ffcc00',width:4,points:[point(e)]}; strokes.push(currentStroke); redraw();
  });
  canvas.addEventListener('pointermove',e=>{
    if(!drawing||!currentStroke)return;
    e.preventDefault(); currentStroke.points.push(point(e)); redraw();
  });
  ['pointerup','pointercancel','pointerleave'].forEach(ev=>canvas.addEventListener(ev,()=>{drawing=false;currentStroke=null;}));

  // Intercept local file button from anywhere in the app.
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-open-local-video]');
    if(b){ e.preventDefault(); $('vm-local-file')?.click(); }
  });

  function closeLocal(){
    if(localObjectUrl){ URL.revokeObjectURL(localObjectUrl); localObjectUrl=''; }
    localVideo=null;
    if(holder) holder.innerHTML='';
    currentReviewUrl=''; currentReview=null; strokes=[]; selectedMarkerId=null;
    updateLocalControls(); clearDrawing(); setAnnotate(false);
  }

  window.JudoFightReview={
    openLocalFile,
    closeLocal,
    isLocal:()=>!!localVideo,
    currentTime:()=>Number(localVideo?.currentTime)||0,
    getReview:()=>currentReview
  };

  window.addEventListener('resize',resize);
  resize();
})();
