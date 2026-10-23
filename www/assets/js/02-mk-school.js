(function(){
  if(typeof current==='undefined' || typeof db==='undefined') return;
  db.notifications=Array.isArray(db.notifications)?db.notifications:[];
  db.messages=Array.isArray(db.messages)?db.messages:[];
  db.announcements=Array.isArray(db.announcements)?db.announcements:[];
  db.certificates=Array.isArray(db.certificates)?db.certificates:[];
  const roleOf=x=>{
    if(!x)return '';
    if(String(x.id)==='admin')return 'admin';
    if((db.students||[]).some(t=>String(t.id)===String(x.id)))return 'student';
    if((db.parents||[]).some(t=>String(t.id)===String(x.id)))return 'parent';
    return String(x.role||'').toLowerCase();
  };
  function actors(){
    const raw=[db.users&&db.users.admin,...(db.students||[]),...(db.parents||[])];
    const seen=new Set();
    return raw.filter(x=>x&&x.id&&x.active!==false).map(x=>({...x,role:roleOf(x)})).filter(x=>{const k=String(x.id);if(seen.has(k))return false;seen.add(k);return true});
  }
  function getActor(id){return actors().find(x=>String(x.id)===String(id))||null}
  function notify(id,title,body,extra={}){
    if(!id)return;
    db.notifications.push({id:(typeof uid==='function'?uid('n'):'n-'+Date.now()+Math.random()),to:String(id),title:String(title||'تنبيه'),body:String(body||''),date:new Date().toISOString(),read:false,...extra});
  }
  window.mkDeleteCertificate=function(id){
    if(!current || String(current.id)!=='admin') return toast('حذف الشهادة متاح للإدارة فقط');
    const c=db.certificates.find(x=>String(x.id)===String(id));
    if(!c)return toast('الشهادة غير موجودة');
    if(!confirm('هل تريد حذف هذه الشهادة نهائيًا؟'))return;
    db.certificates=db.certificates.filter(x=>String(x.id)!==String(id));
    save(); renderPage(); toast('تم حذف الشهادة بنجاح');
  };
  window.mkCertificateDetails=function(id){
    const c=db.certificates.find(x=>String(x.id)===String(id));
    if(!c)return toast('الشهادة غير موجودة');
    openModal('<div class="section-head"><div><h3>🏅 '+esc(c.title||'شهادة')+'</h3><span class="small muted">'+esc(c.studentName||'')+' • '+esc(c.date||'')+'</span></div><button class="btn" data-mk-click="closeModal()">إغلاق</button></div><div class="grade-banner"><b>الطالب:</b> '+esc(c.studentName||'')+'<br><b>التاريخ:</b> '+esc(c.date||'')+'</div><div class="row" style="margin-top:14px;gap:8px"><button class="btn primary" data-mk-click="closeModal();printCertificate(\''+String(c.id).replace(/'/g,"\\'")+'\')">🖨️ طباعة</button>'+(String(current?.id)==='admin'?'<button class="btn danger" data-mk-click="closeModal();mkDeleteCertificate(\''+String(c.id).replace(/'/g,"\\'")+'\')">🗑️ حذف الشهادة</button>':'')+'</div>');
  };
  pages.certificates=function(){
    const admin=String(current?.id)==='admin';
    const arr=admin?db.certificates:db.certificates.filter(c=>String(c.student)===String(current?.id));
    return '<div class="grid"><div class="card"><div class="section-head"><div><h3>🏅 '+(admin?'إدارة الشهادات':'شهاداتي')+'</h3><span class="small muted">'+(admin?'إصدار ومراجعة وحذف شهادات الطلاب.':'الشهادات الصادرة لك محفوظة هنا.')+'</span></div>'+(admin?'<button class="btn primary" data-mk-click="certificateModal()">+ إصدار شهادة</button>':'')+'</div><div class="quick-grid">'+(arr.map(c=>'<div class="quick" style="text-align:right"><div style="font-size:42px">🏅</div><b>'+esc(c.title||'شهادة')+'</b><span class="small muted">'+esc(c.studentName||'')+' • '+esc(c.date||'')+'</span><div class="row" style="margin-top:10px;gap:7px"><button class="btn" data-mk-click="mkCertificateDetails(\''+String(c.id).replace(/'/g,"\\'")+'\')">عرض</button><button class="btn" data-mk-click="printCertificate(\''+String(c.id).replace(/'/g,"\\'")+'\')">طباعة</button>'+(admin?'<button class="btn danger" data-mk-click="mkDeleteCertificate(\''+String(c.id).replace(/'/g,"\\'")+'\')">🗑️ حذف</button>':'')+'</div></div>').join('')||'<div class="empty" style="grid-column:1/-1">لا توجد شهادات.</div>')+'</div></div></div>';
  };
  // Robust announcements: store audience and only show announcements to their intended audience.
  window.mkCreateAnnouncement=function(e){
    e.preventDefault(); if(String(current?.id)!=='admin')return forbidden();
    const title=document.getElementById('annTitle')?.value.trim(), body=document.getElementById('annBody')?.value.trim(), audience=document.getElementById('annAudience')?.value||'all';
    if(!title||!body)return toast('اكتب عنوان الإعلان ونصه');
    const a={id:(typeof uid==='function'?uid('a'):'a-'+Date.now()),title,body,audience,date:new Date().toISOString(),author:'admin'};
    db.announcements.push(a);
    actors().filter(x=>String(x.id)!=='admin'&&(audience==='all'||roleOf(x)===audience)).forEach(x=>notify(x.id,'إعلان جديد: '+title,body,{announcementId:a.id}));
    save(); audit('announcement_create',title); closeModal(); showPage('announcements'); toast('تم نشر الإعلان وإرسال التنبيهات');
  };
  pages.announcements=function(){
    const admin=String(current?.id)==='admin', role=roleOf(current), arr=db.announcements.filter(a=>admin||!a.audience||a.audience==='all'||a.audience===role).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    return '<div class="grid"><div class="card"><div class="section-head"><div><h3>📢 الإعلانات</h3><span class="small muted">'+(admin?'إنشاء إعلانات وإرسال تنبيهات للفئة المحددة.':'الإعلانات الموجهة إلى حسابك.')+'</span></div>'+(admin?'<button class="btn primary" data-mk-click="mkAnnouncementModal()">+ إعلان جديد</button>':'')+'</div><div class="list">'+(arr.map(a=>'<div class="list-item"><div class="section-head"><div><b>'+esc(a.title)+'</b><div class="small muted">'+esc(new Date(a.date).toLocaleString('ar-EG'))+'</div></div>'+(admin?'<button class="btn danger" data-mk-click="mkDeleteAnnouncement(\''+String(a.id).replace(/'/g,"\\'")+'\')">حذف</button>':'')+'</div><div style="line-height:1.9;white-space:pre-wrap">'+esc(a.body)+'</div></div>').join('')||'<div class="empty">لا توجد إعلانات حاليًا.</div>')+'</div></div></div>';
  };
  // Robust message composer: no reliance on browser-created global variables for form fields.
  window.mkSendMessage=function(e){
    e.preventDefault();
    const toId=document.getElementById('mkMsgTo')?.value, text=document.getElementById('mkMsgText')?.value.trim(), to=getActor(toId), from=getActor(current?.id);
    if(!to)return toast('المستلم غير موجود'); if(!text)return toast('اكتب الرسالة');
    const m={id:(typeof uid==='function'?uid('m'):'m-'+Date.now()),from:String(current.id),fromName:from?.name||'مستخدم',fromRole:roleOf(from),to:String(to.id),toName:to.name||'',toRole:roleOf(to),text,date:new Date().toISOString(),read:false};
    db.messages.push(m); notify(to.id,'رسالة جديدة','لديك رسالة جديدة من '+(from?.name||'مستخدم'),{messageId:m.id}); save(); closeModal(); showPage('messages'); toast('تم إرسال الرسالة بنجاح');
  };
  window.mkSendReply=function(e,toId){
    e.preventDefault(); const to=getActor(toId), from=getActor(current?.id), text=document.getElementById('mkReplyText')?.value.trim();
    if(!to||!text)return toast('اكتب الرد');
    const m={id:(typeof uid==='function'?uid('m'):'m-'+Date.now()),from:String(current.id),fromName:from?.name||'',fromRole:roleOf(from),to:String(to.id),toName:to.name||'',toRole:roleOf(to),text,date:new Date().toISOString(),read:false};
    db.messages.push(m); notify(to.id,'رسالة جديدة','رد جديد من '+(from?.name||'مستخدم'),{messageId:m.id}); save(); closeModal(); showPage('messages'); toast('تم إرسال الرد');
  };
  pages.messages=function(){
    const meId=String(current.id), inbox=db.messages.filter(m=>String(m.to)===meId).sort((a,b)=>String(b.date).localeCompare(String(a.date))), sent=db.messages.filter(m=>String(m.from)===meId).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    const row=m=>'<div class="list-item" style="cursor:pointer" data-mk-click="mkOpenMessage(\''+String(m.id).replace(/'/g,"\\'")+'\')"><div class="section-head"><div><b>'+esc(String(m.from)===meId?'إلى: '+m.toName:'من: '+m.fromName)+'</b><div class="small muted">'+esc(new Date(m.date).toLocaleString('ar-EG'))+'</div></div>'+(String(m.from)!==meId&&!m.read?'<span class="chip warn">جديدة</span>':'')+'</div><div class="small">'+esc(m.text).slice(0,180)+'</div></div>';
    const users=actors().filter(x=>String(x.id)!==meId);
    return '<div class="grid"><div class="card"><div class="section-head"><div><h3>✉️ الرسائل</h3><span class="small muted">إرسال واستقبال وحفظ الرسائل.</span></div><button class="btn primary" data-mk-click="mkMessageModal()">+ رسالة جديدة</button></div><h4>📥 الوارد ('+inbox.length+')</h4><div class="list">'+(inbox.map(row).join('')||'<div class="empty">لا توجد رسائل واردة.</div>')+'</div><h4 style="margin-top:24px">📤 المرسل ('+sent.length+')</h4><div class="list">'+(sent.map(row).join('')||'<div class="empty">لا توجد رسائل مرسلة.</div>')+'</div></div></div>';
  };
  window.mkMessageModal=function(){
    const users=actors().filter(x=>String(x.id)!==String(current.id));
    if(!users.length)return toast('لا يوجد مستخدمون متاحون للمراسلة');
    openModal('<h3>✉️ رسالة جديدة</h3><form data-mk-submit="mkSendMessage(event)"><div class="field"><label>إلى</label><select id="mkMsgTo" required>'+users.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name||x.email||x.id)+' — '+esc({admin:'مدير',student:'طالب',parent:'ولي أمر'}[roleOf(x)]||'مستخدم')+'</option>').join('')+'</select></div><div class="field"><label>الرسالة</label><textarea id="mkMsgText" rows="6" required></textarea></div><button class="btn primary">إرسال الرسالة</button></form>');
  };
  pages.notifications=function(){
    const arr=db.notifications.filter(n=>String(n.to)===String(current.id)).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    return '<div class="grid"><div class="card"><div class="section-head"><div><h3>🔔 التنبيهات</h3><span class="small muted">كل التنبيهات الواردة إلى حسابك محفوظة هنا.</span></div><div class="row" style="gap:8px">'+(String(current.id)==='admin'?'<button class="btn primary" data-mk-click="mkNotificationModal()">+ إرسال تنبيه</button>':'')+'<button class="btn" data-mk-click="mkMarkAllNotifications()">تعليم الكل كمقروء</button></div></div><div class="list">'+(arr.map(n=>'<div class="list-item" style="cursor:pointer;border-right:4px solid '+(n.read?'#d1d5db':'#315efb')+'" data-mk-click="mkOpenNotification(\''+String(n.id).replace(/'/g,"\\'")+'\')"><div class="section-head"><div><b>'+esc(n.title)+'</b><div class="small muted">'+esc(new Date(n.date).toLocaleString('ar-EG'))+'</div></div>'+(!n.read?'<span class="chip warn">جديد</span>':'')+'</div><div class="small">'+esc(n.body).slice(0,180)+'</div></div>').join('')||'<div class="empty">لا توجد تنبيهات حاليًا.</div>')+'</div></div></div>';
  };
  window.mkNotificationModal=function(){
    if(String(current?.id)!=='admin')return forbidden(); const users=actors().filter(x=>String(x.id)!=='admin');
    openModal('<h3>🔔 إرسال تنبيه</h3><form data-mk-submit="mkSendDirectNotification(event)"><div class="field"><label>المستلم</label><select id="mkNotTo"><option value="all">كل المستخدمين</option>'+users.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name||x.id)+' — '+esc({student:'طالب',parent:'ولي أمر'}[roleOf(x)]||'مستخدم')+'</option>').join('')+'</select></div><div class="field"><label>العنوان</label><input id="mkNotTitle" required></div><div class="field"><label>النص</label><textarea id="mkNotBody" rows="5" required></textarea></div><button class="btn primary">إرسال التنبيه</button></form>');
  };
  window.mkSendDirectNotification=function(e){e.preventDefault();if(String(current?.id)!=='admin')return forbidden();const title=document.getElementById('mkNotTitle')?.value.trim(),body=document.getElementById('mkNotBody')?.value.trim(),to=document.getElementById('mkNotTo')?.value;if(!title||!body)return toast('أكمل بيانات التنبيه');if(to==='all')actors().filter(x=>String(x.id)!=='admin').forEach(x=>notify(x.id,title,body));else notify(to,title,body);save();closeModal();showPage('notifications');toast('تم إرسال التنبيه بنجاح');};
  db.announcements.forEach(a=>{if(!a.audience)a.audience='all'});
  db.version=Math.max(Number(db.version)||0,29.6);db.schema='V29.6-functional-communications-certificates';save();
  if(typeof renderSide==='function')renderSide();
})();
