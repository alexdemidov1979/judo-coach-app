  // ================= РАЗБОР ВИДЕО: локальный редактор =================
  // Весь исходник и готовый ролик остаются на устройстве пользователя.
  // Google Drive/облако здесь НЕ используется.
  (function initVideoReview(){
    const fab = document.getElementById('video-review-fab');
    const modal = document.getElementById('video-review-modal');
    const closeBtn = document.getElementById('vr-close');
    const fileInput = document.getElementById('vr-file-input');
    const uploadScreen = document.getElementById('vr-upload-screen');
    const workScreen = document.getElementById('vr-work-screen');
    const video = document.getElementById('vr-video');
    const canvas = document.getElementById('vr-canvas');
    const ctx = canvas?.getContext('2d');
    const playBtn = document.getElementById('vr-play');
    const clearBtn = document.getElementById('vr-clear');
    const recordBtn = document.getElementById('vr-record');
    const statusEl = document.getElementById('vr-status');
    const resultBox = document.getElementById('vr-result');
    const resultVideo = document.getElementById('vr-result-video');
    const downloadLink = document.getElementById('vr-download');
    if(!fab || !modal || !fileInput || !video || !canvas || !ctx) return;

    let strokes=[];
    let currentStroke=null;
    let currentColor='#ff3b30';
    let isOpen=false;
    let isDrawing=false;
    let sourceUrl=null;
    let sourceFile=null;
    let mediaRecorder=null;
    let recordedChunks=[];
    let micStream=null;
    let audioContext=null;
    let audioDestination=null;
    let animationId=0;
    let lastError='';

    const setStatus=t=>{ if(statusEl) statusEl.textContent=t||''; };
    const stopMic=()=>{ if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null;} };
    const cleanupAudio=()=>{
      try{audioContext?.close();}catch(e){}
      audioContext=null; audioDestination=null;
    };

    fab.addEventListener('click',()=>{ modal.style.display='flex'; isOpen=true; });

    function closeModal(){
      isOpen=false;
      try{if(mediaRecorder?.state==='recording') mediaRecorder.stop();}catch(e){}
      mediaRecorder=null;
      stopMic(); cleanupAudio();
      if(animationId) cancelAnimationFrame(animationId);
      animationId=0;
      video.pause();
      if(sourceUrl){URL.revokeObjectURL(sourceUrl);sourceUrl=null;}
      sourceFile=null;
      strokes=[]; currentStroke=null; isDrawing=false;
      uploadScreen.style.display='flex'; workScreen.style.display='none'; resultBox.style.display='none';
      fileInput.value='';
      modal.style.display='none';
    }
    closeBtn.addEventListener('click',closeModal);

    function looksLikeVideo(file){
      if(!file) return false;
      if(String(file.type||'').toLowerCase().startsWith('video/')) return true;
      return /\.(mp4|m4v|mov|webm|mkv|avi|3gp|mpeg|mpg)$/i.test(file.name||'');
    }

    function resetSource(){
      if(sourceUrl){URL.revokeObjectURL(sourceUrl);sourceUrl=null;}
      video.removeAttribute('src'); video.load();
      sourceFile=null; strokes=[]; currentStroke=null; resultBox.style.display='none';
    }

    function showLoaded(){
      const maxW=1280;
      const vw=video.videoWidth||1280, vh=video.videoHeight||720;
      const scale=Math.min(1,maxW/vw);
      canvas.width=Math.max(2,Math.round(vw*scale));
      canvas.height=Math.max(2,Math.round(vh*scale));
      uploadScreen.style.display='none';
      workScreen.style.display='flex';
      strokes=[]; currentStroke=null;
      video.currentTime=0;
      video.pause();
      playBtn.textContent='▶ Пуск';
      setStatus(`Видео загружено: ${sourceFile?.name||'файл'} (${Math.round(vw)}×${Math.round(vh)}). Нажмите «Записать разбор», говорите и рисуйте прямо поверх видео.`);
      drawFrame();
    }

    function openFile(file){
      if(!looksLikeVideo(file)){setStatus('Выберите видеофайл MP4/MOV/WebM или другой поддерживаемый телефоном формат.');return;}
      resetSource();
      sourceFile=file;
      sourceUrl=URL.createObjectURL(file);
      lastError='';
      setStatus('Загружаю видео с телефона…');
      video.preload='auto';
      video.playsInline=true;
      video.controls=false;
      video.src=sourceUrl;
      video.load();

      const timeout=setTimeout(()=>{
        if(video.readyState<2){
          setStatus('Видео не загрузилось. Попробуйте MP4 (H.264/AAC) или другое видео из галереи телефона.');
        }
      },10000);
      const ready=()=>{
        clearTimeout(timeout);
        video.removeEventListener('loadedmetadata',ready);
        video.removeEventListener('loadeddata',ready);
        video.removeEventListener('canplay',ready);
        showLoaded();
      };
      const fail=()=>{
        clearTimeout(timeout);
        lastError=video.error?.code||'';
        const map={1:'загрузка прервана',2:'ошибка чтения файла',3:'не удалось декодировать видео',4:'формат/кодек не поддерживается'};
        setStatus(`Не удалось открыть видео: ${map[lastError]||'неизвестная ошибка'}. Для Android лучше всего MP4 H.264.`);
      };
      video.addEventListener('loadedmetadata',ready,{once:true});
      video.addEventListener('loadeddata',ready,{once:true});
      video.addEventListener('canplay',ready,{once:true});
      video.addEventListener('error',fail,{once:true});
    }

    fileInput.addEventListener('change',e=>{const file=e.target.files?.[0];if(file)openFile(file);});

    function drawFrame(){
      if(!isOpen || !canvas.width || !canvas.height) return;
      if(video.readyState>=2){
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(video,0,0,canvas.width,canvas.height);
      }
      for(const s of strokes){
        if(!s.points?.length) continue;
        ctx.strokeStyle=s.color||'#ff3b30'; ctx.lineWidth=s.width||6;
        ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();
        ctx.moveTo(s.points[0].x,s.points[0].y);
        for(let i=1;i<s.points.length;i++)ctx.lineTo(s.points[i].x,s.points[i].y);
        ctx.stroke();
      }
      animationId=requestAnimationFrame(drawFrame);
    }

    function canvasPoint(ev){
      const r=canvas.getBoundingClientRect();
      return {x:(ev.clientX-r.left)*(canvas.width/r.width),y:(ev.clientY-r.top)*(canvas.height/r.height)};
    }
    canvas.addEventListener('pointerdown',ev=>{
      ev.preventDefault(); isDrawing=true; canvas.setPointerCapture?.(ev.pointerId);
      currentStroke={color:currentColor,width:Math.max(4,canvas.width/240),points:[canvasPoint(ev)]};
      strokes.push(currentStroke); drawFrame();
    });
    canvas.addEventListener('pointermove',ev=>{
      if(!isDrawing||!currentStroke)return;
      ev.preventDefault(); currentStroke.points.push(canvasPoint(ev)); drawFrame();
    });
    ['pointerup','pointercancel','pointerleave'].forEach(n=>canvas.addEventListener(n,()=>{isDrawing=false;currentStroke=null;}));

    document.querySelectorAll('#vr-work-screen [data-color]').forEach(b=>b.addEventListener('click',()=>currentColor=b.dataset.color||currentColor));
    clearBtn.addEventListener('click',()=>{strokes=[];currentStroke=null;drawFrame();});
    playBtn.addEventListener('click',async()=>{
      try{
        if(video.paused){await video.play();playBtn.textContent='⏸ Пауза';}
        else{video.pause();playBtn.textContent='▶ Пуск';}
      }catch(e){setStatus('Не удалось воспроизвести видео: '+(e?.message||e));}
    });

    async function saveVideoToPhone(blob,fileName){
      const safeName=String(fileName||'judo-coach-razbor.webm').replace(/[^a-zA-Z0-9а-яА-Я._-]+/g,'_');
      const cap=window.Capacitor, fs=cap?.Plugins?.Filesystem, share=cap?.Plugins?.Share;
      if(cap?.isNativePlatform?.() && fs){
        try{
          const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});
          const base64=String(dataUrl).split(',')[1];
          const res=await fs.writeFile({path:`JudoCoach/${safeName}`,data:base64,directory:'DOCUMENTS',recursive:true});
          let uri=res?.uri||'';
          try{uri=(await fs.getUri({path:`JudoCoach/${safeName}`,directory:'DOCUMENTS'}))?.uri||uri;}catch(e){}
          if(share?.share && uri){
            try{await share.share({title:'Видеоразбор Judo Coach',text:'Готовый видеоразбор спортсмена',url:uri,files:[uri],dialogTitle:'Отправить или сохранить видео'});}catch(e){console.warn('Share cancelled/failed',e);}
          }
          return true;
        }catch(e){console.warn('Native save failed',e);}
      }
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download=safeName;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
      return true;
    }

    async function startRecording(){
      if(!video.src || video.readyState<2){setStatus('Сначала дождитесь полной загрузки видео.');return;}
      if(!canvas.captureStream || !window.MediaRecorder){setStatus('Эта версия Android/WebView не поддерживает запись результата. Обновите приложение.');return;}
      try{micStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});}catch(e){setStatus('Нет доступа к микрофону. Разрешите микрофон для Judo Coach в настройках Android.');return;}

      recordedChunks=[];
      const canvasStream=canvas.captureStream(30);
      let audioTracks=[];
      try{
        audioContext=new (window.AudioContext||window.webkitAudioContext)();
        audioDestination=audioContext.createMediaStreamDestination();
        // Голос тренера.
        audioContext.createMediaStreamSource(micStream).connect(audioDestination);
        // Исходный звук видео, если он есть.
        if(video.captureStream){
          const sourceStream=video.captureStream();
          const srcAudio=sourceStream.getAudioTracks();
          if(srcAudio.length) audioContext.createMediaStreamSource(new MediaStream(srcAudio)).connect(audioDestination);
        }
        audioTracks=audioDestination.stream.getAudioTracks();
      }catch(e){
        audioTracks=micStream.getAudioTracks();
        cleanupAudio();
      }

      const combined=new MediaStream([...canvasStream.getVideoTracks(),...audioTracks]);
      const mimeCandidates=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
      const mime=mimeCandidates.find(x=>window.MediaRecorder.isTypeSupported?.(x))||'';
      try{mediaRecorder=new MediaRecorder(combined,mime?{mimeType:mime}:undefined);}catch(e){stopMic();cleanupAudio();setStatus('Не удалось запустить запись: '+(e?.message||e));return;}
      mediaRecorder.ondataavailable=e=>{if(e.data?.size)recordedChunks.push(e.data);};
      mediaRecorder.onstop=async()=>{
        const blob=new Blob(recordedChunks,{type:mime||'video/webm'});
        const url=URL.createObjectURL(blob);
        resultVideo.src=url; resultVideo.load();
        const filename=`judo-coach-razbor-${new Date().toISOString().slice(0,10)}.webm`;
        downloadLink.textContent='📱 Сохранить / отправить спортсмену';
        downloadLink.onclick=async ev=>{ev.preventDefault();setStatus('Сохраняю готовый видеоразбор…');await saveVideoToPhone(blob,filename);setStatus('Готово. Видео сохранено локально и доступно для отправки спортсмену.');};
        downloadLink.download=filename; resultBox.style.display='block';
        stopMic();cleanupAudio();
        recordBtn.textContent='🎙 Записать новый разбор';
        setStatus('Видеоразбор готов. Можно посмотреть результат и сохранить/отправить его.');
        mediaRecorder=null;
      };

      video.currentTime=0;
      strokes=strokes.slice();
      video.volume=0;
      try{await video.play();}catch(e){stopMic();cleanupAudio();setStatus('Не удалось запустить видео для записи.');return;}
      mediaRecorder.start(250);
      recordBtn.textContent='⏹ Остановить и сохранить';
      setStatus('🔴 Запись идёт. Говорите и рисуйте пальцем прямо поверх видео. Всё попадёт в итоговый файл.');
    }

    function stopRecording(){
      if(mediaRecorder?.state==='recording') mediaRecorder.stop();
      video.pause();playBtn.textContent='▶ Пуск';
    }
    recordBtn.addEventListener('click',()=>{if(mediaRecorder?.state==='recording')stopRecording();else startRecording();});
    video.addEventListener('ended',()=>{if(mediaRecorder?.state==='recording')stopRecording();playBtn.textContent='▶ Пуск';});
  })();

  // ================= НАПОМИНАНИЕ О ДАВНЕМ БЭКАПЕ =================
  function checkBackupReminder(){
    if(!localStorage.getItem('first_use_date')) localStorage.setItem('first_use_date', new Date().toISOString());
    const last = localStorage.getItem('firebase_last_sync');
    const el = document.getElementById('backup-reminder');
    if(!last){
      const firstUse = localStorage.getItem('first_use_date');
      const daysSinceStart = Math.floor((Date.now() - new Date(firstUse).getTime()) / 86400000);
      if(daysSinceStart >= 7){
        el.style.display = 'block';
        el.textContent = `⚠ Резервная копия ещё ни разу не создавалась. Рекомендуем сохраниться в разделе «Ещё» → «Облако».`;
      } else {
        el.style.display = 'none';
      }
      return;
    }
    const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
    if(days >= 7){
      el.style.display = 'block';
      el.textContent = `⚠ Последнее сохранение в облако было ${days} дн. назад. Рекомендуем сохраниться.`;
    } else {
      el.style.display = 'none';
    }
  }

  // Compatibility: older builds called renderDemidovCard during startup,
  // but the card was removed from the current layout. Keep a safe no-op/visibility
  // implementation so startup never stops with ReferenceError.
  window.renderDemidovCard = function renderDemidovCard(state){
    const el = document.getElementById('telegram-channel-link');
    if(!el) return;
    const user = window.JudoFirebase?.getCurrentUser?.();
    const isAdmin = String(user?.email||'').toLowerCase() === 'peihyei@gmail.com';
    el.style.display = isAdmin ? 'block' : 'none';
    if(isAdmin){
      el.href = 'https://t.me/+WcJ5fH7Xwd4yZWEy';
    }
  };

  // ---------- init ----------
  (async function init(){
    renderDow();
    window.renderDemidovCard?.('loggedout');
    await ensureLibrarySeedV2();
    await ensureLibrarySeedV3();
    await renderCalendar();
    await renderRoster();
    try{ await renderGroupsManager(); }catch(e){}
    await selectDate(new Date());
    checkBackupReminder();
    await renderToday();

    // ---------- Ярлыки быстрого доступа (manifest shortcuts) ----------
    (function handleShortcutHash(){
      const map = {'#today':'today', '#roster':'roster', '#timers':'timers'};
      const target = map[location.hash];
      if(target){
        setTimeout(()=>{
          const nav = document.querySelector(`.bn-item[data-nav="${target}"]`) || document.querySelector(`.chip[data-subtab="${target}"]`);
          if(nav) nav.click();
        }, 300);
      }
    })();

    // ---------- Локальные напоминания (работают только пока приложение открыто) ----------
    // Настоящий push с закрытым приложением на статическом сайте невозможен без backend-сервера.
    setTimeout(checkLocalReminders, 2000);
  })();

  async function checkLocalReminders(){
    if(!('Notification' in window)) return;
    const todayStr = new Date().toDateString();
    if(localStorage.getItem('last_reminder_check') === todayStr) return; // не чаще раза в день
    if(Notification.permission === 'default'){
      try{ await Notification.requestPermission(); }catch(e){}
    }
    if(Notification.permission !== 'granted') return;
    localStorage.setItem('last_reminder_check', todayStr);
    try{
      const roster = await getRoster();
      const now = new Date();
      const certSoon = roster.filter(r=>{
        if(!r.medCert) return false;
        const d = new Date(r.medCert);
        const days = Math.round((d-now)/86400000);
        return days>=0 && days<=3;
      });
      if(certSoon.length){
        new Notification('Judo Coach: справки истекают', { body: certSoon.map(r=>r.name).join(', ') + ' — мед.справка истекает в ближайшие дни.', icon:'./icon-192.png' });
      }
      const comps = await getCompetitions();
      const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate()+1);
      const tomorrowStr = tomorrow.toISOString().slice(0,10);
      const compTomorrow = comps.find(c=>c.date===tomorrowStr);
      if(compTomorrow){
        new Notification('Judo Coach: завтра соревнование', { body: compTomorrow.name, icon:'./icon-192.png' });
      }
      // Напоминание о завтрашней тренировке
      try{
        const r2 = await S.get(dateKey(tomorrow));
        const sessions2 = r2 ? (JSON.parse(r2.value)||[]) : [];
        const planned = sessions2.filter(s=>s.status!=='cancelled');
        if(planned.length){
          new Notification('Judo Coach: завтра тренировка', { body: planned.map(s=>`${s.groupName||'Группа'}${s.time?', '+s.time:''}`).join('; '), icon:'./icon-192.png' });
        }
      }catch(e){}
      // Напоминание об оплате: раз в месяц, после 5-го числа, если есть должники
      const curMonth = monthKey(now);
      if(now.getDate() >= 5 && localStorage.getItem('last_payment_reminder_month') !== curMonth){
        const debtors = roster.filter(r=> debtMonthsCount(r.paid) > 0);
        if(debtors.length){
          localStorage.setItem('last_payment_reminder_month', curMonth);
          new Notification('Judo Coach: есть должники по оплате', { body: debtors.map(r=>r.name).join(', '), icon:'./icon-192.png' });
        }
      }
    }catch(e){}
  }

