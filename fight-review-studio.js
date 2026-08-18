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
  let pendingVoiceNote = null; // {dataUrl, mime} — привязывается к отметке при сохранении
  let voiceRecorder = null;
  let voiceChunks = [];
  let voiceStream = null;

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = () => 'fr_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9);
  const fmt = s => {
    s=Math.max(0,Number(s)||0);
    const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=Math.floor(s%60);
    return (h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
  };

  function setStatus(t){ const el=$('vm-feedback-status'); if(el) el.textContent=t; }
  function storageKey(url){
    // БАГ, который был здесь раньше: функция всегда возвращала одну и ту же
    // строку 'video_feedback' независимо от url — из-за этого разбор ЛЮБОГО
    // видео сохранялся в один и тот же документ и затирал разбор предыдущего
    // видео. Теперь у каждого видео/файла свой ключ.
    let h = 0;
    for(let i=0;i<url.length;i++){ h = ((h<<5)-h + url.charCodeAt(i))|0; }
    return 'video_feedback:' + Math.abs(h).toString(36) + ':' + url.length;
  }

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
      pendingVoiceNote = m.voiceNote ? { dataUrl:m.voiceNote, mime:m.voiceNoteMime||'audio/webm' } : null;
      renderVoicePreview();
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
      voiceNote: pendingVoiceNote ? pendingVoiceNote.dataUrl : null,
      voiceNoteMime: pendingVoiceNote ? pendingVoiceNote.mime : null,
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

  // ---------- Голосовые заметки ----------
  function blobToDataUrl(blob){
    return new Promise((resolve,reject)=>{
      const r=new FileReader();
      r.onload=()=>resolve(r.result);
      r.onerror=reject;
      r.readAsDataURL(blob);
    });
  }
  function renderVoicePreview(){
    const audio=$('vm-voice-preview'), delBtn=$('vm-voice-delete');
    if(!audio) return;
    if(pendingVoiceNote){
      audio.src=pendingVoiceNote.dataUrl; audio.style.display='block';
      if(delBtn) delBtn.style.display='inline-flex';
    } else {
      audio.removeAttribute('src'); audio.style.display='none';
      if(delBtn) delBtn.style.display='none';
    }
  }
  async function toggleVoiceRecording(){
    const btn=$('vm-voice-record');
    if(voiceRecorder && voiceRecorder.state==='recording'){ voiceRecorder.stop(); return; }
    if(!navigator.mediaDevices?.getUserMedia){
      alert('Запись звука не поддерживается этим браузером/WebView.'); return;
    }
    try{ voiceStream = await navigator.mediaDevices.getUserMedia({audio:true}); }
    catch(e){ alert('Нет доступа к микрофону: '+(e?.message||e)); return; }
    voiceChunks=[];
    try{ voiceRecorder=new MediaRecorder(voiceStream); }
    catch(e){ alert('Не удалось начать запись: '+(e?.message||e)); voiceStream.getTracks().forEach(t=>t.stop()); return; }
    voiceRecorder.ondataavailable=e=>{ if(e.data.size>0) voiceChunks.push(e.data); };
    voiceRecorder.onstop=async()=>{
      voiceStream?.getTracks().forEach(t=>t.stop());
      const blob=new Blob(voiceChunks,{type:voiceRecorder.mimeType||'audio/webm'});
      pendingVoiceNote={ dataUrl: await blobToDataUrl(blob), mime: blob.type };
      renderVoicePreview();
      setStatus('Голосовая заметка записана — не забудьте нажать «Сохранить отметку».');
      if(btn){ btn.textContent='🎤 Голосовая заметка'; btn.classList.remove('active'); }
    };
    voiceRecorder.start();
    if(btn){ btn.textContent='⏹ Остановить запись'; btn.classList.add('active'); }
    setStatus('Идёт запись голосовой заметки…');
  }
  $('vm-voice-record')?.addEventListener('click', toggleVoiceRecording);
  $('vm-voice-delete')?.addEventListener('click', ()=>{ pendingVoiceNote=null; renderVoicePreview(); });

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
    pendingVoiceNote=null; renderVoicePreview();
    const title1=$('vm-title1'); if(title1) title1.textContent=file.name;
    const title2=$('vm-title2'); if(title2) title2.textContent='🎥 Локальное видео · точный разбор';
    const desc=$('vm-desc'); if(desc) desc.textContent='Локальное видео: точный таймкод, покадровый анализ, рисунки и комментарии тренера.';
    updateLocalControls();
    setAnnotate(false);
    resize();
    setStatus('Видео загружено. Поставьте на паузу и нажмите «Метка» для точного таймкода.');
    try{ await localVideo.play(); }catch(e){}
  }

  // Пользовательские видео никогда не загружаются в облако.
  // Исходник, разбор и экспорт хранятся локально на устройстве.

  function newMarker(){
    selectedMarkerId=null; clearDrawing();
    pendingVoiceNote=null; renderVoicePreview();
    const ci=$('vm-feedback-comment'); if(ci) ci.value='';
    ['vm-feedback-technique','vm-feedback-phase','vm-feedback-issue','vm-feedback-action'].forEach(id=>{const el=$(id);if(el)el.value='';});
    setAnnotate(true); captureMarker();
    setStatus('Новая отметка. Нарисуйте поверх кадра и добавьте комментарий.');
  }

  // ---------- Экспорт видео с «вживлёнными» пометками ----------
  // Как это работает: видео проигрывается один раз от начала до конца в
  // реальном времени, каждый кадр перерисовывается на отдельный canvas
  // (кадр видео + рисунки + текст комментария), голосовые заметки
  // подмешиваются в звук через Web Audio API в нужный момент, весь этот
  // поток записывается через MediaRecorder в новый видеофайл, который
  // потом отдаём в системное меню «Поделиться» (там есть «Сохранить в
  // галерею»/«Сохранить видео» — стандартный пункт Android/iOS).
  //
  // ВАЖНО: HTMLVideoElement.captureStream() — это API Chromium (работает в
  // Android WebView), но НЕ поддерживается в Safari/WKWebView на iOS. Это
  // ограничение самого iOS, а не приложения. На iOS эта кнопка покажет
  // понятное сообщение вместо тихого сбоя.
  const MARK_DURATION = 4; // сколько секунд держим пометку на экране после её момента

  function supportsExport(){
    return !!(canvas.captureStream && window.MediaRecorder && (localVideo?.captureStream || localVideo?.mozCaptureStream));
  }

  async function saveVideoBlobToGallery(blob, filename){
    const plugins = window.Capacitor?.Plugins;
    if(plugins?.Filesystem && plugins?.Share){
      try{
        const base64 = await blobToDataUrl(blob);
        const base64Data = base64.split(',')[1];
        const write = await plugins.Filesystem.writeFile({ path: filename, data: base64Data, directory: 'CACHE' });
        await plugins.Share.share({ title:'Видео с пометками тренера', url: write.uri, files:[write.uri] });
        return true;
      }catch(e){
        console.error('Сохранение через Capacitor не удалось:', e);
        alert('Не удалось открыть системное меню «Поделиться»: '+(e?.message||e)+'\nФайл останется доступен локально через обычное сохранение.');
      }
    }
    // Обычный браузер (или плагины Capacitor недоступны) — просто скачиваем файл.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 15000);
    return true;
  }

  async function exportVideoWithAnnotations(){
    if(!localVideo || !currentReview){ setStatus('Сначала загрузите видео для разбора.'); return; }
    if(!supportsExport()){
      alert('Этот браузер/WebView не поддерживает запись видео (captureStream/MediaRecorder).\n'+
            'На Android обычно работает; на iOS (Safari/WKWebView) эта функция пока недоступна — так ограничивает сама Apple.');
      return;
    }

    const statusEl = $('vm-export-status');
    const showExportStatus = t => { if(statusEl){ statusEl.style.display = t ? 'block' : 'none'; statusEl.textContent = t; } };

    const markers = (currentReview.markers||[]).slice().sort((a,b)=>(a.timeSeconds||0)-(b.timeSeconds||0));
    if(!markers.length){ alert('Нет ни одной сохранённой отметки — сначала нарисуйте и сохраните хотя бы одну.'); return; }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();
    const dest = audioCtx.createMediaStreamDestination();
    try{
      const vidStream = (localVideo.captureStream||localVideo.mozCaptureStream).call(localVideo);
      const vAudio = vidStream.getAudioTracks()[0];
      if(vAudio) audioCtx.createMediaStreamSource(new MediaStream([vAudio])).connect(dest);
    }catch(e){ console.warn('Экспорт: не удалось захватить звук исходного видео', e); }

    const voiceAudios = markers.filter(m=>m.voiceNote).map(m=>{
      const a = new Audio(m.voiceNote); a.preload='auto';
      try{ audioCtx.createMediaElementSource(a).connect(dest); }catch(e){}
      return { marker:m, audio:a, played:false };
    });

    const W = localVideo.videoWidth||1280, H = localVideo.videoHeight||720;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width=W; exportCanvas.height=H;
    const ectx = exportCanvas.getContext('2d');
    const canvasStream = exportCanvas.captureStream(30);
    const combined = new MediaStream([...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);

    const mimeCandidates=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
    const mime = mimeCandidates.find(m=>MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
    const recorder = new MediaRecorder(combined, mime?{mimeType:mime}:undefined);
    const outChunks=[];
    recorder.ondataavailable = e=>{ if(e.data.size>0) outChunks.push(e.data); };

    const wasPaused = localVideo.paused, originalTime = localVideo.currentTime, originalMuted = localVideo.muted;

    function drawFrame(){
      ectx.drawImage(localVideo,0,0,W,H);
      const t = localVideo.currentTime;
      markers.filter(m=>t>=m.timeSeconds && t<=m.timeSeconds+MARK_DURATION).forEach(m=>{
        (m.strokes||[]).forEach(st=>{
          if(!st.points || st.points.length<2) return;
          ectx.beginPath();
          st.points.forEach((p,i)=>{ const x=p.x*W,y=p.y*H; i?ectx.lineTo(x,y):ectx.moveTo(x,y); });
          ectx.strokeStyle = st.color||'#ffcc00';
          ectx.lineWidth = (st.width||4)*(W/640);
          ectx.lineCap='round'; ectx.lineJoin='round'; ectx.stroke();
        });
        if(m.comment){
          const pad=16, fontSize=Math.max(16,Math.round(H*0.032));
          ectx.font=`bold ${fontSize}px Inter, sans-serif`;
          const text=m.comment.slice(0,120), tw=ectx.measureText(text).width;
          ectx.fillStyle='rgba(0,0,0,.55)'; ectx.fillRect(pad,H-fontSize-pad*1.8,tw+pad*1.5,fontSize+pad*0.9);
          ectx.fillStyle='#ffcc00'; ectx.fillText(text,pad+pad/2,H-pad*1.3);
        }
      });
      voiceAudios.forEach(v=>{
        if(!v.played && t>=v.marker.timeSeconds && t<=v.marker.timeSeconds+0.3){
          v.played=true; v.audio.currentTime=0; v.audio.play().catch(()=>{});
        }
      });
    }

    return new Promise((resolve)=>{
      let rafId;
      function loop(){ drawFrame(); rafId=requestAnimationFrame(loop); }
      recorder.onstop = async ()=>{
        cancelAnimationFrame(rafId);
        localVideo.muted = originalMuted;
        try{ audioCtx.close(); }catch(e){}
        const outBlob = new Blob(outChunks, {type: mime||'video/webm'});
        showExportStatus('Готово. Открываем меню сохранения…');
        await saveVideoBlobToGallery(outBlob, (currentReviewTitle||'video').replace(/\.[^.]+$/,'')+'_разбор.webm');
        showExportStatus('');
        localVideo.currentTime = originalTime;
        if(wasPaused) localVideo.pause();
        resolve(true);
      };
      localVideo.muted = true; // звук проигрывается через Web Audio API, а не напрямую в динамики
      localVideo.currentTime = 0;
      recorder.start();
      showExportStatus('Идёт запись: видео проигрывается один раз от начала до конца — не закрывайте экран…');
      localVideo.play().then(()=>{ loop(); });
      localVideo.onended = ()=>{ try{ recorder.stop(); }catch(e){} localVideo.onended=null; };
    });
  }

  $('vm-export-video')?.addEventListener('click', ()=>{
    exportVideoWithAnnotations().catch(e=>{ console.error('Ошибка экспорта видео:', e); alert('Ошибка экспорта: '+(e?.message||e)); });
  });

  $('vm-toggle-review')?.addEventListener('click', ()=>{
    const panel = $('video-feedback-toolbar');
    const btn = $('vm-toggle-review');
    if(!panel) return;
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'flex';
    if(btn) btn.classList.toggle('active', !isOpen);
  });

  // Controls
  $('vm-local-file')?.addEventListener('change',e=>openLocalFile(e.target.files?.[0]));
  $('vm-local-play')?.addEventListener('click',()=>{if(localVideo){localVideo.paused?localVideo.play():localVideo.pause();}});
  $('vm-local-back')?.addEventListener('click',()=>{if(localVideo)localVideo.currentTime=Math.max(0,localVideo.currentTime-5);});
  $('vm-local-forward')?.addEventListener('click',()=>{if(localVideo)localVideo.currentTime=Math.min(localVideo.duration||Infinity,localVideo.currentTime+5);});
  $('vm-local-frame-back')?.addEventListener('click',()=>{if(localVideo)localVideo.currentTime=Math.max(0,localVideo.currentTime-1/25);});
  $('vm-local-frame-forward')?.addEventListener('click',()=>{if(localVideo)localVideo.currentTime=Math.min(localVideo.duration||Infinity,localVideo.currentTime+1/25);});
  $('vm-local-speed')?.addEventListener('change',e=>{if(localVideo)localVideo.playbackRate=Number(e.target.value)||1;});
  $('vm-local-seek')?.addEventListener('input',e=>{if(localVideo)localVideo.currentTime=Number(e.target.value)||0;});
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
    pendingVoiceNote=null; renderVoicePreview();
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
