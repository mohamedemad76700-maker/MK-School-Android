(function(){
  if(typeof navItems!=='function')return;
  window.mkOpenMessage=function(id){
    const meId=String(current?.id),m=db.messages.find(x=>String(x.id)===String(id)&&(String(x.to)===meId||String(x.from)===meId));
    if(!m)return toast('الرسالة غير موجودة');
    const incoming=String(m.to)===meId;
    if(incoming)m.read=true;
    save();
    openModal('<div class="section-head"><div><h3>✉️ '+esc(incoming?'من: '+m.fromName:'إلى: '+m.toName)+'</h3><span class="small muted">'+esc(new Date(m.date).toLocaleString('ar-EG'))+'</span></div><button class="btn" data-mk-click="closeModal()">إغلاق</button></div><div class="notice" style="white-space:pre-wrap;line-height:1.9">'+esc(m.text)+'</div>'+(incoming?'<button class="btn primary" style="margin-top:12px" data-mk-click="closeModal();mkReply(\''+String(m.from).replace(/'/g,"\\'")+'\')">↩️ رد</button>':'') );
    if(typeof renderSide==='function')renderSide();
  };
  if(typeof renderSide==='function')renderSide();
})();
