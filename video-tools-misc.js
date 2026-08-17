  // ================= РАЗБОР ВИДЕО: рисование + голос поверх =================
  (function initVideoReview(){
    const fab = document.getElementById('video-review-fab');
    const modal = document.getElementById('video-review-modal');
    const closeBtn = document.getElementById('vr-close');
    const fileInput = document.getElementById('vr-file-input');
    const uploadScreen = document.getElementById('vr-upload-screen');
    const workScreen = document.getElementById('vr-work-screen');
    const video = document.getElementById('vr-video');
    const canvas = document.getElementById('vr-canvas');
    const ctx = canvas.getContext('2d');
    const playBtn = document.getElementById('vr-play');
    const clearBtn = document.getElementById('vr-clear');
    const recordBtn = document.getElementById('vr-record');
    const statusEl = document.getElementById('vr-status');
    const resultBox = document.getElementById('vr-result');
    const resultVideo = document.getElementById('vr-result-video');
    const downloadLink = document.getElementById('vr-download');

    let strokes = [];
    let currentStroke = null;
    let currentColor = '#ff3b30';
    let isOpen = false;
    let isDrawing = false;
    let sourceUrl = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let micStream = null;

    fab.addEventListener('click', ()=>{
      modal.style.display = 'flex';
      isOpen = true;
    });
    function closeModal(){
      isOpen = false;
      modal.style.display = 'none';
      video.pause();
      if(sourceUrl){ URL.revokeObjectURL(sourceUrl); sourceUrl = null; }
      if(micStream){ micStream.getTracks().forEach(t=>t.stop()); micStream = null; }
      strokes = []; currentStroke = null;
      uploadScreen.style.display = 'flex';
      workScreen.style.display = 'none';
      resultBox.style.display = 'none';
      fileInput.value = '';
    }
    closeBtn.addEventListener('click', closeModal);

    fileInput.addEventListener('change', (e)=>{
      const file = e.target.files[0];
      if(!file) return;
      statusEl.textContent = 'Загружаю видео…';
      sourceUrl = URL.createObjectURL(file);
      video.src = sourceUrl;
      video.muted = false;
      const loadTimeout = setTimeout(()=>{
        statusEl.textContent = 'Видео долго не загружается. Возможно, формат файла не поддерживается — попробуйте другой файл (MP4, H.264).';
      }, 8000);
      video.addEventListener('error', function onErr(){
        clearTimeout(loadTimeout);
        video.removeEventListener('error', onErr);
        const codeMap = {1:'загрузка прервана',2:'ошибка сети',3:'не удалось декодировать (формат/кодек не поддерживается)',4:'формат файла не поддерживается'};
        const code = video.error ? video.error.code : 0;
        statusEl.textContent = 'Не удалось загрузить видео: ' + (codeMap[code] || 'неизвестная ошибка') + '. Попробуйте файл в формате MP4 (H.264).';
      }, {once:true});
      video.addEventListener('loadedmetadata', function onMeta(){
        clearTimeout(loadTimeout);
        video.removeEventListener('loadedmetadata', onMeta);
        statusEl.textContent = '';
        const maxW = 960;
        const scale = video.videoWidth > maxW ? maxW / video.videoWidth : 1;
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        uploadScreen.style.display = 'none';
        workScreen.style.display = 'flex';
        strokes = [];
        drawLoop();
      }, {once:true});
    });

    function drawLoop(){
      if(!isOpen) return;
      if(video.readyState >= 2){
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        strokes.forEach(s=>{
          if(s.points.length < 2) return;
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 4;
          ctx.lineJoin = 'round'; ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(s.points[0].x, s.points[0].y);
          for(let i=1;i<s.points.length;i++) ctx.lineTo(s.points[i].x, s.points[i].y);
          ctx.stroke();
        });
      }
      requestAnimationFrame(drawLoop);
    }

    function canvasPoint(ev){
      const rect = canvas.getBoundingClientRect();
      const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
      const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
      return {x, y};
    }
    canvas.addEventListener('pointerdown', (ev)=>{
      isDrawing = true;
      currentStroke = {color: currentColor, points:[canvasPoint(ev)]};
      strokes.push(currentStroke);
    });
    canvas.addEventListener('pointermove', (ev)=>{
      if(!isDrawing || !currentStroke) return;
      currentStroke.points.push(canvasPoint(ev));
    });
    ['pointerup','pointerleave','pointercancel'].forEach(evName=>{
      canvas.addEventListener(evName, ()=>{ isDrawing = false; currentStroke = null; });
    });

    document.querySelectorAll('#vr-work-screen [data-color]').forEach(b=>{
      b.addEventListener('click', ()=> currentColor = b.dataset.color);
    });
    clearBtn.addEventListener('click', ()=>{ strokes = []; });
    playBtn.addEventListener('click', ()=>{
      if(video.paused){ video.play(); playBtn.textContent = '⏸ Пауза'; }
      else { video.pause(); playBtn.textContent = '▶ Пуск'; }
    });
    video.addEventListener('ended', ()=>{
      playBtn.textContent = '▶ Пуск';
      if(mediaRecorder && mediaRecorder.state === 'recording') stopRecording();
    });

    async function saveVideoToPhone(blob, fileName){
      const safeName = String(fileName || 'razbor-video.webm').replace(/[^a-zA-Z0-9а-яА-Я._-]+/g,'_');
      // Native Capacitor: save the produced video into the app's Documents directory.
      try{
        const cap=window.Capacitor;
        const fs=cap?.Plugins?.Filesystem;
        if(cap?.isNativePlatform?.() && fs){
          const bytes=new Uint8Array(await blob.arrayBuffer());
          let binary=''; const chunk=0x8000;
          for(let i=0;i<bytes.length;i+=chunk) binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
          const base64=btoa(binary);
          const result=await fs.writeFile({path:safeName,data:base64,directory:'DOCUMENTS',recursive:true});
          const uri=await fs.getUri({path:safeName,directory:'DOCUMENTS'});
          // Share sheet lets the user save to Gallery/Files/Downloads depending on device.
          const share=cap?.Plugins?.Share;
          if(share?.share && uri?.uri){
            try{ await share.share({title:'Разбор схватки',text:'Judo Coach — видеоразбор',url:uri.uri,dialogTitle:'Сохранить видео на телефоне'}); }catch(e){}
          }
          return {native:true,uri:uri?.uri||result?.uri||''};
        }
      }catch(e){ console.warn('Native video save failed, using browser download:',e); }
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=url; a.download=safeName; a.rel='noopener'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
      return {native:false,url};
    }

    async function startRecording(){
      try{
        micStream = await navigator.mediaDevices.getUserMedia({audio:true});
      }catch(e){
        statusEl.textContent = 'Не удалось получить доступ к микрофону: ' + e.message;
        return;
      }
      const canvasStream = canvas.captureStream(30);
      const combined = new MediaStream([...canvasStream.getVideoTracks(), ...micStream.getAudioTracks()]);
      let mimeType = 'video/webm;codecs=vp8,opus';
      if(!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';
      recordedChunks = [];
      mediaRecorder = new MediaRecorder(combined, {mimeType});
      mediaRecorder.ondataavailable = (e)=>{ if(e.data.size>0) recordedChunks.push(e.data); };
      mediaRecorder.onstop = ()=>{
        const blob = new Blob(recordedChunks, {type:'video/webm'});
        const url = URL.createObjectURL(blob);
        resultVideo.src = url;
        downloadLink.href = url;
        downloadLink.download = `razbor-${new Date().toISOString().slice(0,10)}.webm`;
        downloadLink.textContent = '📱 Сохранить видео на телефон';
        downloadLink.onclick = async (ev)=>{
          ev.preventDefault();
          statusEl.textContent='Сохраняем видео на телефон…';
          const saved=await saveVideoToPhone(blob, downloadLink.download);
          statusEl.textContent=saved.native ? 'Видео сохранено в документы телефона. При необходимости выберите Галерею/Файлы в окне сохранения.' : 'Видео сохранено через загрузку браузера.';
        };
        resultBox.style.display = 'block';
        statusEl.textContent = 'Готово! Нажмите «Сохранить видео на телефон».';
        if(micStream){ micStream.getTracks().forEach(t=>t.stop()); micStream = null; }
      };
      video.currentTime = 0;
      video.play();
      playBtn.textContent = '⏸ Пауза';
      mediaRecorder.start();
      recordBtn.textContent = '⏹ Остановить запись';
      statusEl.textContent = '● Идёт запись — говорите и рисуйте поверх видео...';
    }
    function stopRecording(){
      if(mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
      recordBtn.textContent = '🎙 Записать разбор (видео + голос)';
      video.pause();
    }
    recordBtn.addEventListener('click', ()=>{
      if(mediaRecorder && mediaRecorder.state === 'recording') stopRecording();
      else startRecording();
    });
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

