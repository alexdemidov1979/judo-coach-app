// ================= ИИ-ТРЕНЕР (YandexGPT через Yandex Cloud Functions) =================
// Важные принципы этого модуля:
// 1. Ключ YandexGPT НИКОГДА не появляется здесь — вызов идёт с сервера
//    (yandex-backend/index.js), клиент только передаёт текст сообщения.
// 2. Ученикам НЕ передаются имена и другие личные данные — только
//    агрегированные, обезличенные цифры (возраст/группа/кю/количество).
// 3. История чата хранится в базе данных сервера строго по текущему uid
//    (проверяется JWT-токеном на каждый запрос — см. requireAuth() в
//    yandex-backend/index.js).
// 4. Лимиты FREE/PRO/CLUB проверяет и учитывает ТОЛЬКО серверная функция
//    /ai/usage — клиент не может обойти лимит, даже если захочет.

(function(){
  'use strict';

  const $ = id => document.getElementById(id);

  // ---------- Системная инструкция (общая для всех режимов) ----------
  const SYSTEM_PROMPT = `Ты — опытный ассистент тренера по дзюдо и самбо (детские и взрослые группы, Россия).
Отвечай на русском языке, по существу, структурированно (списки, тайминг по блокам).

СТРОГИЕ ПРАВИЛА:
- Никогда не выдумывай техники, названия приёмов или официальные правила соревнований (ФДР/IJF), которых ты не уверен, что они существуют. Если не уверен — так и скажи: "это нужно проверить по официальным правилам/источнику", вместо того чтобы придумывать.
- Не давай медицинских диагнозов и не заменяй врача. При травмах — рекомендуй показать ребёнка врачу.
- Ты работаешь с ОБЕЗЛИЧЕННЫМИ данными: тебе не передаются имена учеников — только их количество, возраст, группа и уровень кю. Никогда не проси и не придумывай имена, фамилии или другие личные данные детей.
- Всегда учитывай возраст группы: для дошкольников (5-7 лет) — игровая форма, короткие блоки 3-7 минут; для школьников — более структурированные блоки; для взрослых — по стандартной методике.
- Учитывай этап сезона (подготовительный/предсоревновательный/соревновательный/переходный), длительность занятия и доступный инвентарь.
- Формат тренировки: разминка (warmup) / основная часть (main) / заминка (cooldown), с указанием примерного тайминга каждого блока.`;

  const MODES = {
    createWorkout:   { label: 'Создать тренировку',  starter: (ctx) => `Составь план тренировки для группы.\n\n${ctx}\n\nСформируй разминку, основную часть (с конкретными техниками/упражнениями и таймингом) и заминку.` },
    improveWorkout:  { label: 'Улучшить тренировку', starter: (ctx) => `Вот план тренировки, который я уже составил. Проанализируй и предложи, как его улучшить (баланс нагрузки, разнообразие, соответствие возрасту и этапу сезона).\n\n${ctx}` },
    analyzeWorkout:  { label: 'Анализ тренировки',   starter: (ctx) => `Проанализируй проведённую тренировку по этим данным (посещаемость, содержание). Дай выводы: что получилось, на что обратить внимание в следующий раз.\n\n${ctx}` },
    pickTechnique:   { label: 'Подобрать технику',   starter: (ctx) => `Подбери подходящие техники дзюдо/самбо под эти условия.\n\n${ctx}\n\nУкажи для каждой техники: уровень кю, на что она развивает, с чего начать разучивание.` },
    combinations:    { label: 'Комбинации',          starter: (ctx) => `Предложи связки/комбинации техник (2-3 приёма подряд) под эти условия.\n\n${ctx}\n\nОбъясни логику каждой связки (реакция соперника, куда смещается баланс).` },
    counters:        { label: 'Контрприёмы',         starter: (ctx) => `Подбери контрприёмы (котр-техники) под эти условия.\n\n${ctx}\n\nУкажи, от какой атаки защищаемся и на каком уровне кю это уместно разучивать.` },
    ofp:             { label: 'ОФП',                 starter: (ctx) => `Составь блок ОФП (общая физическая подготовка) под эти условия.\n\n${ctx}\n\nБез специфичных для дзюдо элементов — общая выносливость, координация, сила по возрасту.` },
    sfp:             { label: 'СФП',                 starter: (ctx) => `Составь блок СФП (специальная физическая подготовка для дзюдо/самбо) под эти условия.\n\n${ctx}\n\nУпражнения должны развивать именно борцовские качества: хват, устойчивость, взрывная сила бросков, страховка при падении.` },
    planning:        { label: 'Планирование',        starter: (ctx) => `Составь план тренировок на указанный период под эти условия.\n\n${ctx}\n\nРаспредели темы по занятиям логично (от простого к сложному, с повторением пройденного).` },
    chat:            { label: 'Чат',                 starter: (ctx) => ctx ? `Контекст группы:\n${ctx}\n\nЯ задам вопросы в свободной форме.` : 'Готов отвечать на вопросы по методике тренировок дзюдо/самбо.' }
  };

  let state = {
    mode: 'chat',
    chatId: null,
    messages: []        // [{role:'user'|'model', text}]
  };

  // ---------- Обезличивание: контекст группы без имён учеников ----------
  function stripNames(text, names){
    if(!text) return text;
    let out = String(text);
    names.forEach(n=>{
      if(!n || n.length < 2) return;
      const parts = n.split(/\s+/).filter(p=>p.length>1);
      parts.forEach(p=>{
        out = out.replace(new RegExp('\\b'+p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','gi'), 'ученик');
      });
    });
    return out;
  }

  async function buildGroupContext(opts){
    const groupName = opts.groupName || '';
    const roster = await getRoster();
    const names = roster.map(r=>r.name).filter(Boolean);
    const inGroup = groupName ? roster.filter(r=>String(r.trainingGroup||'').trim()===groupName) : roster;
    const kyuCounts = {};
    inGroup.forEach(r=>{ const k=r.kyu||'Без пояса'; kyuCounts[k]=(kyuCounts[k]||0)+1; });
    const groups = await getGroups();
    const g = groups.find(x=>x.name===groupName);

    // Последние тренировки этой группы за 14 дней — только структура блоков,
    // без посещаемости и имён.
    let recent = [];
    try{
      const today = new Date();
      for(let i=1;i<=14 && recent.length<5;i++){
        const d = new Date(today); d.setDate(d.getDate()-i);
        const key = `plan:${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const r = await S.get(key);
        if(!r) continue;
        const sessions = JSON.parse(r.value||'[]').filter(s=>!groupName || s.group===groupName);
        sessions.forEach(s=>{
          if(recent.length>=5) return;
          recent.push({
            date: d.toLocaleDateString('ru-RU'),
            duration: s.duration,
            warmup: stripNames(s.warmup, names).slice(0,200),
            main: stripNames(s.main, names).slice(0,300),
            cooldown: stripNames(s.cooldown, names).slice(0,150)
          });
        });
      }
    }catch(e){ console.warn('AI context: recent sessions read failed', e); }

    const lines = [];
    lines.push(`Группа: ${groupName || 'не выбрана'}${g ? ` (возраст ${g.ageMin}-${g.ageMax} лет)` : ''}`);
    lines.push(`Количество учеников в группе: ${inGroup.length}`);
    if(Object.keys(kyuCounts).length){
      lines.push('Уровень кю в группе: ' + Object.entries(kyuCounts).map(([k,c])=>`${k} — ${c}`).join(', '));
    }
    if(opts.duration) lines.push(`Длительность занятия: ${opts.duration} мин`);
    if(opts.goal) lines.push(`Цель занятия: ${opts.goal}`);
    if(opts.equipment) lines.push(`Доступный инвентарь: ${opts.equipment}`);
    if(opts.seasonStage) lines.push(`Этап сезона: ${opts.seasonStage}`);
    if(recent.length){
      lines.push('Последние тренировки этой группы:');
      recent.forEach(s=> lines.push(`— ${s.date}, ${s.duration||'?'} мин. Разминка: ${s.warmup||'—'}. Основная часть: ${s.main||'—'}. Заминка: ${s.cooldown||'—'}.`));
    }
    return lines.join('\n');
  }

  // ---------- UI ----------
  function renderModeButtons(){
    const wrap = $('ai-mode-buttons');
    if(!wrap) return;
    wrap.innerHTML = Object.entries(MODES).map(([key,m])=>
      `<button type="button" class="btn small ${state.mode===key?'gold':'ghost'}" data-ai-mode="${key}">${m.label}</button>`
    ).join('');
    wrap.querySelectorAll('[data-ai-mode]').forEach(b=>{
      b.addEventListener('click', ()=> selectMode(b.dataset.aiMode));
    });
  }

  function renderMessages(){
    const wrap = $('ai-chat-messages');
    if(!wrap) return;
    wrap.innerHTML = state.messages.map(m=>
      `<div class="ai-msg ai-msg-${m.role}"><div class="ai-msg-bubble">${escapeHtml(m.text).replace(/\n/g,'<br>')}</div></div>`
    ).join('') || '<div class="empty-hint">Выберите режим выше или напишите вопрос — начнём диалог.</div>';
    wrap.scrollTop = wrap.scrollHeight;
  }

  function escapeHtml(s){
    return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function setBusy(busy){
    const btn = $('ai-send-btn');
    if(btn){ btn.disabled = busy; btn.textContent = busy ? 'Думаю…' : 'Отправить'; }
  }

  async function selectMode(mode){
    state.mode = mode;
    renderModeButtons();
    const input = $('ai-chat-input');
    if(input && mode !== 'chat'){
      input.placeholder = 'Уточните детали (необязательно) и нажмите «Отправить»…';
    }
    // Для режимов, кроме свободного чата, сразу собираем контекст и
    // отправляем стартовый запрос — коуч может так же продолжить диалог.
    if(mode !== 'chat'){
      await sendToAi('');
    }
  }

  async function getContextOptsFromForm(){
    return {
      groupName: $('ai-ctx-group')?.value || '',
      duration: $('ai-ctx-duration')?.value || '',
      goal: $('ai-ctx-goal')?.value || '',
      equipment: $('ai-ctx-equipment')?.value || '',
      seasonStage: $('ai-ctx-season')?.value || ''
    };
  }

  async function ensureChatId(){
    const fb = window.JudoFirebase;
    if(!fb) throw new Error('Сервер ещё не готов.');
    if(!state.chatId){
      state.chatId = await fb.createAiChat(state.mode, MODES[state.mode]?.label || 'Чат');
    }
    return state.chatId;
  }

  async function sendToAi(userText){
    const fb = window.JudoFirebase;
    if(!fb || !fb.getCurrentUser()){
      alert('Сначала войдите в аккаунт, чтобы пользоваться ИИ-тренером.');
      return;
    }
    if(window.ProFeatures && !window.ProFeatures.requirePro('ИИ-тренер')) return;

    setBusy(true);
    try{
      // 1. Проверяем и учитываем лимит на сервере.
      const usage = await fb.checkAiUsage(state.mode);
      if(!usage.allowed){
        alert(`Дневной лимит запросов к ИИ-тренеру исчерпан (${usage.limit} на тариф ${usage.plan}).\nЛимит обновится завтра, либо перейдите на более высокий тариф.`);
        return;
      }

      // 2. Собираем сообщение: обезличенный контекст группы + текст коуча.
      const ctxOpts = await getContextOptsFromForm();
      const ctx = await buildGroupContext(ctxOpts);
      let fullText;
      if(userText && state.messages.length){
        fullText = userText; // продолжение диалога — контекст уже был отправлен раньше
      } else if(userText){
        fullText = MODES[state.mode].starter(ctx) + `\n\nДополнительно от тренера: ${userText}`;
      } else {
        fullText = MODES[state.mode].starter(ctx);
      }

      const chatId = await ensureChatId();
      state.messages.push({ role:'user', text: userText || `[Режим: ${MODES[state.mode].label}]` });
      renderMessages();

      // История для контекста передаётся напрямую в запрос (сервер сам
      // ведёт полную историю сообщений в базе данных).
      const history = state.messages.slice(0,-1).map(m=>({role:m.role, text:m.text}));
      const answer = await fb.sendAiMessage(chatId, SYSTEM_PROMPT, history, fullText);

      state.messages.push({ role:'model', text: answer });
      renderMessages();
    }catch(e){
      console.error('AI coach error:', e);
      state.messages.push({ role:'model', text: 'Не удалось получить ответ от ИИ. ' + (e?.message || e) });
      renderMessages();
    }finally{
      setBusy(false);
    }
  }

  function initUi(){
    renderModeButtons();
    renderMessages();
    $('ai-send-btn')?.addEventListener('click', async ()=>{
      const input = $('ai-chat-input');
      const text = (input?.value || '').trim();
      if(!text && state.messages.length) return; // пусто и уже есть диалог — нечего слать
      if(input) input.value = '';
      await sendToAi(text);
    });
    $('ai-chat-input')?.addEventListener('keydown', (e)=>{
      if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); $('ai-send-btn')?.click(); }
    });
    $('ai-new-chat')?.addEventListener('click', ()=>{
      state = { mode: state.mode, chatId: null, messages: [] };
      renderMessages();
    });
    // Заполняем выпадающий список групп в панели контекста.
    getGroups().then(groups=>{
      const sel = $('ai-ctx-group');
      if(sel) sel.innerHTML = '<option value="">— все группы —</option>' + groups.map(g=>`<option value="${g.name}">${g.name}</option>`).join('');
    });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', initUi, {once:true});
  else initUi();

  window.JudoAiCoach = { sendToAi, selectMode };
})();
