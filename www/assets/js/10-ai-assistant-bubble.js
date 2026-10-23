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

  const root = document.createElement('div');
  root.id = 'mkAiFloatRoot';
  const orb = document.createElement('button');
  orb.id = 'mkAiFloatOrb'; orb.type = 'button'; orb.textContent = '🤖';
  orb.setAttribute('aria-label', 'فتح مساعد MK AI'); orb.setAttribute('aria-expanded', 'false');
  orb.title = 'اسأل MK AI عن دروسك';
  const panel = document.createElement('section');
  panel.id = 'mkAiFloatPanel'; panel.setAttribute('aria-label', 'مساعد MK AI');
  panel.innerHTML = '<header class="mk-ai-float-head"><div><div class="mk-ai-float-title">🤖 مساعد MK AI</div><div id="mkAiFloatStatus" class="mk-ai-float-status">يراجع دروسك المسجل فيها فقط</div></div><button id="mkAiFloatClose" class="mk-ai-float-close" type="button" aria-label="إغلاق">×</button></header><div id="mkAiFloatMessages" aria-live="polite"></div><form id="mkAiFloatForm"><textarea id="mkAiFloatInput" rows="2" maxlength="12000" placeholder="اسأل عن درس أو مفهوم في دوراتك..."></textarea><button id="mkAiFloatSend" type="submit">إرسال</button></form><div id="mkAiFloatNote">سياق الدروس يأتي من الخادم ويقتصر على ما سُمح لك بفتحه.</div>';
  root.append(orb, panel); document.body.appendChild(root);

  const messages = panel.querySelector('#mkAiFloatMessages');
  const input = panel.querySelector('#mkAiFloatInput');
  const send = panel.querySelector('#mkAiFloatSend');
  const status = panel.querySelector('#mkAiFloatStatus');
  let history = [], busy = false, pointer = null, dragged = false, ignoreNextClick = false;

  function role() { try { return typeof current !== 'undefined' ? String(current?.role || '') : ''; } catch { return ''; } }
  function tokenPresent() { try { return !!window.mkRuntimeGetItem?.('mk_video_jwt'); } catch { return false; } }
  function syncVisibility() { root.style.display = role() === 'student' && tokenPresent() ? '' : 'none'; if (root.style.display === 'none') closePanel(); }
  function closePanel() { panel.classList.remove('open'); orb.setAttribute('aria-expanded', 'false'); }
  function placePanel() {
    const r = orb.getBoundingClientRect(), w = Math.min(370, innerWidth - 24), h = Math.min(540, innerHeight - 32);
    const onRight = r.left + r.width / 2 > innerWidth / 2;
    panel.style.left = onRight ? 'auto' : '12px'; panel.style.right = onRight ? '12px' : 'auto';
    if (r.top > innerHeight * .55) { panel.style.bottom = `${Math.max(12, innerHeight - r.top + 10)}px`; panel.style.top = 'auto'; }
    else { panel.style.top = `${Math.min(innerHeight - h - 12, r.bottom + 10)}px`; panel.style.bottom = 'auto'; }
    panel.style.width = `${w}px`; panel.style.maxHeight = `${h}px`;
  }
  async function checkStatus() {
    if (!window.mkBackendAIStatus || !tokenPresent()) { status.textContent = 'سجّل الدخول إلى خادم المدرسة لاستخدام المساعد'; return; }
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
    placePanel(); panel.classList.add('open'); orb.setAttribute('aria-expanded', 'true');
    if (!messages.childElementCount) addMessage('assistant', 'أهلًا! أستطيع شرح الدروس المتاحة في الدورات المسجل فيها. اسألني عن درس محدد.');
    void checkStatus(); input.focus();
  }
  orb.addEventListener('pointerdown', event => { if (event.button !== undefined && event.button !== 0) return; const r = orb.getBoundingClientRect(); pointer = { id:event.pointerId, x:event.clientX, y:event.clientY, left:r.left, top:r.top }; dragged = false; orb.setPointerCapture?.(event.pointerId); });
  orb.addEventListener('pointermove', event => { if (!pointer || event.pointerId !== pointer.id) return; const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y; if (!dragged && Math.hypot(dx,dy)<7) return; dragged=true; const x=Math.max(8,Math.min(innerWidth-orb.offsetWidth-8,pointer.left+dx)),y=Math.max(8,Math.min(innerHeight-orb.offsetHeight-8,pointer.top+dy)); orb.style.left=`${x}px`;orb.style.top=`${y}px`;orb.style.right='auto';orb.style.bottom='auto';if(panel.classList.contains('open'))placePanel(); });
  orb.addEventListener('pointerup', event => { if (!pointer || event.pointerId !== pointer.id) return; const moved=dragged;pointer=null;if(moved){ignoreNextClick=true;setTimeout(()=>ignoreNextClick=false,250)}else togglePanel(); });
  orb.addEventListener('pointercancel', () => { pointer=null; });
  orb.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault();togglePanel(); } });
  panel.querySelector('#mkAiFloatClose').addEventListener('click', closePanel);
  panel.addEventListener('pointerdown',event=>event.stopPropagation());
  panel.querySelector('#mkAiFloatForm').addEventListener('submit', async event => {
    event.preventDefault(); const question=String(input.value||'').trim(); if(!question||busy)return;
    if(role()!=='student'||!tokenPresent()) { addMessage('assistant','انتهت جلسة الحساب. سجّل الدخول مرة أخرى.'); return; }
    if(typeof window.mkBackendAskAI!=='function') { addMessage('assistant','واجهة الذكاء الاصطناعي غير متاحة؛ حدّث التطبيق.'); return; }
    busy=true;send.disabled=true;input.value='';addMessage('user',question);const thinking=addMessage('assistant','جارٍ البحث في دروسك وإعداد الإجابة…','pending');
    try { const answer=await window.mkBackendAskAI(question,history);thinking.remove();if(!answer)throw new Error('لم يرجع الخادم إجابة');addMessage('assistant',answer);history.push({role:'user',text:question},{role:'assistant',text:String(answer)});history=history.slice(-10); }
    catch(error) { thinking.remove();addMessage('assistant',error?.message||'تعذر الوصول إلى الخادم الآن. حاول مرة أخرى.'); }
    finally { busy=false;send.disabled=false;input.focus(); }
  });
  input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();panel.querySelector('#mkAiFloatForm').requestSubmit();}});
  window.addEventListener('resize',()=>{if(panel.classList.contains('open'))placePanel();});
  if(document.getElementById('main'))new MutationObserver(syncVisibility).observe(document.getElementById('main'),{childList:true,subtree:true});
  setInterval(syncVisibility,700); syncVisibility();
})();
