(function(){
  if(typeof current==='undefined' || typeof db==='undefined') return;
  db.certificates=Array.isArray(db.certificates)?db.certificates:[];
  window.mkDeleteCertificate=function(id){
    if(!current || String(current.role||'').toLowerCase()!=='admin') return toast('حذف الشهادة متاح للإدارة فقط');
    const c=db.certificates.find(x=>String(x.id)===String(id));
    if(!c)return toast('الشهادة غير موجودة');
    if(!confirm('هل تريد حذف هذه الشهادة نهائيًا؟'))return;
    db.certificates=db.certificates.filter(x=>String(x.id)!==String(id));
    save(); renderPage(); toast('تم حذف الشهادة بنجاح');
  };
  window.mkCertificateDetails=function(id){
    const c=db.certificates.find(x=>String(x.id)===String(id));
    if(!c)return toast('الشهادة غير موجودة');
    openModal('<div class="section-head"><div><h3>🏅 '+esc(c.title||'شهادة')+'</h3><span class="small muted">'+esc(c.studentName||'')+' • '+esc(c.date||'')+'</span></div><button class="btn" data-mk-click="closeModal()">إغلاق</button></div><div class="grade-banner"><b>الطالب:</b> '+esc(c.studentName||'')+'<br><b>التاريخ:</b> '+esc(c.date||'')+'</div><div class="row" style="margin-top:14px;gap:8px"><button class="btn primary" data-mk-click="closeModal();printCertificate(\''+String(c.id).replace(/'/g,"\\'")+'\')">🖨️ طباعة</button>'+(String(current?.role||'').toLowerCase()==='admin'?'<button class="btn danger" data-mk-click="closeModal();mkDeleteCertificate(\''+String(c.id).replace(/'/g,"\\'")+'\')">🗑️ حذف الشهادة</button>':'')+'</div>');
  };
  pages.certificates=function(){
    const admin=String(current?.role||'').toLowerCase()==='admin';
    const arr=admin?db.certificates:db.certificates.filter(c=>String(c.student)===String(current?.id));
    return '<div class="grid"><div class="card"><div class="section-head"><div><h3>🏅 '+(admin?'إدارة الشهادات':'شهاداتي')+'</h3><span class="small muted">'+(admin?'إصدار ومراجعة وحذف شهادات الطلاب.':'الشهادات الصادرة لك محفوظة هنا.')+'</span></div>'+(admin?'<button class="btn primary" data-mk-click="certificateModal()">+ إصدار شهادة</button>':'')+'</div><div class="quick-grid">'+(arr.map(c=>'<div class="quick" style="text-align:right"><div style="font-size:42px">🏅</div><b>'+esc(c.title||'شهادة')+'</b><span class="small muted">'+esc(c.studentName||'')+' • '+esc(c.date||'')+'</span><div class="row" style="margin-top:10px;gap:7px"><button class="btn" data-mk-click="mkCertificateDetails(\''+String(c.id).replace(/'/g,"\\'")+'\')">عرض</button><button class="btn" data-mk-click="printCertificate(\''+String(c.id).replace(/'/g,"\\'")+'\')">طباعة</button>'+(admin?'<button class="btn danger" data-mk-click="mkDeleteCertificate(\''+String(c.id).replace(/'/g,"\\'")+'\')">🗑️ حذف</button>':'')+'</div></div>').join('')||'<div class="empty" style="grid-column:1/-1">لا توجد شهادات.</div>')+'</div></div></div>';
  };

})();
