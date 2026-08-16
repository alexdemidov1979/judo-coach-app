// ================= JUDO KNOWLEDGE GRAPH =================
// Phase 4: связывает существующие данные техники в навигационную карту.
// Не добавляет непроверенных федеративных требований: использует только данные
// существующей библиотеки и явно помечает тип связи.
(function(){
  'use strict';

  const esc = (v) => typeof escapeHtml === 'function' ? escapeHtml(v == null ? '' : String(v)) : String(v == null ? '' : v).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function techniqueByName(name){
    const details = window.JUDO_TECH_DETAILS || {};
    const terminology = window.JUDO_TERMINOLOGY_TECHNIQUES || [];
    const it = terminology.find(x=>x.romaji===name);
    return { name, item:it || null, detail:details[name] || null };
  }

  function node(id, type, label, meta={}){ return {id, type, label, ...meta}; }
  function edge(from, to, type, label){ return {from, to, type, label}; }

  function buildGraph(name){
    const {item, detail} = techniqueByName(name);
    const nodes=[node('tech','technique',name,{jp:item?.jp||'',ru:item?.ru_term||''})];
    const edges=[];
    if(!detail){
      return {nodes, edges};
    }

    (detail.related||[]).forEach((r,i)=>{
      const id=`related:${r}:${i}`;
      nodes.push(node(id,'technique',r));
      edges.push(edge('tech',id,'related','Связанная техника'));
    });
    (detail.combos||[]).forEach((text,i)=>{
      const id=`combo:${i}`;
      nodes.push(node(id,'combination',text));
      edges.push(edge('tech',id,'combination','Комбинация'));
    });
    (detail.counters||[]).forEach((text,i)=>{
      const id=`counter:${i}`;
      nodes.push(node(id,'counter',text));
      edges.push(edge(id,'tech','counter','Контрприём / защита'));
    });
    (detail.mistakes||[]).forEach((text,i)=>{
      const id=`mistake:${i}`;
      nodes.push(node(id,'mistake',text));
      edges.push(edge('tech',id,'mistake','Типичная ошибка'));
    });
    (detail.stages||[]).forEach((text,i)=>{
      const id=`stage:${i}`;
      nodes.push(node(id,'stage',text));
      edges.push(edge('tech',id,'stage',`Этап ${i+1}`));
    });

    return {nodes, edges};
  }

  function badge(type){
    return ({technique:'🥋',combination:'🔗',counter:'🛡️',mistake:'⚠️',stage:'1️⃣'})[type] || '•';
  }

  function openKnowledgeGraph(name){
    if(window.ProFeatures && !window.ProFeatures.requirePro('Видео-библиотека техник')) return;
    const modal=document.getElementById('knowledge-graph-modal');
    const title=document.getElementById('kg-title');
    const body=document.getElementById('kg-body');
    if(!modal||!body) return;
    const {item,detail}=techniqueByName(name);
    const graph=buildGraph(name);
    if(title) title.textContent=`🥋 ${name}${item?.jp ? ' · '+item.jp : ''}`;
    if(!detail){
      body.innerHTML='<div class="empty-hint">Для этой техники пока недостаточно связанных данных для построения карты.</div>';
    } else {
      const groups=[
        ['stage','Как выполняется'],
        ['mistake','Типичные ошибки'],
        ['combination','Комбинации'],
        ['counter','Контрприёмы / защита'],
        ['technique','Связанные техники']
      ];
      body.innerHTML=`<div class="kg-intro">${esc(detail.desc||'')} </div>`+
        groups.map(([type,label])=>{
          const ns=graph.nodes.filter(n=>n.type===type && n.id!=='tech');
          if(type==='technique' && ns.length===0) return '';
          if(!ns.length) return '';
          return `<section class="kg-group"><h4>${label}</h4><div class="kg-list">${ns.map(n=>`<div class="kg-node kg-${type}"><span class="kg-badge">${badge(type)}</span><span>${esc(n.label)}</span></div>`).join('')}</div></section>`;
        }).join('')+
        `<div class="kg-footer">Карта строится из существующих данных библиотеки Judo Coach. Связи не заменяют методические рекомендации тренера.</div>`;
    }
    modal.classList.add('open');
    document.body.classList.add('modal-open');
  }

  function closeKnowledgeGraph(){
    const modal=document.getElementById('knowledge-graph-modal');
    if(modal) modal.classList.remove('open');
    document.body.classList.remove('modal-open');
  }

  function injectButtons(){
    document.querySelectorAll('.tech-detail[data-romaji]').forEach(detail=>{
      if(detail.querySelector('[data-open-knowledge-graph]')) return;
      const name=detail.dataset.romaji;
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='btn ghost small kg-open-btn';
      btn.dataset.openKnowledgeGraph=name;
      btn.textContent='🧠 Карта техники';
      btn.addEventListener('click',e=>{ e.stopPropagation(); openKnowledgeGraph(name); });
      detail.appendChild(btn);
    });
  }

  window.openJudoKnowledgeGraph=openKnowledgeGraph;
  window.closeJudoKnowledgeGraph=closeKnowledgeGraph;
  window.buildJudoKnowledgeGraph=buildGraph;

  window.addEventListener('DOMContentLoaded',()=>{
    document.getElementById('kg-close')?.addEventListener('click',closeKnowledgeGraph);
    document.getElementById('knowledge-graph-modal')?.addEventListener('click',e=>{if(e.target.id==='knowledge-graph-modal') closeKnowledgeGraph();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape') closeKnowledgeGraph();});
    document.addEventListener('click',e=>{
      const btn=e.target.closest('[data-open-knowledge-graph]');
      if(btn){ e.preventDefault(); e.stopPropagation(); openKnowledgeGraph(btn.dataset.openKnowledgeGraph); }
    }, true);
    const obs=new MutationObserver(()=>injectButtons());
    obs.observe(document.body,{childList:true,subtree:true});
    injectButtons();
  });
})();
