(() => {
  if (document.getElementById('mkAiFloatRoot')) return;

  const style = document.createElement('style');
  style.textContent = `
    #mkAiFloatRoot{position:fixed;z-index:1300;inset:0;pointer-events:none;direction:rtl;font-family:inherit}
    #mkAiFloatOrb{position:fixed;right:20px;bottom:calc(18px + env(safe-area-inset-bottom,0px));width:58px;height:58px;border:0;border-radius:50%;display:grid;place-items:center;color:#fff;background:linear-gradient(145deg,#675cf6,#08a9c0);box-shadow:0 8px 28px #153a6c55;font-size:25px;cursor:grab;touch-action:none;pointer-events:auto;user-select:none;-webkit-user-select:none}
    #mkAiFloatOrb:active{cursor:grabbing;transform:scale(.97)}
    #mkAiFloatPanel{position:fixed;width:min(370px,calc(100vw - 24px));max-height:min(540px,calc(100dvh - 32px));display:none;flex-direction:column;overflow:hidden;border:1px solid #d8e3f1;border-radius:18px;background:#fff;color:#16223a;box-shadow:0 18px 55px #10234538;pointer-events:auto}
    #mkAiFloatPanel.open{display:flex}
    #mkAiFloatPanel .mk-ai-float-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:linear-gradient(120deg,#f1f5ff,#e9fbfc);border-bottom:1px solid #e1e9f3}
    #mkAiFloatPanel .mk-ai-float-title{font-weight:850;font-size:15px}
    #mkAiFloatPanel .mk-ai-float-status{font-size:11px;color:#66748b;margin-top:3px}
    #mkAiFloatPanel .mk-ai-float-close{border:0;background:transparent;font-size:22px;color:#59667d;cursor:pointer;padding:2px 7px}
    #mkAiFloatMessages{min-height:130px;max-height:340px;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
    #mkAiFloatMessages .mk-ai-message{max-width:92%;padding:9px 11px;border-radius:13px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;font-size:13px}
    #mkAiFloatMessages .user{align-self:flex-start;background:#eaf0ff;color:#233f83}
    #mkAiFloatMessages .assistant{align-self:flex-end;background:#f1f5f8;color:#1f2c3c}
    #mkAiFloatMessages .pending{color:#65748a}
    #mkAiFloatForm{display:flex;gap:8px;padding:10px;border-top:1px solid #e7edf4;background:#fff}
    #mkAiFloatInput{flex:1;min-width:0;max-height:110px;resize:vertical;border:1px solid #d7e1ed;border-radius:12px;padding:9px 10px;font:inherit;font-size:13px;direction:rtl}
    #mkAiFloatSend{border:0;border-radius:12px;padding:0 14px;background:#315efb;color:#fff;font-weight:750;cursor:pointer}
    #mkAiFloatSend:disabled{opacity:.55;cursor:wait}
    #mkAiFloatNote{padding:0 12px 10px;color:#738098;font-size:10px;background:#fff}
    @media(prefers-color-scheme:dark){#mkAiFloatPanel{background:#152033;color:#eff4ff;border-color:#34435d}#mkAiFloatPanel .mk-ai-float-head{background:#1a2b45;border-color:#34435d}#mkAiFloatMessages .assistant{background:#23334c;color:#edf3ff}#mkAiFloatForm,#mkAiFloatNote{background:#152033;border-color:#34435d}#mkAiFloatInput{background:#1c2b42;color:#fff;border-color:#465876}}
  `;
  document.head.appendChild(style);

  const polish = document.createElement('style');
  polish.textContent = `
    #mkAiFloatBackdrop{position:fixed;inset:0;z-index:0;display:none;background:rgba(10,19,40,.50);backdrop-filter:blur(5px);pointer-events:auto}
    #mkAiFloatOrb{z-index:2;touch-action:none;box-shadow:0 10px 30px rgba(34,66,148,.34),0 2px 8px rgba(16,24,40,.16);transition:box-shadow .2s,transform .2s}
    #mkAiFloatOrb:hover{box-shadow:0 14px 36px rgba(34,66,148,.42),0 3px 10px rgba(16,24,40,.18)}
    #mkAiFloatPanel{z-index:1;min-height:0;transition:opacity .18s,transform .18s}
    #mkAiFloatPanel .mk-ai-float-head{padding:15px 16px;background:linear-gradient(125deg,#172554,#334ed6 58%,#087e9b);color:#fff;border:0}
    #mkAiFloatPanel .mk-ai-float-title{display:flex;align-items:center;gap:9px;font-size:16px;color:#fff}
    #mkAiFloatPanel .mk-ai-float-title::before{content:'✦';display:grid;place-items:center;width:34px;height:34px;border-radius:12px;background:#ffffff20;color:#fff;font-size:17px}
    #mkAiFloatPanel .mk-ai-float-status{color:#e3eaff;font-size:11px}
    #mkAiFloatPanel .mk-ai-float-close{width:40px;height:40px;border-radius:13px;color:#fff;background:#ffffff16;font-size:25px}
    #mkAiFloatPrompts{display:flex;gap:7px;padding:10px 12px 2px;overflow-x:auto;scrollbar-width:none}
    #mkAiFloatPrompts::-webkit-scrollbar{display:none}
    #mkAiFloatPrompts button{flex:0 0 auto;border:1px solid #e1e8f4;border-radius:999px;padding:8px 11px;background:#f7f9ff;color:#30436c;font:inherit;font-size:12px;font-weight:750;cursor:pointer}
    #mkAiFloatPrompts button:disabled{opacity:.5}
    #mkAiFloatMessages{flex:1;min-height:180px;max-height:none;padding:14px;background:linear-gradient(180deg,#fff,#f8faff)}
    #mkAiFloatMessages .mk-ai-message{max-width:min(88%,520px);padding:11px 14px;border-radius:17px;font-size:14px;line-height:1.75;box-shadow:0 2px 8px #11254b0a}
    #mkAiFloatMessages .user{border-bottom-left-radius:6px;background:#e8eeff;color:#1c3574}
    #mkAiFloatMessages .assistant{border-bottom-right-radius:6px;background:#fff;color:#18263d;border:1px solid #e8edf5}
    #mkAiFloatMessages .pending{border-style:dashed;box-shadow:none}
    #mkAiFloatForm{align-items:flex-end;padding:12px;background:#fff;padding-bottom:calc(12px + env(safe-area-inset-bottom,0px))}
    #mkAiFloatInput{min-height:48px;max-height:140px;resize:none;border-color:#d6deeb;background:#fbfcff;font-size:14px;line-height:1.55}
    #mkAiFloatInput:focus{outline:3px solid #315efb20;border-color:#315efb}
    #mkAiFloatSend{min-height:48px;padding:0 18px;background:linear-gradient(135deg,#315efb,#5847d8);box-shadow:0 5px 12px #315efb33}
    #mkAiFloatNote{padding:0 14px 10px;color:#77839a;font-size:10px}
    #mkAiFloatRoot.panel-open #mkAiFloatBackdrop{display:block}
    #mkAiFloatRoot.panel-open #mkAiFloatOrb{opacity:0;pointer-events:none}
    #mkAiFloatRoot.panel-open #mkAiFloatPanel{animation:mkAiSheetIn .2s ease-out}
    @keyframes mkAiSheetIn{from{opacity:.6;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    #main .mk-ai-card{overflow:hidden;border:1px solid #e4e9f3;border-radius:26px;padding:0;background:linear-gradient(150deg,#f7f8ff,#fff 40%,#f1fbff);box-shadow:0 18px 48px rgba(26,45,90,.09)}
    #main .mk-ai-card>.section-head{align-items:center;margin:0;padding:20px 22px;background:linear-gradient(115deg,#142354,#315efb 60%,#07879d);color:#fff}
    #main .mk-ai-card>.section-head h3{margin:0;color:#fff;font-size:21px;letter-spacing:-.3px}
    #main .mk-ai-card>.section-head .small{color:#e0e8ff!important}
    #main .mk-ai-card>.section-head .chip{border-color:#ffffff38;background:#ffffff18;color:#fff}
    #main .mk-ai-card .ai-context{margin:16px 20px 10px;padding:12px 15px;border:1px solid #dfe8fb;border-radius:16px;background:linear-gradient(120deg,#f3f6ff,#effbfc);color:#33466a;line-height:1.7}
    #main .mk-ai-card .ai-tools{display:flex;gap:8px;flex-wrap:nowrap;overflow:auto;padding:4px 20px 10px;margin:0;scrollbar-width:none}
    #main .mk-ai-card .ai-tools::-webkit-scrollbar{display:none}
    #main .mk-ai-card .ai-tools button{flex:0 0 auto;min-height:42px;border-color:#e2e8f2;background:#fff;color:#34415a;font-weight:750;box-shadow:0 2px 8px #152f6409}
    #main .mk-ai-card .ai-tools button:hover{background:#f2f6ff;border-color:#b9c9fb;transform:translateY(-1px)}
    #main .mk-ai-card .ai-shell{max-width:none;margin:0;padding:0 20px 18px;display:grid;gap:0}
    #main .mk-ai-card .ai-messages{height:min(56vh,620px);min-height:320px;max-height:none;padding:18px;border:1px solid #e4eaf3;border-radius:20px;background:linear-gradient(180deg,#fafbff,#f6faff);}
    #main .mk-ai-card .msg{max-width:min(88%,680px);padding:13px 16px;border-radius:18px;box-shadow:0 3px 12px rgba(24,42,82,.05);line-height:1.8}
    #main .mk-ai-card .msg.ai{background:#fff;border-color:#e5eaf2;border-bottom-right-radius:6px}
    #main .mk-ai-card .msg.me{border-bottom-left-radius:6px;background:linear-gradient(135deg,#315efb,#5946d5);box-shadow:0 6px 16px #315efb28}
    #main .mk-ai-card .ai-input{align-items:flex-end;position:sticky;bottom:0;padding:12px 0 0;background:linear-gradient(180deg,transparent,#fff 24%)}
    #main .mk-ai-card .ai-input textarea{min-height:54px;max-height:150px;resize:vertical;border:1px solid #d7dfec;border-radius:16px;padding:13px 15px;background:#fff;box-shadow:0 3px 12px #142b5909}
    #main .mk-ai-card .ai-input textarea:focus{outline:3px solid #315efb20;border-color:#315efb}
    #main .mk-ai-card .ai-input .btn{min-height:52px;padding-inline:20px;border-radius:15px;box-shadow:0 5px 14px #315efb2a}
    #main .mk-ai-card .ai-hint{margin:9px 0 0;color:#7a879d;font-size:11px}
    @media(max-width:680px){
      #mkAiFloatOrb{right:14px;bottom:calc(84px + env(safe-area-inset-bottom,0px));width:56px;height:56px}
      #mkAiFloatPanel,#mkAiFloatPanel.open{left:8px!important;right:8px!important;top:auto!important;bottom:calc(8px + env(safe-area-inset-bottom,0px))!important;width:auto!important;height:min(78dvh,680px);max-height:calc(100dvh - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px) - 16px)!important;border-radius:24px;box-shadow:0 25px 80px rgba(5,15,36,.3)}
      #mkAiFloatPanel .mk-ai-float-head{padding:13px 14px}
      #mkAiFloatMessages{padding:12px;min-height:0}
      #mkAiFloatForm{gap:7px;padding:10px;padding-bottom:calc(10px + env(safe-area-inset-bottom,0px))}
      #mkAiFloatInput{min-height:48px;padding:11px}
      #mkAiFloatSend{min-width:66px;padding:0 12px}
      #main .mk-ai-card{border-radius:22px;margin:0 -2px}
      #main .mk-ai-card>.section-head{align-items:flex-start;gap:8px;padding:17px 15px}
      #main .mk-ai-card>.section-head h3{font-size:18px}
      #main .mk-ai-card>.section-head .chip{font-size:10px;padding:7px 9px;white-space:normal;text-align:center}
      #main .mk-ai-card .ai-context{margin:12px 12px 8px;padding:10px 12px;font-size:13px}
      #main .mk-ai-card .ai-tools{padding:4px 12px 10px;gap:7px}
      #main .mk-ai-card .ai-tools button{min-height:40px;padding:8px 11px;font-size:12px}
      #main .mk-ai-card .ai-shell{padding:0 12px 14px}
      #main .mk-ai-card .ai-messages{height:min(49dvh,520px);min-height:250px;padding:12px;border-radius:18px}
      #main .mk-ai-card .msg{max-width:94%;padding:11px 13px;font-size:14px}
      #main .mk-ai-card .ai-input{grid-template-columns:minmax(0,1fr) 58px;gap:7px;padding-top:10px}
      #main .mk-ai-card .ai-input textarea{min-height:52px;max-height:120px;padding:11px 12px;font-size:14px}
      #main .mk-ai-card .ai-input .btn{width:58px;min-height:52px;padding:0;font-size:13px}
      #main .mk-ai-card .ai-hint{text-align:right;line-height:1.6}
    }
    @media(max-width:390px){#main .mk-ai-card>.section-head{flex-wrap:wrap}#main .mk-ai-card .ai-messages{height:min(46dvh,450px);min-height:230px}}
    @media(prefers-reduced-motion:reduce){#mkAiFloatPanel,#mkAiFloatOrb{transition:none!important}#mkAiFloatRoot.panel-open #mkAiFloatPanel{animation:none!important}}
  `;
  document.head.appendChild(polish);

  const root = document.createElement('div');
  root.id = 'mkAiFloatRoot';
  const orb = document.createElement('button');
  orb.id = 'mkAiFloatOrb'; orb.type = 'button'; orb.textContent = '🤖';
  orb.setAttribute('aria-label', 'فتح مساعد MK AI'); orb.setAttribute('aria-expanded', 'false');
  orb.title = 'اسأل MK AI عن دروسك';
  const panel = document.createElement('section');
  panel.id = 'mkAiFloatPanel'; panel.setAttribute('aria-label', 'مساعد MK AI');
  panel.innerHTML = '<header class="mk-ai-float-head"><div><div class="mk-ai-float-title">مساعد MK AI</div><div id="mkAiFloatStatus" class="mk-ai-float-status">يشرح محتوى الدروس المسجل فيها</div></div><button id="mkAiFloatClose" class="mk-ai-float-close" type="button" aria-label="إغلاق">×</button></header><div id="mkAiFloatPrompts" aria-label="أسئلة سريعة"><button type="button">اشرح لي هذا الدرس ببساطة</button><button type="button">اعطني مثالًا محلولًا</button><button type="button">اختبرني في درس اليوم</button></div><div id="mkAiFloatMessages" aria-live="polite"></div><form id="mkAiFloatForm"><textarea id="mkAiFloatInput" rows="2" maxlength="12000" placeholder="اسأل عن درس أو مفهوم في دورتك..."></textarea><button id="mkAiFloatSend" type="submit">إرسال</button></form><div id="mkAiFloatNote">يعتمد الشرح على الدروس التي يتيحها الخادم لحسابك.</div>';
  const backdrop=document.createElement('button');backdrop.id='mkAiFloatBackdrop';backdrop.type='button';backdrop.setAttribute('aria-label','إغلاق المساعد');backdrop.tabIndex=-1;
  root.append(backdrop,orb,panel); document.body.appendChild(root);

  const messages = panel.querySelector('#mkAiFloatMessages');
  const input = panel.querySelector('#mkAiFloatInput');
  const send = panel.querySelector('#mkAiFloatSend');
  const status = panel.querySelector('#mkAiFloatStatus');
  let history = [], busy = false, pointer = null, dragged = false, ignoreNextClick = false;

  function role() { try { return typeof current !== 'undefined' ? String(current?.role || '') : ''; } catch { return ''; } }
  function tokenPresent() { try { return !!window.mkRuntimeGetItem?.('mk_video_jwt'); } catch { return false; } }
  function syncVisibility() { const fullPageAI=!!document.getElementById('aiMessages');root.style.display = role() === 'student' && tokenPresent()&&!fullPageAI ? '' : 'none'; if (root.style.display === 'none') closePanel(); }
  function closePanel() { panel.classList.remove('open');root.classList.remove('panel-open');orb.setAttribute('aria-expanded', 'false');document.body.classList.remove('mk-ai-open'); }
  function placePanel() {
    if(matchMedia('(max-width:680px)').matches){panel.style.left='';panel.style.right='';panel.style.top='';panel.style.bottom='';panel.style.width='';panel.style.maxHeight='';return;}
    const r = orb.getBoundingClientRect(), w = Math.min(370, innerWidth - 24), h = Math.min(540, innerHeight - 32);
    const onRight = r.left + r.width / 2 > innerWidth / 2;
    panel.style.left = onRight ? 'auto' : '12px'; panel.style.right = onRight ? '12px' : 'auto';
    if (r.top > innerHeight * .55) { panel.style.bottom = `${Math.max(12, innerHeight - r.top + 10)}px`; panel.style.top = 'auto'; }
    else { panel.style.top = `${Math.min(innerHeight - h - 12, r.bottom + 10)}px`; panel.style.bottom = 'auto'; }
    panel.style.width = `${w}px`; panel.style.maxHeight = `${h}px`;
  }
  async function checkStatus() {
    if (!window.mkBackendAIStatus || !tokenPresent()) { status.textContent = 'سجّل الدخول إلى خادم المنصة لاستخدام المساعد'; return; }
    status.textContent = 'جارٍ فحص خدمة الذكاء الاصطناعي…';
    try { const result = await window.mkBackendAIStatus(); status.textContent = result.configured ? 'جاهز • يعتمد على دروسك المسجل فيها' : 'مفتاح الخدمة غير مضبوط على الخادم'; }
    catch { status.textContent = 'تعذر الاتصال بخدمة الذكاء الاصطناعي'; }
  }
  function addMessage(who, text, className = '') {
    const node = document.createElement('div'); node.className = `mk-ai-message ${who} ${className}`.trim(); node.textContent = String(text || ''); messages.appendChild(node); messages.scrollTop = messages.scrollHeight; return node;
  }
  function togglePanel() {
    const open = !panel.classList.contains('open');
    if (!open) return closePanel();
    placePanel(); panel.classList.add('open');root.classList.add('panel-open');document.body.classList.add('mk-ai-open');orb.setAttribute('aria-expanded', 'true');
    if (!messages.childElementCount) {history=(window.aiLoadHistory?.()||[]).filter(item=>item&&['user','assistant'].includes(item.role)).slice(-10).map(item=>({role:item.role,text:String(item.text||'')}));if(history.length)history.forEach(item=>addMessage(item.role==='user'?'user':'assistant',item.text));else addMessage('assistant', 'أهلًا! اسألني عن درس من الدورات التي اشتركت فيها، وسأشرحه بخطوات واضحة.');}
    void checkStatus(); input.focus();
  }
  orb.addEventListener('pointerdown', event => { if (event.button !== undefined && event.button !== 0) return; const r = orb.getBoundingClientRect(); pointer = { id:event.pointerId, x:event.clientX, y:event.clientY, left:r.left, top:r.top }; dragged = false; orb.setPointerCapture?.(event.pointerId); });
  orb.addEventListener('pointermove', event => { if (!pointer || event.pointerId !== pointer.id) return; const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y; if (!dragged && Math.hypot(dx,dy)<7) return; dragged=true; const x=Math.max(8,Math.min(innerWidth-orb.offsetWidth-8,pointer.left+dx)),y=Math.max(8,Math.min(innerHeight-orb.offsetHeight-8,pointer.top+dy)); orb.style.left=`${x}px`;orb.style.top=`${y}px`;orb.style.right='auto';orb.style.bottom='auto';if(panel.classList.contains('open'))placePanel(); });
  orb.addEventListener('pointerup', event => { if (!pointer || event.pointerId !== pointer.id) return; const moved=dragged;pointer=null;if(moved){ignoreNextClick=true;setTimeout(()=>ignoreNextClick=false,250)}else togglePanel(); });
  orb.addEventListener('pointercancel', () => { pointer=null; });
  orb.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault();togglePanel(); } });
  panel.querySelector('#mkAiFloatClose').addEventListener('click', closePanel);
  backdrop.addEventListener('click',closePanel);
  panel.querySelector('#mkAiFloatPrompts').addEventListener('click',event=>{const button=event.target.closest('button');if(!button||busy)return;input.value=button.textContent.trim();panel.querySelector('#mkAiFloatForm').requestSubmit();});
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&panel.classList.contains('open'))closePanel();});
  panel.addEventListener('pointerdown',event=>event.stopPropagation());
  panel.querySelector('#mkAiFloatForm').addEventListener('submit', async event => {
    event.preventDefault(); const question=String(input.value||'').trim(); if(!question||busy)return;
    if(role()!=='student'||!tokenPresent()) { addMessage('assistant','انتهت جلسة الحساب. سجّل الدخول مرة أخرى.'); return; }
    if(typeof window.mkBackendAskAI!=='function') { addMessage('assistant','واجهة الذكاء الاصطناعي غير متاحة؛ حدّث التطبيق.'); return; }
    busy=true;send.disabled=true;panel.querySelectorAll('#mkAiFloatPrompts button').forEach(button=>button.disabled=true);input.value='';addMessage('user',question);history.push({role:'user',text:question});history=history.slice(-10);window.aiSaveHistory?.(history);const thinking=addMessage('assistant','أبحث في الدروس وأجهز لك إجابة…','pending');
    try { const answer=await window.mkBackendAskAI(question,history.slice(0,-1));thinking.remove();if(!answer)throw new Error('لم يرجع الخادم إجابة');addMessage('assistant',answer);history.push({role:'assistant',text:String(answer)});history=history.slice(-10);window.aiSaveHistory?.(history); }
    catch(error) { thinking.remove();addMessage('assistant',error?.message||'تعذر الوصول إلى الخادم الآن. حاول مرة أخرى.'); }
    finally { busy=false;send.disabled=false;panel.querySelectorAll('#mkAiFloatPrompts button').forEach(button=>button.disabled=false);input.focus(); }
  });
  input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();panel.querySelector('#mkAiFloatForm').requestSubmit();}});
  window.addEventListener('resize',()=>{if(panel.classList.contains('open'))placePanel();});window.visualViewport?.addEventListener('resize',()=>{if(panel.classList.contains('open'))placePanel();});
  if(document.getElementById('main'))new MutationObserver(syncVisibility).observe(document.getElementById('main'),{childList:true,subtree:true});
  setInterval(syncVisibility,700); syncVisibility();
})();
