/* MK Platform V37 — Unified Learning Platform */
(function(){
  window.mkPlatformState={level:null,grade:null,subject:null,query:''};
  function ensurePlatform(){
    db.mkLibrary=Array.isArray(db.mkLibrary)?db.mkLibrary:[];
    db.mkLibrary.forEach(x=>{x.files=Array.isArray(x.files)?x.files:[];x.active=x.active!==false});
  }
  ensurePlatform();
  function platformLevel(g){if(/^KG/.test(g)||/ابتدائي/.test(g))return 'ابتدائي';if(/إعدادي/.test(g))return 'إعدادي';if(/ثانوي/.test(g))return 'ثانوي';return ''}
  function levelGrades(level){return grades.filter(g=>platformLevel(g)===level)}
  window.mkPlatformLevelGrades=levelGrades
  function subjectFor(g){
    const names=new Set(subjects);
    db.subjects.filter(x=>x.grade===g).forEach(x=>names.add(x.name));
    db.mkLibrary.filter(x=>x.grade===g&&x.active!==false).forEach(x=>{if(x.subject)names.add(x.subject)});
    return [...names];
  }
  function platformBack(){
    const st=window.mkPlatformState;
    if(st.subject){st.subject=null;return renderPage()}
    if(st.grade){st.grade=null;return renderPage()}
    if(st.level){st.level=null;return renderPage()}
  }
  window.mkPlatformSelectLevel=function(level){window.mkPlatformState.level=level;window.mkPlatformState.grade=null;window.mkPlatformState.subject=null;renderPage()};
  window.mkPlatformSelectGrade=function(g){window.mkPlatformState.grade=g;window.mkPlatformState.subject=null;renderPage()};
  window.mkPlatformSelectSubject=function(s){window.mkPlatformState.subject=s;renderPage()};
  window.mkPlatformReset=function(){window.mkPlatformState={level:null,grade:null,subject:null,query:''};renderPage()};
  window.mkPlatformBack=platformBack;
  window.mkPlatformSearch=function(v){window.mkPlatformState.query=String(v||'').trim();renderPage()};
  function platformContent(){
    const st=window.mkPlatformState; let arr=db.mkLibrary.filter(x=>x.active!==false);
    if(st.grade)arr=arr.filter(x=>x.grade===st.grade);
    if(st.subject)arr=arr.filter(x=>x.subject===st.subject);
    if(st.query){const q=st.query.toLowerCase();arr=arr.filter(x=>[x.title,x.description,x.subject].join(' ').toLowerCase().includes(q))}
    return arr;
  }
  function platformExamList(){
    const st=window.mkPlatformState;
    return db.exams.filter(e=>(!isStudent()||!e.courseId||(db.courses||[]).some(c=>String(c.id)===String(e.courseId)&&c.active!==false&&courseAccess(c,String(current.id))))&&(!st.grade||e.grade===st.grade)&&(!st.subject||e.subject===st.subject));
  }
  function contentCard(x){
    const exams=db.exams.filter(e=>!e.courseId&&e.grade===x.grade&&e.subject===x.subject);
    return `<div class="platform-content-card ${x.private?'mk-private':''}"><div class="chips"><span class="chip">${esc(x.subject)}</span><span class="chip">${esc(x.grade)}</span>${x.private?'<span class="chip warn">MK خاص</span>':''}</div><h3 style="margin-top:12px">${esc(x.title)}</h3><p class="small muted">${esc(x.description||'محتوى تعليمي شامل')}</p><div class="list"><div class="list-item">🎬 ${x.videoRef?'فيديو تعليمي':'بدون فيديو'}</div>${(x.files||[]).map(f=>`<div class="list-item">📎 <a data-mk-file-ref="${esc(f.fileId||'')}" data-mk-file-download="1" download="${esc(f.name)}">${esc(f.name)}</a></div>`).join('')}<div class="list-item">🧪 ${exams.length} اختبار متاح</div></div>${x.videoRef?`<button class="btn primary" style="width:100%;margin-top:10px" data-mk-click="mkPlatformOpenVideo('${x.id}')">▶️ مشاهدة الدرس</button>`:''}${isAdmin()?`<button class="btn danger" style="width:100%;margin-top:8px" data-mk-click="mkPlatformDeleteContent('${x.id}')">حذف المحتوى</button>`:''}</div>`;
  }
  window.mkPlatformOpenVideo=function(id){const x=db.mkLibrary.find(v=>v.id===id);if(!x)return;const videoRef=String(x.videoRef||'');if(!videoRef)return toast('لا يوجد فيديو لهذا المحتوى');openModal(`<h3>${esc(x.title)}</h3><div class="notice good">إدارة المنصة • ${esc(x.subject)} • ${esc(x.grade)} • الحد الأقصى 3 مشاهدات لكل طالب</div><div style="margin-top:15px"><video id="mkPlatformVideo" controls playsinline preload="metadata" style="width:100%;border-radius:18px;background:#000"></video><div id="mkPlatformVideoStatus" class="small muted" style="margin-top:8px"></div></div>`);const v=document.getElementById('mkPlatformVideo'),status=document.getElementById('mkPlatformVideoStatus'),videoId=window.mkVideoAccessId?.(videoRef,x.id)||'';if(/^(?:data:|blob:|idb:)/i.test(videoRef)){if(status)status.textContent='هذا الفيديو قديم وكان مرتبطًا بالجهاز؛ أعد رفعه إلى خادم المنصة.';return;}if(!isStudent()){if(videoRef.startsWith('hls:')){if(status)status.textContent='شاهد الفيديو من حساب طالب مسجل في الصف المستهدف.';}else v.src=videoRef;return;}let authorizing=false,allowPlay=false,sourceReady=false;const authorize=async function(){if(authorizing)return;authorizing=true;v.pause();try{if(!videoId)throw new Error('لا يمكن احتساب مشاهدة هذا الفيديو');const result=await mkBackendRegisterView(videoId);if(!result)throw new Error('سجّل الدخول إلى خادم المنصة قبل المشاهدة');if(!sourceReady){const src=await mkVideoSource(videoRef);if(!src)throw new Error('تعذر تحميل الفيديو من الخادم');v.src=src;sourceReady=true;}if(status)status.textContent='المتبقي بعد بدء هذه المشاهدة: '+Number(result.remaining_views??0)+' من 3';allowPlay=true;await v.play();}catch(error){if(status)status.textContent=error?.message||'تعذر تشغيل الفيديو';toast(error?.message||'تم رفض المشاهدة');}finally{authorizing=false;}};v.addEventListener('play',function(){if(allowPlay){allowPlay=false;return;}if(authorizing){v.pause();return;}void authorize();});if(videoRef.startsWith('hls:')){if(status)status.textContent='اضغط تشغيل لتسجيل المشاهدة وفتح الفيديو.';}else if(status)status.textContent='سيتم احتساب مشاهدة من رصيدك عند الضغط على تشغيل.';};
  window.mkPlatformAddContent=function(){
    if(!isAdmin())return toast('الإدارة فقط');
     openModal(`<h3>➕ إضافة محتوى إلى مكتبة MK الخاصة</h3><form data-mk-submit="mkPlatformSaveContent(event)"><div class="field"><label>عنوان المحتوى</label><input id="mkcTitle" required></div><div class="row"><div class="field"><label>المرحلة</label><select id="mkcLevel"><option>ابتدائي</option><option>إعدادي</option><option>ثانوي</option></select></div><div class="field"><label>الصف</label><select id="mkcGrade"></select></div></div><div class="form-grid"><label>المادة<select id="mkcSubject"></select></label><label>المسؤول عن المحتوى<input value="إدارة المنصة" disabled></label></div><div class="field"><label>وصف المحتوى</label><textarea id="mkcDesc" rows="3"></textarea></div><div class="field"><label>الفيديو الخاص</label><input id="mkcVideo" type="file" accept="video/*" required><div class="small muted">يتم رفعه إلى خادم المنصة وتحويله إلى HLS.</div></div><div class="field"><label>ملفات الدرس (اختياري — PDF/صور/TXT/MD/CSV)</label><input id="mkcFiles" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.csv" multiple><div class="small muted">حد أقصى 3MB للملف. يمكن استخدام نصوص المستندات لإثراء إجابات MK AI.</div></div><div class="row"><button class="btn" type="button" data-mk-click="closeModal()">إلغاء</button><button class="btn primary" type="submit">حفظ ونشر المحتوى</button></div></form>`);
     const level=document.getElementById('mkcLevel'),grade=document.getElementById('mkcGrade'),sub=document.getElementById('mkcSubject');
     window.mkcRefresh=function(){const gs=window.mkPlatformLevelGrades(level.value);grade.innerHTML=gs.map(g=>`<option>${esc(g)}</option>`).join('');sub.innerHTML=subjectFor(grade.value).map(s=>`<option>${esc(s)}</option>`).join('')};
     grade.onchange=()=>{sub.innerHTML=subjectFor(grade.value).map(s=>`<option>${esc(s)}</option>`).join('')};
    window.mkcRefresh();
  };
  let __mkPdfJsPromise=null;
  async function mkLoadPdfJs(){
    if(__mkPdfJsPromise)return __mkPdfJsPromise;
    const assetBase=new URL('assets/js/vendor/pdfjs/',document.baseURI);
    __mkPdfJsPromise=import(new URL('legacy/build/pdf.min.mjs',assetBase).href).then(mod=>{mod.GlobalWorkerOptions.workerSrc=new URL('legacy/build/pdf.worker.min.mjs',assetBase).href;return {mod,assetBase}}).catch(()=>null);
    return __mkPdfJsPromise;
  }
  async function mkExtractFileText(file){
    const name=String(file.name||'').toLowerCase();
    if(/^text\//.test(file.type)||/\.(txt|md|csv)$/i.test(name)){try{return (await file.text()).slice(0,120000)}catch{return ''}}
    if(file.type==='application/pdf'||name.endsWith('.pdf')){
      let loadingTask;
      try{
        const loaded=await mkLoadPdfJs();
        if(!loaded)return '';
        const data=await file.arrayBuffer();
        loadingTask=loaded.mod.getDocument({data,cMapUrl:new URL('cmaps/',loaded.assetBase).href,cMapPacked:true,standardFontDataUrl:new URL('standard_fonts/',loaded.assetBase).href,wasmUrl:new URL('wasm/',loaded.assetBase).href});
        const pdf=await loadingTask.promise;
        let out='';
        for(let i=1;i<=Math.min(pdf.numPages,80);i++){
          const page=await pdf.getPage(i);
          const content=await page.getTextContent();
          out+='\n[صفحة '+i+']\n'+content.items.map(item=>item.str||'').join(' ');
          if(out.length>=120000)break;
        }
        return out.slice(0,120000);
      }catch{return ''}
      finally{if(loadingTask)await loadingTask.destroy().catch(()=>{})}
    }
    return '';
  }

  window.mkPlatformSaveContent=async function(e){
    e.preventDefault();if(!isAdmin())return;const vf=document.getElementById('mkcVideo')?.files?.[0];if(!vf)return toast('اختر فيديو');if(vf.size>1024*1024*1024)return toast('الفيديو أكبر من 1GB');
    const files=[...(document.getElementById('mkcFiles')?.files||[])];if(files.some(f=>f.size>3*1024*1024))return toast('أحد الملفات أكبر من 3MB');
    toast('جاري رفع الفيديو ومعالجته…');let videoRef='';try{videoRef=await mkStoreVideo(vf)}catch(err){return toast(err.message||'فشل رفع الفيديو')}
    const fileData=[];for(const f of files){const text=await mkExtractFileText(f);const ref=await window.mkUploadSchoolFile(f,'course-file');fileData.push({id:ref.id,fileId:ref.id,name:ref.name,type:ref.type,text,size:ref.size})}
    const item={id:uid('mkc'),title:mkcTitle.value.trim(),level:mkcLevel.value,grade:mkcGrade.value,subject:mkcSubject.value,teacher:'admin',teacherName:'إدارة المنصة',description:mkcDesc.value.trim(),videoRef,files:fileData,private:true,active:true,createdAt:new Date().toISOString()};db.mkLibrary.push(item);save();audit('mk_library_publish',`${item.title} — ${item.grade} — ${item.subject}`);if(window.mkBackendSyncPlatform)window.mkBackendSyncPlatform().catch(()=>{});closeModal();renderPage();toast('تم نشر المحتوى في مكتبة MK الخاصة');
  };
  window.mkPlatformDeleteContent=function(id){if(!isAdmin())return;if(!confirm('حذف هذا المحتوى من مكتبة MK؟'))return;db.mkLibrary=db.mkLibrary.filter(x=>x.id!==id);save();audit('mk_library_delete',id);renderPage();toast('تم الحذف')};
    // V42: library content is no longer converted into synthetic courses during sync; the server stores the real course catalog only.
  window.mkPlatformAddExam=function(){
    if(!isAdmin())return toast('الإدارة فقط');
    const gradeOptions=grades.map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('');
    openModal(`<h3>إضافة امتحان للمنصة</h3><form data-mk-submit="mkPlatformSaveExam(event)"><div class="form-grid"><label>السنة الدراسية<select id="mkpeGrade">${gradeOptions}</select></label><label>المادة<input id="mkpeSubject" maxlength="100" required placeholder="اسم المادة"></label></div><div class="field"><label>عنوان الامتحان</label><input id="mkpeTitle" maxlength="180" required></div><div class="form-grid"><label>المدة بالدقائق<input id="mkpeDuration" type="number" value="30" min="1" max="180" required></label><label>درجة النجاح %<input id="mkpePass" type="number" value="50" min="0" max="100" required></label></div><div class="field"><label>الأسئلة (سؤال | اختيار أ | اختيار ب | اختيار ج | اختيار د | رقم الإجابة الصحيحة من 0 إلى 3)</label><textarea id="mkpeQuestions" rows="8" required placeholder="عاصمة مصر؟ | القاهرة | الإسكندرية | الجيزة | أسوان | 0"></textarea></div><button class="btn primary">نشر الامتحان</button></form>`);
  };
  window.mkPlatformSaveExam=function(e){
    e.preventDefault();if(!isAdmin())return;
    const lines=String(document.getElementById('mkpeQuestions')?.value||'').split(/\r?\n/).map(line=>line.split('|').map(value=>value.trim())).filter(parts=>parts.length>=6&&parts[0]&&parts.slice(1,5).every(Boolean));
    const questions=lines.map(parts=>({text:parts[0],options:parts.slice(1,5),answer:Number(parts[5]),points:1}));
    const title=String(document.getElementById('mkpeTitle')?.value||'').trim(),subject=String(document.getElementById('mkpeSubject')?.value||'').trim(),grade=String(document.getElementById('mkpeGrade')?.value||''),duration=Number(document.getElementById('mkpeDuration')?.value),passPercent=Number(document.getElementById('mkpePass')?.value);
    if(!title||!subject||!grade||!questions.length||questions.some(question=>!Number.isInteger(question.answer)||question.answer<0||question.answer>3)||!Number.isInteger(duration)||duration<1||duration>180||!Number.isFinite(passPercent)||passPercent<0||passPercent>100)return toast('راجع عنوان الاختبار والمادة والوقت والأسئلة والإجابات الصحيحة.');
    const exam={id:uid('exam'),teacher:'admin',teacherId:'admin',subject,grade,title,duration,passPercent,questionPoints:1,questions,platformPrivate:true,active:true,createdAt:new Date().toISOString()};
    db.exams.push(exam);save();audit('platform_exam_create',exam.title);closeModal();renderPage();toast('تم نشر الامتحان على المنصة');
  };
  pages.courses=function(){
    ensurePlatform();const st=window.mkPlatformState,admin=isAdmin(),allContent=platformContent(),exams=platformExamList();
    if(!st.level&&!st.grade&&!st.subject)return `<div class="platform-shell"><div class="platform-hero"><div><h2>🎓 منصة MK التعليمية</h2><p>اختر المرحلة ثم الصف والمادة للوصول إلى الدورات والدروس والاختبارات.</p></div><div class="platform-search"><span>⌕</span><input placeholder="ابحث عن درس أو مادة…" data-mk-input="mkPlatformSearch(this.value)" value="${esc(st.query)}"></div></div><div class="card"><div class="section-head"><div><h3>المراحل التعليمية</h3><span class="small muted">محتوى منظم حسب المرحلة الدراسية.</span></div>${admin?'<div class="row"><button class="btn primary" data-mk-click="mkPlatformAddContent()">+ فيديو/محتوى</button><button class="btn" data-mk-click="mkPlatformAddExam()">+ امتحان</button></div>':''}</div><div class="platform-levels"><div class="platform-level" role="button" tabindex="0" data-mk-click="mkPlatformSelectLevel('ابتدائي')"><div class="ico">🧒</div><h3>ابتدائي</h3><p class="muted">من أولى ابتدائي حتى سادسة ابتدائي</p></div><div class="platform-level" role="button" tabindex="0" data-mk-click="mkPlatformSelectLevel('إعدادي')"><div class="ico">📘</div><h3>إعدادي</h3><p class="muted">أولى إعدادي • ثانية إعدادي • ثالثة إعدادي</p></div><div class="platform-level" role="button" tabindex="0" data-mk-click="mkPlatformSelectLevel('ثانوي')"><div class="ico">🎓</div><h3>ثانوي</h3><p class="muted">أولى ثانوي • ثانية ثانوي • ثالثة ثانوي</p></div></div></div><div class="card mk-private"><div class="section-head"><h3>🔒 مكتبة MK الخاصة</h3><span class="chip warn">محتوى بإدارة المنصة</span></div><div class="platform-content">${db.mkLibrary.filter(x=>x.active!==false).slice(-6).map(contentCard).join('')||'<div class="empty">لم يتم نشر محتوى خاص بعد.</div>'}</div></div></div>`;
    if(st.level&&!st.grade)return `<div class="platform-shell"><div class="platform-path"><button class="platform-step" data-mk-click="mkPlatformBack()">← المنصة</button><span class="platform-step active">${esc(st.level)}</span></div><div class="card"><div class="section-head"><div><h3>اختر الصف</h3><span class="muted">${esc(st.level)} — اختر الصف للوصول للمواد.</span></div></div><div class="platform-grades">${levelGrades(st.level).map(g=>`<button class="platform-grade" data-mk-click="mkPlatformSelectGrade('${esc(g)}')">📚 ${esc(g)}</button>`).join('')}</div></div></div>`;
    if(st.grade&&!st.subject)return `<div class="platform-shell"><div class="platform-path"><button class="platform-step" data-mk-click="mkPlatformBack()">← ${esc(st.level)}</button><span class="platform-step active">${esc(st.grade)}</span></div><div class="card"><div class="section-head"><div><h3>المواد الدراسية</h3><span class="muted">اختر مادة لعرض محتواها واختباراتها.</span></div><div class="platform-search" style="background:var(--surface2);border-color:var(--line)"><span>⌕</span><input style="color:var(--text)" placeholder="ابحث عن مادة…" data-mk-input="mkPlatformSearch(this.value)" value="${esc(st.query)}"></div></div><div class="platform-subjects">${subjectFor(st.grade).filter(subject=>!st.query||subject.toLowerCase().includes(st.query.toLowerCase())).map(subject=>{const value=esc(JSON.stringify(subject)),count=db.mkLibrary.filter(item=>item.active!==false&&item.grade===st.grade&&item.subject===subject).length+db.exams.filter(exam=>exam.grade===st.grade&&exam.subject===subject).length;return `<button class="platform-subject" data-mk-click="mkPlatformSelectSubject(${value})"><b>📘 ${esc(subject)}</b><div class="small muted" style="margin-top:7px">${count} محتوى واختبار</div></button>`}).join('')||'<div class="empty">لا توجد مواد لهذا الصف حتى الآن.</div>'}</div></div></div>`;
    const content=allContent.filter(item=>item.grade===st.grade&&item.subject===st.subject),subjectExams=exams.filter(exam=>exam.grade===st.grade&&exam.subject===st.subject);
    return `<div class="platform-shell"><div class="platform-path"><button class="platform-step" data-mk-click="mkPlatformBack()">← ${esc(st.grade)}</button><span class="platform-step active">${esc(st.subject)}</span></div><div class="card"><div class="section-head"><div><h3>📚 ${esc(st.subject)}</h3><span class="muted">${esc(st.grade)} · الدروس والمواد التعليمية</span></div><div class="platform-search" style="background:var(--surface2);border-color:var(--line)"><span>⌕</span><input style="color:var(--text)" placeholder="ابحث في محتوى المادة…" data-mk-input="mkPlatformSearch(this.value)" value="${esc(st.query)}"></div></div><div class="platform-content">${content.map(contentCard).join('')||'<div class="empty">لا توجد دروس منشورة لهذه المادة بعد.</div>'}</div></div><div class="card"><div class="section-head"><h3>🧪 اختبارات المادة</h3><span class="chip">${subjectExams.length} اختبار</span></div><div class="list">${subjectExams.map(exam=>`<div class="list-item"><div class="section-head"><div><b>${esc(exam.title)}</b><div class="small muted">${exam.questions?.length||0} سؤال • ${Number(exam.duration)||30} دقيقة</div></div>${isStudent()?`<button class="btn primary" data-mk-click="startExam('${esc(exam.id)}')">ابدأ الاختبار</button>`:''}</div></div>`).join('')||'<div class="empty">لا توجد اختبارات منشورة لهذه المادة بعد.</div>'}</div></div></div>`;
  };
  const oldTitles=renderPage;
  // Keep existing renderer; only the courses page is replaced above.
})();
