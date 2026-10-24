// All school records are server-owned. Browser memory is used only for transient UI/session state.
const MK_RUNTIME_STORE = new Map();
function mkRuntimeGetItem(key){return MK_RUNTIME_STORE.has(String(key))?MK_RUNTIME_STORE.get(String(key)):null;}
function mkRuntimeSetItem(key,value){MK_RUNTIME_STORE.set(String(key),String(value));}
function mkRuntimeRemoveItem(key){MK_RUNTIME_STORE.delete(String(key));}
const FONT_SIZE_KEY='mk_school_font_size_v18';
const FONT_SIZE_SCALE={small:.92,normal:1,large:1.16};
// Browser storage is disabled; credentials and school records are server-owned and session values remain in memory only.
const MK_AUTH_VAULT=new Map();
async function mkHashPassword(value){const data=new TextEncoder().encode(String(value||''));const hash=await crypto.subtle.digest('SHA-256',data);return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function mkPasswordMatches(user,password){if(!user)return false;return !!user.passHash&&(await mkHashPassword(password))===String(user.passHash)}
function mkRememberPassword(id,password){if(id&&password)MK_AUTH_VAULT.set(String(id),String(password))}
function mkSessionPassword(id){return MK_AUTH_VAULT.get(String(id))||''}
async function mkMigratePlainPasswords(){let changed=false;for(const arr of [db?.students||[],db?.teachers||[],db?.parents||[],Object.values(db?.users||{})])for(const u of arr){if(u?.pass){u.passHash=await mkHashPassword(u.pass);delete u.pass;changed=true}}if(changed)save()}
let fontSizeMode='normal';
function setFontSize(mode){
  fontSizeMode=FONT_SIZE_SCALE[mode]!==undefined?mode:'normal';
  document.documentElement.style.setProperty('--mk-font-scale',String(FONT_SIZE_SCALE[fontSizeMode]));
  document.documentElement.dataset.fontSize=fontSizeMode;
  mkRuntimeSetItem(FONT_SIZE_KEY,fontSizeMode);
  const b=document.getElementById('fontToggleBtn');
  if(b){b.textContent=fontSizeMode==='small'?'A−':fontSizeMode==='large'?'A+':'A';b.dataset.mode=fontSizeMode;b.title=fontSizeMode==='small'?'تكبير الخط':fontSizeMode==='large'?'تصغير الخط':'حجم الخط';}
}
function cycleFontSize(){setFontSize(fontSizeMode==='normal'?'large':fontSizeMode==='large'?'small':'normal')}
function restoreFontSize(){const saved=mkRuntimeGetItem(FONT_SIZE_KEY)||'normal';setFontSize(FONT_SIZE_SCALE[saved]!==undefined?saved:'normal')}
const grades=['KG1','KG2','أولى ابتدائي','ثانية ابتدائي','ثالثة ابتدائي','رابعة ابتدائي','خامسة ابتدائي','سادسة ابتدائي','أولى إعدادي','ثانية إعدادي','ثالثة إعدادي','أولى ثانوي','ثانية ثانوي','ثالثة ثانوي'];
const MK_EXAM_GAMES=[
 {key:'primary',label:'رياض الأطفال والابتدائي',grades:grades.slice(0,8),icon:'🗺️',title:'مغامرة النجوم',description:'كل سؤال محطة في رحلة المعرفة. اجمع نجوم الأداء وأكمل المغامرة.'},
 {key:'preparatory',label:'الإعدادي',grades:grades.slice(8,11),icon:'🧭',title:'مهمة عبور المستويات',description:'تقدّم في مستويات قصيرة مع شريط إنجاز يتابع تقدمك في المهمة.'},
 {key:'secondary',label:'الثانوي',grades:grades.slice(11),icon:'⚡',title:'تحدي التفوق',description:'تحدّ نفسك لتحقق أعلى دقة قبل انتهاء وقت الاختبار.'}
];
function mkExamGameForGrade(grade){const stage=MK_EXAM_GAMES.find(item=>item.grades.includes(String(grade||'')));return stage&&db?.examGameSettings?.[stage.key]?.enabled===true?stage:null;}
const subjects=['لغة عربية','رياضيات','لغة إنجليزية','علوم','دراسات اجتماعية','حاسب آلي','فيزياء','كيمياء','أحياء','تاريخ','جغرافيا','فلسفة'];
const days=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
function seed(){
 let d={
   version:40,
   users:{admin:{id:'admin',role:'admin',name:'مدير المنصة',email:'admin',active:true}},
   teachers:[],students:[],parents:[],subjects:[],assignments:[],submissions:[],exams:[],examResults:[],grades:[],
   attendance:{},attendanceSessions:[],
   notifications:[],schedule:[],library:[],lessonLinks:[],achievements:[],questionBank:[],
    courses:[],courseRequests:[],courseProgress:{},videoViews:{},mkLibrary:[],complaints:[],communityTopics:[],certificates:[],projects:[],resources:[],
   terms:[{id:'term1',name:'الترم الأول',year:'2026/2027',active:true},{id:'term2',name:'الترم الثاني',year:'2026/2027',active:false}],
   audit:[],payments:[],paymentSettings:{provider:'manual',currency:'EGP'},settings:{}
 };
 return d;
}

function ensureStudentIds(){
 let changed=false;
 (db.students||[]).forEach(st=>{
   if(!st.id){st.id=uid('s');changed=true}
   if(!Array.isArray(st.files)){st.files=[];changed=true}
   if(!('birthDate' in st)){st.birthDate='';changed=true}
 });
 (db.parents||[]).forEach(p=>{p.studentIds=Array.isArray(p.studentIds)?p.studentIds:[]});
 if(changed)save();
}
function findStudentById(studentId){
 const id=String(studentId||'').trim();
 return (db.students||[]).find(st=>String(st.id||'')===id);
}
function stripRemovedClassData(value){
 if(!value||typeof value!=='object')return;
 if(Array.isArray(value)){value.forEach(stripRemovedClassData);return}
 for(const key of Object.keys(value)){if(['classes','classid','class_id'].includes(key.toLowerCase()))delete value[key];else stripRemovedClassData(value[key])}
}
function normalizeDB(d){
 stripRemovedClassData(d);
 d.version=14;
 d.aiHistory=d.aiHistory||{};
 d.parents=Array.isArray(d.parents)?d.parents:[];
 d.terms=d.terms||[{id:'term1',name:'الترم الأول',year:'2026/2027',active:true},{id:'term2',name:'الترم الثاني',year:'2026/2027',active:false}];
 d.questionBank=d.questionBank||[]; d.courses=Array.isArray(d.courses)?d.courses:[]; d.courseRequests=Array.isArray(d.courseRequests)?d.courseRequests:[]; d.courseProgress=d.courseProgress&&typeof d.courseProgress==='object'?d.courseProgress:{}; d.courses.forEach(c=>{c.lessons=Array.isArray(c.lessons)?c.lessons:[];c.enrollments=Array.isArray(c.enrollments)?c.enrollments:[];c.pending=Array.isArray(c.pending)?c.pending:[]});d.mkLibrary=Array.isArray(d.mkLibrary)?d.mkLibrary:[];d.mkLibrary.forEach(item=>{item.teacher='admin';item.teacherId='admin';item.teacherName='إدارة المنصة'});
 d.complaints=d.complaints||[];
  d.communityTopics=Array.isArray(d.communityTopics)?d.communityTopics:[];
 d.certificates=d.certificates||[];
 d.projects=d.projects||[];
 d.resources=d.resources||[];
 d.audit=d.audit||[];
 d.lessonLinks=d.lessonLinks||[];
 d.achievements=d.achievements||[];
 d.attendanceSessions=d.attendanceSessions||[];
 d.schedule=d.schedule||[];
 d.notifications=d.notifications||[];
 d.students=d.students||[]; d.teachers=Array.isArray(d.teachers)?d.teachers:[]; d.grades=d.grades||[];
 d.subjects=Array.isArray(d.subjects)?d.subjects:[];
 for(const item of [...d.subjects,...(Array.isArray(d.assignments)?d.assignments:[]),...(Array.isArray(d.exams)?d.exams:[]),...(Array.isArray(d.questionBank)?d.questionBank:[]),...(Array.isArray(d.grades)?d.grades:[]),...(Array.isArray(d.schedule)?d.schedule:[])]){if(item&&typeof item==='object'){if('teacher'in item)item.teacher='admin';if('teacherId'in item)item.teacherId='admin';}}
 d.courses.forEach(course=>{course.teacherId='admin';course.instructor='إدارة المنصة';});d.teacherNotes=[];d.teachers=[];
 d.examGameSettings=d.examGameSettings&&typeof d.examGameSettings==='object'?d.examGameSettings:{};
 for(const stage of MK_EXAM_GAMES)d.examGameSettings[stage.key]={enabled:d.examGameSettings[stage.key]?.enabled===true};
 return d;
}
let db=normalizeDB(seed()), current=null, page='dashboard', examTimer=null;
let __mkAuthReady=false;
let __mkServerSyncPending=false;
let __mkServerRevision=0;
let __mkServerSnapshot=null;
let __mkAccountSignature='';
// V41 production migration: remove only records that match the bundled demo signatures.
(function purgeBundledDemoData(){
  if(!db||db.__v41DemoPurged)return;
  const demoEmail=v=>/@mk-school\.local$/i.test(String(v||''));
  const isBundled=(x)=>{const id=String(x?.id||'');return id.startsWith('demo-') || ((/^t[1-5]$/.test(id)||/^s[1-3]$/.test(id)) && demoEmail(x?.email));};
  const collect=(arr)=>new Set((Array.isArray(arr)?arr:[]).filter(isBundled).map(x=>String(x.id)));
  const demoIds=new Set([...collect(db.teachers),...collect(db.students),...collect(db.parents)]);
  db.teachers=(db.teachers||[]).filter(x=>!demoIds.has(String(x.id)));
  db.students=(db.students||[]).filter(x=>!demoIds.has(String(x.id)));
  db.parents=(db.parents||[]).filter(x=>!demoIds.has(String(x.id)) && !((String(x.id)==='p1'||String(x.id).startsWith('demo-'))&&demoEmail(x.email)));
  const strip=(arr)=>Array.isArray(arr)?arr.filter(x=>!String(x?.id||'').startsWith('demo-')):[];
  db.subjects=strip(db.subjects); db.assignments=strip(db.assignments); db.exams=strip(db.exams); db.grades=strip(db.grades);
  db.lessonLinks=strip(db.lessonLinks); db.library=strip(db.library); db.schedule=strip(db.schedule); db.achievements=strip(db.achievements);
  db.submissions=strip(db.submissions); db.notifications=strip(db.notifications);
  if(db.attendance&&typeof db.attendance==='object'){for(const id of Object.keys(db.attendance)){if(demoIds.has(id)||id.startsWith('demo-'))delete db.attendance[id]}}
  (db.courses||[]).forEach(c=>{c.enrollments=(c.enrollments||[]).filter(id=>!demoIds.has(String(id))&&!String(id).startsWith('demo-'));c.pending=(c.pending||[]).filter(id=>!demoIds.has(String(id))&&!String(id).startsWith('demo-'));});
  (db.parents||[]).forEach(p=>{p.studentIds=(p.studentIds||[]).filter(id=>!demoIds.has(String(id))&&!String(id).startsWith('demo-'));});
  db.__v41DemoPurged=true; save(db);
})();
ensureStudentIds();
// V20.1 login migration: always guarantee the built-in admin account exists.
function repairAdminAccount(){
  if(!db || typeof db!=='object') db={};
  if(!db.users || typeof db.users!=='object' || Array.isArray(db.users)) db.users={};
  const a=(db.users.admin && typeof db.users.admin==='object')?db.users.admin:{};
  db.users.admin={...a,id:'admin',role:'admin',name:a.name||'مدير المنصة',email:'admin',active:true};
  db.audit=Array.isArray(db.audit)?db.audit:[];
  save();
  return db.users.admin;
}
repairAdminAccount();

function audit(action,details=''){db.audit.push({id:uid('au'),actor:current?.id||'system',role:current?.role||'system',action,details,date:new Date().toISOString()});if(db.audit.length>500)db.audit.shift();save()}
function visibleStudents(){if(current.role==='teacher'){let gs=db.subjects.filter(x=>x.teacher===current.id).map(x=>x.grade);return db.students.filter(s=>gs.includes(s.grade))}if(current.role==='parent'){let p=db.parents.find(x=>x.id===current.id);return db.students.filter(s=>p?.studentIds.includes(s.id))}return db.students}
function myStudentIds(){if(current.role==='student')return [current.id];if(current.role==='parent')return visibleStudents().map(s=>s.id);return visibleStudents().map(s=>s.id)}
let __mkServerSyncTimer=null;
function save(d=db){
  if(d&&d!==db) db=d;
  if(!current?.role||!__mkAuthReady||!window.mkBackendPushPlatform)return;
  clearTimeout(__mkServerSyncTimer);
  __mkServerSyncTimer=setTimeout(()=>{
    if(__mkServerSyncPending){save(db);return;}
    __mkServerSyncPending=true;
    Promise.resolve(window.mkBackendPushPlatform()).then(ok=>{
      if(!ok)toast('تعذر حفظ التغييرات على الخادم. لم يتم حفظها محليًا؛ افحص الاتصال ثم أعد المحاولة.');
    }).catch(err=>{console.error('MK server save failed',err);toast('فشل حفظ البيانات على الخادم؛ أعد المحاولة قبل مغادرة الصفحة.');})
      .finally(()=>{__mkServerSyncPending=false;});
  },350);
}

function uid(p){return p+Math.random().toString(36).slice(2,9)}
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function me(){if(!current)return null;return current.role==='admin'?db.users.admin:current.role==='parent'?db.parents.find(x=>x.id===current.id):current.role==='student'?db.students.find(x=>x.id===current.id):null}
function toast(msg){const el=document.getElementById('toast');const x=document.createElement('div');x.className='toast-item';x.textContent=msg;el.appendChild(x);setTimeout(()=>x.remove(),2800)}
let __mkModalReturnFocus=null;
function openModal(html){
  const modal=document.getElementById('modal'),box=document.getElementById('modalBox');
  if(!modal||!box)return;
  if(!modal.classList.contains('show'))__mkModalReturnFocus=document.activeElement;
  box.innerHTML=html;
  const title=box.querySelector('h1,h2,h3,[data-modal-title]');
  if(title){if(!title.id)title.id='mkModalTitle';modal.setAttribute('aria-labelledby',title.id)}else modal.removeAttribute('aria-labelledby');
  modal.setAttribute('aria-hidden','false');modal.classList.add('show');
  const first=[...box.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].find(node=>node.getClientRects().length);
  (first||box).focus();
}
function closeModal(){
  const modal=document.getElementById('modal');if(!modal)return;
  modal.classList.remove('show');modal.setAttribute('aria-hidden','true');
  if(__mkModalReturnFocus?.isConnected)__mkModalReturnFocus.focus();
  __mkModalReturnFocus=null;
}
function showAccountRecoveryHelp(){openModal(`<div class="section-head"><h3>🔐 استعادة الحساب</h3><button class="btn" type="button" data-mk-click="closeModal()">إغلاق</button></div><div class="notice">أدخل البريد المسجل بحسابك لإرسال رابط آمن صالح لمدة 20 دقيقة. افحص الرسائل غير المرغوب فيها أيضًا.</div><form class="password-reset-form" data-mk-submit="requestPasswordReset(event)"><div class="field"><label for="recoveryEmail">البريد الإلكتروني المسجل</label><input id="recoveryEmail" type="email" maxlength="320" autocomplete="email" required></div><div id="recoveryMessage" class="small muted" role="status" aria-live="polite"></div><button id="recoverySubmit" class="btn primary" type="submit">إرسال رابط الاستعادة</button></form><p class="small muted" style="margin-top:12px">إذا لم تكن خدمة البريد مهيأة على الخادم، سيظهر لك ذلك بوضوح. يمكن لإدارة المنصة عندها تعيين كلمة مرور مؤقتة من الإعدادات.</p>`)}
async function requestPasswordReset(event){event.preventDefault();const email=String(document.getElementById('recoveryEmail')?.value||'').trim(),button=document.getElementById('recoverySubmit'),message=document.getElementById('recoveryMessage'),base=(window.mkVideoCfg?.()||{}).url||location.origin;if(button)button.disabled=true;if(message)message.textContent='جارٍ إرسال الطلب…';try{const response=await fetch(base+'/api/v1/auth/password-reset/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})}),data=await response.json().catch(()=>({}));if(!response.ok){const error=new Error(data.message||'تعذر إرسال الطلب؛ حاول لاحقًا');error.status=response.status;throw error}if(message)message.textContent=data.message||'إذا كان البريد مرتبطًا بحساب، ستصلك رسالة برابط الاستعادة.';document.getElementById('recoveryEmail').value='';}catch(error){if(message)message.textContent=error.status===503?'البريد غير مهيأ على الخادم. تواصل مع مدير المنصة ليعيد تعيين كلمة المرور من قسم الإعدادات.':error.message||'تعذر الاتصال بخادم المنصة؛ حاول لاحقًا.'}finally{if(button)button.disabled=false}}
function showPasswordResetForm(token){openModal(`<div class="section-head"><h3>🔐 تعيين كلمة مرور جديدة</h3><button class="btn" type="button" data-mk-click="closeModal()">إغلاق</button></div><div class="notice">أنشئ كلمة مرور جديدة من 8 أحرف على الأقل. رابط الاستعادة صالح لمرة واحدة ولمدة 20 دقيقة.</div><form class="password-reset-form" data-mk-submit="completePasswordReset(event)"><input id="passwordResetToken" type="hidden" value="${esc(token)}"><div class="field"><label for="newPassword">كلمة المرور الجديدة</label><input id="newPassword" type="password" minlength="8" maxlength="1024" autocomplete="new-password" required></div><div class="field"><label for="confirmNewPassword">تأكيد كلمة المرور</label><input id="confirmNewPassword" type="password" minlength="8" maxlength="1024" autocomplete="new-password" required></div><div id="passwordResetMessage" class="small muted" role="status" aria-live="polite"></div><button id="passwordResetSubmit" class="btn primary" type="submit">حفظ كلمة المرور</button></form>`)}
async function completePasswordReset(event){event.preventDefault();const token=String(document.getElementById('passwordResetToken')?.value||''),password=String(document.getElementById('newPassword')?.value||''),confirmPassword=String(document.getElementById('confirmNewPassword')?.value||''),button=document.getElementById('passwordResetSubmit'),message=document.getElementById('passwordResetMessage'),base=(window.mkVideoCfg?.()||{}).url||location.origin;if(password!==confirmPassword){if(message)message.textContent='كلمتا المرور غير متطابقتين.';return}if(password.length<8||password.length>1024){if(message)message.textContent='كلمة المرور يجب أن تكون بين 8 و1024 حرفًا.';return}if(button)button.disabled=true;if(message)message.textContent='جارٍ حفظ كلمة المرور…';try{const response=await fetch(base+'/api/v1/auth/password-reset/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,password})}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||'رابط الاستعادة غير صالح أو منتهي؛ اطلب رابطًا جديدًا');closeModal();toast(data.message||'تم تغيير كلمة المرور. سجّل الدخول الآن.')}catch(error){if(message)message.textContent=error.message||'تعذر تغيير كلمة المرور؛ اطلب رابطًا جديدًا.'}finally{if(button)button.disabled=false}}
setTimeout(()=>{try{const url=new URL(location.href),token=url.searchParams.get('reset_token');if(token){url.searchParams.delete('reset_token');history.replaceState(null,'',url.pathname+url.search+url.hash);showPasswordResetForm(token)}}catch{}} ,0);
function setSideOpen(open){const sidebar=document.getElementById('sidebar'),button=document.getElementById('sideToggleBtn');if(!sidebar)return;sidebar.classList.toggle('open',!!open);button?.setAttribute('aria-expanded',String(!!open));}
function toggleSide(){const sidebar=document.getElementById('sidebar');setSideOpen(!sidebar?.classList.contains('open'))}
document.addEventListener('keydown',function(e){
  const modal=document.getElementById('modal'),box=document.getElementById('modalBox');
  if(modal?.classList.contains('show')){
    if(e.key==='Escape'){e.preventDefault();closeModal();return}
    if(e.key==='Tab'&&box){
      const items=[...box.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter(x=>x.getClientRects().length);
      if(!items.length){e.preventDefault();box.focus();return}
      const first=items[0],last=items[items.length-1];
      if(e.shiftKey&&(document.activeElement===first||!box.contains(document.activeElement))){e.preventDefault();last.focus()}
      else if(!e.shiftKey&&(document.activeElement===last||!box.contains(document.activeElement))){e.preventDefault();first.focus()}
    }
    return;
  }
  if(e.key==='Escape'&&document.getElementById('sidebar')?.classList.contains('open')){setSideOpen(false);document.getElementById('sideToggleBtn')?.focus()}
});
function toggleTheme(){document.body.classList.toggle('dark');document.body.style.setProperty('--bg',document.body.classList.contains('dark')?'#0b1020':'#f5f7fb');document.body.style.setProperty('--surface',document.body.classList.contains('dark')?'#121a2d':'#fff');document.body.style.setProperty('--surface2',document.body.classList.contains('dark')?'#182238':'#f8fafc');document.body.style.setProperty('--text',document.body.classList.contains('dark')?'#eef2ff':'#162033');document.body.style.setProperty('--line',document.body.classList.contains('dark')?'#27324a':'#e6eaf0');mkRuntimeSetItem('mk_theme',document.body.classList.contains('dark')?'dark':'light')}
function navItems(){if(current.role==='admin')return [['dashboard','الرئيسية','⌂'],['students','شؤون الطلبة','🗂️'],['courses','المنصة','🎓'],['deviceControl','أجهزة الحسابات','📱'],['attendance','الحضور والغياب','🟢'],['schedule','الجدول','🗓️'],['reports','التقارير والتحليلات','📊'],['complaints','الدعم والشكاوى','🛟'],['certificates','الشهادات','🏅'],['payments','المدفوعات','💳'],['settings','الإعدادات','⚙️']];if(current.role==='teacher')return [];if(current.role==='parent')return [['dashboard','الرئيسية','⌂'],['students','أبنائي','👨‍👩‍👧'],['grades','الدرجات والتقييمات','⭐'],['attendance','الحضور والغياب','🟢'],['schedule','الجدول','🗓️'],['assignments','الواجبات','📝']];if(current.role==='student')return [['dashboard','الرئيسية','⌂'],['courses','المنصة','🎓'],['assignments','واجباتي','📝'],['exams','اختباراتي','🧪'],['grades','درجاتي وتقييماتي','⭐'],['attendance','حضوري','🟢'],['schedule','جدولي','🗓️'],['library','مكتبتي','📖'],['achievements','إنجازاتي','🏆'],['certificates','شهاداتي','🏅'],['ai','MK AI','🤖'],['profile','ملفي','👤']];return [];}
function renderSide(){if(!current){const sidebar=document.getElementById('sidebar');if(sidebar)sidebar.innerHTML='';return;}const u=me();document.getElementById('sidebar').innerHTML=`<div class="profile-mini"><div class="row"><div class="avatar">${esc((u?.name||'MK')[0])}</div><div><b>${esc(u?.name||'')}</b><div class="small muted">${current.role==='admin'?'مدير المنصة':current.role==='parent'?'ولي أمر':'طالب • '+esc(u?.grade||'')}</div></div></div></div><nav class="nav">${navItems().filter(n=>!['library','payments'].includes(n[0])).map(n=>`<button class="${page===n[0]||(n[0]==='courses'&&['library','payments','courseDetails'].includes(page))?'active':''}" data-mk-click="showPage('${n[0]}')">${n[2]} &nbsp; ${n[1]}</button>`).join('')}</nav><button class="btn danger" style="width:100%;margin-top:18px" data-mk-click="logout()">تسجيل الخروج</button>`}
function showPage(p){if(!current)return;if(p==='studentAffairs'&&current.role==='admin')p='students';const subPageAllowed=(p==='library'&&['admin','student'].includes(current.role))||(p==='payments'&&['admin','student'].includes(current.role));const allowed=navItems().some(x=>x[0]===p)||subPageAllowed;if(!allowed)return toast('هذه الصفحة غير متاحة لهذا الحساب');if(!pages[p])return toast('الصفحة غير متاحة حاليًا');page=p;renderSide();renderPage();setSideOpen(false);window.scrollTo({top:0,behavior:'smooth'})}
function renderPage(){if(!current)return;const main=document.getElementById('main');const u=me();const titles={dashboard:'لوحة التحكم',studentAffairs:'شؤون الطلبة',courses:'المنصة التعليمية',community:'مجتمع المنصة',deviceControl:'إدارة الأجهزة',payments:'مدفوعاتي',students:'الطلاب',subjects:'موادي',assignments:'الواجبات',exams:'الاختبارات',questionBank:'بنك الأسئلة',grades:'الدرجات والتقييمات',attendance:'الحضور والغياب',schedule:'الجدول الدراسي',library:'مكتبتي',ai:'MK AI',reports:'التقارير والتحليلات',complaints:'الدعم والشكاوى',certificates:'الشهادات',notifications:'التنبيهات',achievements:'إنجازاتي',profile:'ملفي',settings:'الإعدادات'};const tabs=[['courses','الدورات','🎓'],['library','مكتبتي','📚'],['payments',current.role==='admin'?'مراجعة المدفوعات':'مدفوعاتي','💳']].filter(x=>x[0]==='courses'||(x[0]==='library'&&['admin','student'].includes(current.role))||(x[0]==='payments'&&['admin','student'].includes(current.role)));const platformTabs=['courses','library','payments'].includes(page)?`<nav class="platform-sections" aria-label="أقسام المنصة">${tabs.map(x=>`<button class="${page===x[0]?'active':''}" data-mk-click="showPage('${x[0]}')"><span>${x[2]}</span>${x[1]}</button>`).join('')}</nav>`:'';main.innerHTML=`<section class="hero"><div><h1>${titles[page]||'MK Platform'}</h1><p>${esc(u?.name||'مرحبًا بك')} — ${current.role==='admin'?'تحكم كامل في تشغيل المنصة':current.role==='teacher'?'تابع حسابك وخدمات المنصة':`السنة الدراسية: ${esc(u?.grade||'')}`}</p></div><div class="hero-badge">${new Date().toLocaleDateString('ar-EG',{weekday:'long',day:'numeric',month:'long'})}</div></section>${platformTabs}${pages[page]?pages[page]():pages.dashboard()}`;window.mkHydrateSchoolFileRefs?.(main);if(page==='settings')setTimeout(loadExternalAISettings,0);if(page==='ai')setTimeout(()=>{aiRenderHistory();const chip=document.getElementById('aiStatusChip');if(chip){chip.textContent='جارٍ فحص خدمة الذكاء الاصطناعي…';chip.className='chip info'}loadExternalAISettings();const inp=document.getElementById('aiInput');if(inp)inp.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();askAI()}})},0)}
const pages={
  dashboard(){if(current.role==='admin')return adminDash();if(current.role==='parent')return parentDash();return studentDash()},
  teachers(){return '<div class="notice">هذا القسم غير متاح.</div>'},
  students(){if(current.role==='admin')return pages.studentAffairs();const arr=current.role==='parent'?visibleStudents():[];return `<div class="grid"><div class="card"><div class="section-head"><h3>أبنائي</h3></div><div class="table-wrap"><table class="table"><tr><th>الطالب</th><th>السنة</th><th>البريد</th><th>الحضور</th><th>الحالة</th><th></th></tr>${arr.map(s=>{let st=attendanceStats(s.id);return `<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.grade)}</td><td>${esc(s.email)}</td><td>${st.rate}%</td><td><span class="chip good">نشط</span></td><td><button class="btn" data-mk-click="studentDetails('${s.id}')">عرض الملف</button></td></tr>`}).join('')||'<tr><td colspan="6" class="empty">لا توجد حسابات طلاب مرتبطة.</td></tr>'}</table></div></div></div>`},
 subjects(){if(current.role!=='teacher')return forbidden();const mine=db.subjects.filter(x=>x.teacher===current.id);return `<div class="grid"><div class="card"><div class="section-head"><h3>المواد التي أديرها</h3><button class="btn primary" data-mk-click="subjectModal()">+ إضافة مادة</button></div><div class="quick-grid">${mine.length?mine.map(x=>`<div class="quick"><div style="font-size:28px">📘</div><b>${esc(x.name)}</b><span class="small muted">${esc(x.grade)}</span></div>`).join(''):'<div class="empty" style="grid-column:1/-1">لم تضف مواد بعد.</div>'}</div></div></div>`},
 assignments(){let arr=current.role==='student'?db.assignments.filter(a=>a.grade===me().grade):current.role==='teacher'?db.assignments.filter(a=>a.teacher===current.id):db.assignments;return `<div class="grid"><div class="card"><div class="section-head"><h3>الواجبات</h3>${current.role==='teacher'?'<button class="btn primary" data-mk-click="assignmentModal()">+ إنشاء واجب</button>':''}</div><div class="list">${arr.map(a=>assignmentCard(a)).join('')||'<div class="empty">لا توجد واجبات حاليًا.</div>'}</div></div></div>`},
 exams(){let arr=current.role==='student'?db.exams.filter(a=>a.grade===me().grade):current.role==='teacher'?db.exams.filter(a=>a.teacher===current.id):db.exams;return `<div class="grid"><div class="card"><div class="section-head"><h3>الاختبارات</h3>${current.role==='teacher'?'<button class="btn primary" data-mk-click="examModal()">+ إنشاء اختبار</button>':''}</div><div class="list">${arr.map(e=>`<div class="list-item"><div class="section-head"><div><b>${esc(e.title)}</b><div class="small muted">${esc(e.subject)} • ${esc(e.grade)} • ${e.duration} دقيقة</div></div>${current.role==='student'?`<button class="btn primary" data-mk-click="startExam('${e.id}')">ابدأ الاختبار</button>`:`<span class="chip">${e.questions.length} أسئلة</span>`}</div></div>`).join('')||'<div class="empty">لا توجد اختبارات.</div>'}</div></div></div>`},
 grades(){if(current.role==='teacher')return teacherGrades();let arr=db.grades.filter(g=>g.student===current.id);let avg=arr.length?Math.round(arr.reduce((s,g)=>s+(g.score/g.max*100),0)/arr.length):0;return `<div class="stats"><div class="stat"><span class="muted">متوسط الأداء</span><div class="num">${avg}%</div><div class="trend">استمر في التقدم 🚀</div></div><div class="stat"><span class="muted">عدد التقييمات</span><div class="num">${arr.length}</div></div><div class="stat"><span class="muted">أفضل مادة</span><div class="num" style="font-size:20px">${esc(bestSubject(current.id))}</div></div><div class="stat"><span class="muted">الإنجازات</span><div class="num">${db.achievements.filter(a=>a.student===current.id).length}</div></div></div><div class="card"><h3>سجل الدرجات والتقييمات</h3><div class="table-wrap"><table class="table"><tr><th>المادة</th><th>البند</th><th>النوع</th><th>الدرجة</th><th>التقييم</th><th>التاريخ</th></tr>${arr.map(g=>`<tr><td>${esc(g.subject)}</td><td>${esc(g.title)}</td><td>${esc(g.type)}</td><td><b>${g.score}/${g.max}</b></td><td>${esc(g.comment||'—')}</td><td>${esc(g.date)}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">لا توجد درجات بعد.</td></tr>'}</table></div></div>`},
 attendance(){if(current.role==='teacher')return teacherAttendance();if(current.role==='admin')return adminAttendance();if(current.role==='parent')return parentAttendance();return studentAttendance()},
 schedule(){let u=me();let arr=current.role==='student'?db.schedule.filter(x=>x.grade===u.grade):current.role==='teacher'?db.schedule.filter(x=>x.teacher===u.name):db.schedule;return `<div class="grid"><div class="card"><div class="section-head"><h3>الجدول الدراسي</h3><span class="chip">الأسبوع الحالي</span></div><div class="timeline">${arr.map(x=>`<div class="event"><b>${esc(x.day)} — ${esc(x.time)}</b><div>${esc(x.subject)} • ${esc(x.teacher)}</div><span class="small muted">${esc(x.grade)}</span></div>`).join('')||'<div class="empty">لا توجد حصص.</div>'}</div></div></div>`},
 library(){const allowed=current.role==='student'?[me().grade]:current.role==='parent'?visibleStudents().map(x=>x.grade):null;const arr=(allowed?db.library.filter(x=>allowed.includes(x.grade)):db.library).slice(0,80);const lessons=(allowed?db.lessonLinks.filter(x=>allowed.includes(x.grade)):db.lessonLinks).slice(0,80);return `<div class="grid"><div class="card"><div class="section-head"><h3>📚 الدروس والمكتبة التعليمية</h3><span class="chip">${lessons.length} دروس • ${arr.length} موارد</span></div><h4>🎓 الدروس</h4><div class="quick-grid">${lessons.map(x=>`<div class="quick"><div style="font-size:28px">🎓</div><b>${esc(x.title)}</b><span class="small muted">${esc(x.subject)} • ${esc(x.grade)}</span><button class="btn" data-mk-click="openLesson('${x.id}')">فتح الدرس</button></div>`).join('')||'<div class="empty">لا توجد دروس.</div>'}</div><h4 style="margin-top:22px">📖 الملخصات والموارد</h4><div class="list">${arr.map(x=>`<div class="list-item"><div class="section-head"><div><b>📘 ${esc(x.title)}</b><div class="small muted">${esc(x.subject)} • ${esc(x.grade)}</div></div><span class="chip">${esc(x.type)}</span></div><button class="btn" data-mk-click="openLibraryResource('${x.id}')">فتح المورد</button></div>`).join('')||'<div class="empty">لا توجد موارد.</div>'}</div></div></div>`},
 ai(){const u=me();const ctx=current.role==='student'?`السنة: ${esc(u?.grade||'غير محدد')} • متوسط الدرجات: ${avgStudent(current.id)}% • الحضور: ${attendanceStats(current.id).rate}%`:current.role==='parent'?`عدد الأبناء المرتبطين: ${visibleStudents().length}`:current.role==='teacher'?`الطلاب المرتبطون بموادك: ${teacherStudents(current.id).length}`:'بيانات المنصة متاحة للتحليل';return `<div class="card mk-ai-card"><div class="section-head"><div><h3>🤖 MK AI — Chat AI</h3><span class="small muted">محادثة ذكية Server-side، مع سياق حسابك وبيانات MK Platform المصرح بها.</span></div><span id="aiStatusChip" class="chip info">جاري التحقق...</span></div><div class="ai-context">📌 ${ctx}</div><div class="ai-tools"><button data-mk-click="aiQuick('حلل مستواي')">📊 حلل مستواي</button><button data-mk-click="aiQuick('ما واجباتي واختباراتي القادمة؟')">📝 واجباتي</button><button data-mk-click="aiQuick('اشرح لي قانون نيوتن الثاني بطريقة بسيطة مع مثال')">📚 اشرح</button><button data-mk-click="aiQuick('اختبرني في مادة من موادي')">🧠 اختبرني</button><button data-mk-click="aiNewChat()">＋ محادثة جديدة</button></div><div class="ai-shell"><div id="aiMessages" class="ai-messages"></div><div class="ai-input"><textarea id="aiInput" rows=2 placeholder="اكتب أي سؤال... مثل ChatGPT: اشرح، حل، قارن، لخص، حلل مستواي، أو اسأل عن المنصة"></textarea><button class="btn primary" id="aiSendBtn" data-mk-click="askAI()">إرسال</button></div><div class="small muted ai-hint">Enter للإرسال • Shift+Enter لسطر جديد • المحادثة محفوظة لهذا الحساب على هذا الجهاز.</div></div></div>`},
 settings(){return `<div class="grid"><div class="card"><h3>إعدادات المنصة</h3><div class="quick-grid"><button class="quick" data-mk-click="toggleTheme()">◐<b>الوضع الليلي</b></button><button class="quick" data-mk-click="exportData()">⬇️<b>نسخ احتياطي</b></button><button class="quick" data-mk-click="importModal()">⬆️<b>استرجاع نسخة</b></button><button class="quick" data-mk-click="resetData()">♻️<b>إعادة تهيئة بيانات المنصة</b></button></div></div><div class="card"><div class="section-head"><h3>🤖 MK AI — خادم الذكاء الاصطناعي</h3><span id="aiStatusChip" class="chip info">جاري التحقق...</span></div><p id="aiHelpText" class="muted">جارٍ فحص خدمة الخادم. يعمل مساعد المنصة المحلي عند عدم إعداد مزود النموذج.</p><div class="notice good">🔒 لا توجد مفاتيح AI سرية داخل المتصفح.</div></div></div>`},
 studentAffairs(){if(current.role!=='admin')return forbidden();const q=String(document.getElementById('saSearch')?.value||'').trim().toLowerCase();const arr=db.students.filter(s=>!q||[s.name,s.id,s.email,s.grade].some(v=>String(v||'').toLowerCase().includes(q)));return `<div class="grid"><div class="card"><div class="section-head"><div><h3>🗂️ شؤون الطلبة</h3><span class="small muted">تابع بيانات الطلاب وإدارة ملفاتهم من لوحة الإدارة.</span></div><span class="chip info">${arr.length} طالب</span></div><div class="row" style="margin:12px 0;gap:8px"><input id="saSearch" value="${esc(q)}" placeholder="ابحث بالاسم أو ID الطالب أو البريد" data-mk-input="renderPage()"></div><div class="table-wrap"><table class="table"><tr><th>الطالب</th><th>ID الطالب</th><th>الميلاد</th><th>الملفات</th><th>إجراء</th></tr>${arr.map(s=>`<tr><td><b>${esc(s.name)}</b><br><span class="small muted">${esc(s.grade)}</span></td><td><code>${esc(s.id)}</code></td><td>${esc(s.birthDate||'غير مسجل')}</td><td>${Array.isArray(s.files)?s.files.length:0}</td><td><button class="btn primary" data-mk-click="openStudentAffairs('${s.id}')">فتح الملف</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">لا يوجد طلاب.</td></tr>'}</table></div></div></div>`},
 courses(){const courses=Array.isArray(db.courses)?db.courses:[];const isAdmin=current.role==='admin',isStudent=current.role==='student';return `<div class="grid"><div class="card"><div class="section-head"><div><h3>🎓 الدورات التعليمية</h3><span class="small muted">دورات مجانية ومدفوعة مع موافقة الإدارة وتتبع التقدم.</span></div>${isAdmin?'<button class="btn primary" data-mk-click="courseModal()">+ إضافة دورة</button>':''}</div>${isAdmin?`<div class="notice">طلبات الالتحاق المعلقة: ${courses.reduce((n,c)=>n+(c.pending||[]).length,0)}</div>`:''}<div class="grid" style="margin-top:15px">${courses.map(c=>{const access=isStudent&&courseAccess(c,current.id),pending=isStudent&&coursePending(c,current.id),prog=isStudent?courseProgress(c,current.id):null;return `<div class="card half"><div class="section-head"><h3>${esc(c.title)}</h3><span class="chip ${c.type==='paid'?'warn':'good'}">${c.type==='paid'?`مدفوعة • ${c.price} ج.م`:'مجانية'}</span></div>${c.cover?.fileId?`<img data-mk-file-ref="${esc(c.cover.fileId)}" style="width:100%;max-height:180px;object-fit:cover;border-radius:14px">`:''}<p>${esc(c.description||'')}</p><div class="small muted">المدرب: ${esc(c.instructor||'—')} • ${c.lessons.length} درس</div>${isStudent?`<div class="meter" style="margin-top:10px"><i style="width:${prog?.percent||0}%"></i></div><div class="small">التقدم: ${prog?.percent||0}%</div>${access?c.lessons.map((l,i)=>`<button class="btn ${prog?.done?.includes(i)?'good':''}" style="margin:3px" data-mk-click="toggleCourseLesson('${c.id}',${i})">${prog?.done?.includes(i)?'✓ ':'○ '}${esc(l)}</button>`).join(''):pending?'<div class="notice">طلبك قيد مراجعة الإدارة.</div>':`<button class="btn primary" style="margin-top:12px" data-mk-click="requestCourse('${c.id}')">${c.type==='paid'?'طلب الالتحاق المدفوع':'ابدأ الدورة مجانًا'}</button>`}`:''}${isAdmin?`<div style="margin-top:12px"><button class="btn danger" data-mk-click="deleteCourse('${c.id}')">حذف الدورة</button>${(c.pending||[]).length?`<h4>طلبات معلقة</h4>${c.pending.map(sid=>{const st=db.students.find(x=>x.id===sid);return `<div class="list-item"><b>${esc(st?.name||sid)}</b> <button class="btn good" data-mk-click="approveCourseRequest('${c.id}','${sid}')">قبول</button> <button class="btn danger" data-mk-click="rejectCourseRequest('${c.id}','${sid}')">رفض</button></div>`}).join('')}`:''}</div>`:''}</div>`}).join('')||'<div class="empty">لا توجد دورات حاليًا.</div>'}</div></div>`},
  questionBank(){if(current.role!=='teacher')return forbidden();let mine=db.questionBank.filter(q=>q.teacher===current.id);return `<div class="grid"><div class="card"><div class="section-head"><div><h3>🧠 بنك الأسئلة</h3><div class="small muted">أسئلة اختيار من متعدد A / B / C / D مع إمكانية إرفاق صورة للسؤال</div></div><button class="btn primary" data-mk-click="questionModal()">+ سؤال جديد</button></div><div class="list">${mine.map(q=>{let opts=(q.options||[q.answer,'إجابة أخرى','إجابة أخرى','إجابة أخرى']).slice(0,4);return `<div class="list-item">${q.imageFileId?`<img class="assignment-question-img" data-mk-file-ref="${esc(q.imageFileId)}" alt="صورة السؤال">`:''}${q.text?`<b>${esc(q.text)}</b>`:''}<div class="small muted">${esc(q.subject)} • ${esc(q.grade)} • ${opts.length} اختيارات</div><div class="mcq-preview">${opts.map((o,i)=>`<span><b>${String.fromCharCode(65+i)}</b> ${esc(o)}</span>`).join('')}</div></div>`}).join('')||'<div class="empty">ابدأ ببناء بنك أسئلتك.</div>'}</div></div></div>`},
 complaints(){let mine=current.role==='admin'?db.complaints:current.role==='parent'?db.complaints.filter(c=>c.from===current.id):current.role==='student'?db.complaints.filter(c=>c.from===current.id):db.complaints.filter(c=>c.from===current.id);return `<div class="grid"><div class="card"><div class="section-head"><h3>🛟 الدعم والشكاوى</h3>${current.role!=='admin'?'<button class="btn primary" data-mk-click="complaintModal()">+ طلب جديد</button>':''}</div><div class="list">${mine.map(c=>`<div class="list-item"><div class="section-head"><b>${esc(c.title)}</b><span class="chip ${c.status==='تم الحل'?'good':c.status==='قيد المراجعة'?'warn':'info'}">${esc(c.status)}</span></div><p>${esc(c.body)}</p><div class="small muted">${esc(c.date)} • ${esc(c.fromName)}</div>${current.role==='admin'?`<button class="btn" data-mk-click="resolveComplaint('${c.id}')">تحديث الحالة</button>`:''}</div>`).join('')||'<div class="empty">لا توجد طلبات.</div>'}</div></div></div>`},
 certificates(){let arr=current.role==='admin'?db.certificates:db.certificates.filter(c=>c.student===current.id);return `<div class="grid"><div class="card"><div class="section-head"><h3>🏅 الشهادات</h3>${current.role==='admin'?'<button class="btn primary" data-mk-click="certificateModal()">+ إصدار شهادة</button>':''}</div><div class="quick-grid">${arr.map(c=>`<div class="quick"><div style="font-size:38px">🏅</div><b>${esc(c.title)}</b><span class="small muted">${esc(c.studentName)} • ${esc(c.date)}</span><button class="btn" data-mk-click="printCertificate('${c.id}')">طباعة</button></div>`).join('')||'<div class="empty" style="grid-column:1/-1">لا توجد شهادات.</div>'}</div></div></div>`},
};
function forbidden(){return `<div class="card"><div class="empty">هذه الصفحة غير متاحة لصلاحيات حسابك.</div></div>`}
function adminDash(){
 const students=Array.isArray(db.students)?db.students:[],courses=Array.isArray(db.courses)?db.courses:[],attendance=Object.values(db.attendance||{}).flatMap(value=>Object.values(value||{})),rate=attendance.length?Math.round(attendance.filter(value=>value==='present').length/attendance.length*100):0,pending=(db.complaints||[]).filter(item=>item.status!=='تم الحل').length,recent=(db.audit||[]).slice(-5).reverse();
 const shortcuts=[['studentAffairs','بيانات الطلاب','👥'],['courses','الدورات','🎓'],['subjects','المواد','📚'],['assignments','الواجبات','📝'],['exams','الاختبارات','🧪'],['questionBank','بنك الأسئلة','🧠'],['grades','الدرجات','⭐'],['attendance','الحضور','🟢'],['schedule','الجدول','🗓️'],['reports','التقارير','📊'],['community','المنتدى','💬'],['settings','الإعدادات','⚙️']];
 return '<div class="stats"><div class="stat"><span class="muted">الطلاب النشطون</span><div class="num">'+students.filter(item=>item.active!==false).length+'</div><div class="trend">من '+students.length+' حسابًا</div></div><div class="stat"><span class="muted">الدورات المنشورة</span><div class="num">'+courses.filter(item=>item.active!==false).length+'</div><div class="trend">محتوى متاح على المنصة</div></div><div class="stat"><span class="muted">الحضور</span><div class="num">'+rate+'%</div><div class="trend">حسب السجلات المحفوظة</div></div><div class="stat"><span class="muted">طلبات الدعم المفتوحة</span><div class="num">'+pending+'</div><div class="trend">بحاجة إلى متابعة</div></div></div><section class="card"><div class="section-head"><h2>إدارة المنصة</h2><span class="small muted">بيانات الطلاب والأقسام تحت صلاحية الإدارة</span></div><div class="quick-grid">'+shortcuts.map(item=>'<button class="quick" data-mk-click="mkPlatformOpen(\''+item[0]+'\')"><span>'+item[2]+'</span><b>'+item[1]+'</b></button>').join('')+'</div></section><section class="card"><div class="section-head"><h2>آخر العمليات الإدارية</h2><span class="small muted">سجل النشاط</span></div><div class="list">'+(recent.map(item=>'<div class="list-item"><b>'+esc(item.action||'عملية إدارية')+'</b><div class="small muted">'+esc(item.details||'—')+' • '+esc(new Date(item.date).toLocaleString('ar-EG'))+'</div></div>').join('')||'<div class="empty">لا توجد عمليات مسجلة بعد.</div>')+'</div></section>';
}
function parentDash(){
 const children=typeof visibleStudents==='function'?visibleStudents():[];
 return '<section class="card"><div class="section-head"><h2>الأبناء المرتبطون</h2><span class="chip">'+children.length+' حساب</span></div><div class="quick-grid">'+(children.map(child=>'<article class="quick"><b>'+esc(child.name||'طالب')+'</b><span class="small muted">ID: '+esc(child.id)+' • '+esc(child.grade||'')+'</span><div>الحضور '+attendanceStats(child.id).rate+'% • المتوسط '+avgStudent(child.id)+'%</div></article>').join('')||'<div class="empty" style="grid-column:1/-1">لا توجد حسابات طلاب مرتبطة.</div>')+'</div></section><section class="card"><h2>متابعة الأبناء</h2><div class="quick-grid"><button class="quick" data-mk-click="mkPlatformOpen(\'grades\')"><b>الدرجات</b></button><button class="quick" data-mk-click="mkPlatformOpen(\'attendance\')"><b>الحضور</b></button><button class="quick" data-mk-click="mkPlatformOpen(\'assignments\')"><b>الواجبات</b></button></div></section>';
}
function studentDash(){
 const user=me();if(!user)return '<div class="notice warn">جارٍ تحميل بيانات حسابك…</div>';
 const assignments=(db.assignments||[]).filter(item=>itemForStudent(item,user)),exams=(db.exams||[]).filter(item=>itemForStudent(item,user)),gradesForStudent=(db.grades||[]).filter(item=>String(item.student)===String(user.id)),attendance=attendanceStats(user.id),pending=assignments.filter(item=>!(db.submissions||[]).some(submission=>String(submission.assignment)===String(item.id)&&String(submission.student)===String(user.id))).length;
 return '<div class="stats"><div class="stat"><span class="muted">الحضور</span><div class="num">'+attendance.rate+'%</div><div class="trend">'+attendance.present+' حضور • '+attendance.absent+' غياب</div></div><div class="stat"><span class="muted">المتوسط</span><div class="num">'+avgStudent(user.id)+'%</div><div class="trend">'+gradesForStudent.length+' تقييم</div></div><div class="stat"><span class="muted">واجبات معلقة</span><div class="num">'+pending+'</div><div class="trend">من '+assignments.length+'</div></div><div class="stat"><span class="muted">اختبارات متاحة</span><div class="num">'+exams.length+'</div><div class="trend">لحسابك</div></div></div><section class="card"><div class="section-head"><h2>ابدأ التعلم</h2><span class="small muted">'+esc(user.name||'')+' • ID: '+esc(user.id)+'</span></div><p class="muted">تابع الدورات والواجبات والاختبارات من مكان واحد.</p><div class="quick-grid"><button class="quick" data-mk-click="mkPlatformOpen(\'courses\')"><span>🎓</span><b>دوراتي</b></button><button class="quick" data-mk-click="mkPlatformOpen(\'assignments\')"><span>📝</span><b>الواجبات</b></button><button class="quick" data-mk-click="mkPlatformOpen(\'exams\')"><span>🧪</span><b>الاختبارات</b></button><button class="quick" data-mk-click="mkPlatformOpen(\'grades\')"><span>⭐</span><b>النتائج</b></button></div></section><section class="card"><div class="section-head"><h2>أقرب الواجبات</h2><button class="btn" data-mk-click="mkPlatformOpen(\'assignments\')">عرض الكل</button></div><div class="list">'+(assignments.slice().sort((a,b)=>String(a.due).localeCompare(String(b.due))).slice(0,5).map(item=>assignmentCard(item)).join('')||'<div class="empty">لا توجد واجبات قريبة.</div>')+'</div></section>';
}function teacherAttendance(){const arr=teacherStudents(current.id);return `<div class="grid"><div class="card"><div class="section-head"><h3>تسجيل حضور الطلاب المرتبطين بموادك</h3><div class="row"><input id="attDate" type="date" value="${new Date().toISOString().slice(0,10)}"><button class="btn good" data-mk-click="markAllPresent()">✓ حضور الكل</button></div></div><div class="notice good">يمكنك تسجيل حضور الطلاب المرتبطين بموادك فقط.</div><div class="table-wrap" style="margin-top:15px"><table class="table"><tr><th>الطالب</th><th>السنة الدراسية</th><th>الحالة</th><th>تغيير</th></tr>${arr.map(s=>{let date=document.getElementById('attDate')?.value||new Date().toISOString().slice(0,10),status=(db.attendance[s.id]||{})[date]||'present';return `<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.grade)}</td><td>${statusBadge(status)}</td><td><div class="attendance-actions"><button data-mk-click="setAttendance('${s.id}','present')">حاضر</button><button data-mk-click="setAttendance('${s.id}','late')">متأخر</button><button data-mk-click="setAttendance('${s.id}','absent')">غائب</button><button data-mk-click="setAttendance('${s.id}','excused')">بعذر</button></div></td></tr>`}).join('')}</table></div></div></div>`}
function markAllPresent(){if(current.role!=='teacher')return;const date=document.getElementById('attDate')?.value||new Date().toISOString().slice(0,10);teacherStudents(current.id).forEach(s=>(db.attendance[s.id]??={})[date]='present');save();renderPage();toast('تم تسجيل حضور طلابك بالكامل')}
function gradeModal(){const students=teacherStudents(current.id),subs=db.subjects.filter(s=>s.teacher===current.id);openModal(`<h3>إضافة تقييم أو درجة</h3><form data-mk-submit="addGrade(event)"><div class="field"><label>الطالب</label><select id="gmStudent">${students.map(s=>`<option value="${s.id}">${esc(s.name)} — ${esc(s.grade)}</option>`).join('')}</select></div><div class="field"><label>المادة</label><select id="gmSub">${subs.map(s=>`<option value="${s.name}|${s.grade}">${esc(s.name)} — ${esc(s.grade)}</option>`).join('')}</select></div><div class="field"><label>عنوان التقييم</label><input id="gmTitle" required></div><div class="row"><div class="field"><label>الدرجة</label><input id="gmScore" type="number" min="0" required></div><div class="field"><label>من</label><input id="gmMax" type="number" value="10" min="1"></div></div><div class="field"><label>ملاحظات</label><textarea id="gmComment" rows="3"></textarea></div><button class="btn primary">حفظ التقييم</button></form>`)}

/* Stronger local AI: school-first retrieval + broad educational fallback. It is intentionally offline and needs no API key. */
function aiKnowledge(text){const t=text.replace(/[؟?!،,.;:]/g,' ').replace(/\s+/g,' ').trim();
  if(/ما هو|ما هي|معنى|تعريف/.test(t)&&/الخلية/.test(t))return 'الخلية هي الوحدة الأساسية في بناء الكائنات الحية ووظائفها. تحتوي الخلايا على مكونات متخصصة مثل النواة والغشاء والسيتوبلازم، مع اختلاف التفاصيل بين الخلايا النباتية والحيوانية.';
  if(/ما هو|ما هي|تعريف/.test(t)&&/التمثيل الضوئي/.test(t))return 'البناء الضوئي عملية تصنع فيها النباتات غذاءها باستخدام الضوء والماء وثاني أكسيد الكربون، وينتج عنها الجلوكوز والأكسجين.';
  if(/قانون نيوتن|القوة|التسارع/.test(t))return 'قانون نيوتن الثاني يربط القوة بالكتلة والتسارع: F = m × a. إذا زادت القوة مع ثبات الكتلة زاد التسارع، وإذا زادت الكتلة مع ثبات القوة قل التسارع.';
  if(/فيثاغورس|مثلث قائم/.test(t))return 'في المثلث القائم: مربع طول الوتر يساوي مجموع مربعي الضلعين القائمين: c² = a² + b².';
  if(/نسبة مئوية|%/.test(t)){const m=t.match(/(\d+(?:\.\d+)?)\s*(?:من|%)\s*(\d+(?:\.\d+)?)/);if(m)return `${m[1]} من ${m[2]} = ${(+m[1]/+m[2]*100).toFixed(2)}%`}
  if(/فاعل|مفعول به|مبتدأ|خبر|نعت|حال|إعراب/.test(t))return 'أرسل الجملة العربية كاملة، وسأحدد عناصرها وإعراب الكلمات المطلوبة خطوة بخطوة. مثال: «عسى الخفي من الأقدار يبهجنا».';
  if(/ترجم|بالانجليزي|بالإنجليزي/.test(t))return 'اكتب الكلمة أو الجملة المطلوبة وسأعطيك ترجمتها، ومعناها في السياق، ونطقها التقريبي إذا لزم.';
  return '';
}
function aiSchoolContext(text){const user=me(),student=current.role==='student'?user:null,allowedGrades=student?[student.grade]:current.role==='parent'?visibleStudents().map(s=>s.grade):null;const lessons=db.lessonLinks.filter(l=>!allowedGrades||allowedGrades.includes(l.grade)),subjectsData=db.subjects.filter(s=>!allowedGrades||allowedGrades.includes(s.grade)),q=String(text||'').toLocaleLowerCase();const match=lessons.find(l=>[l.title,l.subject].map(v=>String(v||'').trim().toLocaleLowerCase()).filter(term=>term.length>=2).some(term=>q.includes(term)));return {lessons,subjectsData,match}}
function aiAnswer(q){
  const user=me(), text=String(q||'').trim(), low=text.toLowerCase(), isStudent=current.role==='student',isParent=current.role==='parent',isTeacher=false;
  const students=isParent?visibleStudents():(isStudent?[user]:db.students);const gradesFor=id=>db.grades.filter(g=>g.student===id),avgFor=id=>avgStudent(id),attFor=id=>attendanceStats(id);
  const school=aiSchoolContext(text), knowledge=aiKnowledge(text);
  const requestedSubject=(db.subjects.map(x=>x.name).find(x=>low.includes(String(x).toLowerCase()))||db.grades.find(g=>low.includes(String(g.subject).toLowerCase()))?.subject||'');
  if(/حلل مستواي|تحليل مستواي|مستواي/.test(text)&&(isStudent||isParent)){
    return students.map(s=>{const gs=gradesFor(s.id),by={};gs.forEach(g=>(by[g.subject]??=[]).push(g.score/g.max*100));const rows=Object.entries(by).map(([sub,a])=>[sub,Math.round(a.reduce((x,y)=>x+y,0)/a.length)]).sort((a,b)=>a[1]-b[1]);const st=attFor(s.id);return `📊 ${s.name}\n• المتوسط: ${avgFor(s.id)}%\n• الحضور: ${st.rate}%\n• أضعف المواد حسب السجلات: ${rows.slice(0,3).map(x=>x[0]+' '+x[1]+'%').join('، ')||'لا توجد درجات كافية'}`}).join('\n\n');
  }
  if(/واجب|واجبات|تسليم/.test(text)){const arr=db.assignments.filter(a=>students.some(s=>itemForStudent(a,s)));return arr.length?`📝 الواجبات المرتبطة بك:\n${arr.slice(0,15).map(a=>`• ${a.title} — ${a.subject} — ${a.due}`).join('\n')}`:'لا توجد واجبات مرتبطة حاليًا.'}
  if(/اختبار|امتحان/.test(text)){const arr=db.exams.filter(a=>students.some(s=>itemForStudent(a,s)));return arr.length?`🧪 الاختبارات المتاحة:\n${arr.slice(0,15).map(a=>`• ${a.title} — ${a.subject} — ${a.duration} دقيقة`).join('\n')}`:'لا توجد اختبارات منشورة مرتبطة بك.'}
  if(/حضور|غياب|تأخير/.test(text))return students.map(s=>{const a=attFor(s.id);return `👤 ${s.name}: حضور ${a.rate}% • ${a.present} حضور • ${a.absent} غياب • ${a.late} تأخير • ${a.excused} بعذر`}).join('\n')||'لا توجد بيانات حضور.';
  if(/درج|تقييم|متوسط|نتيج/.test(text))return students.map(s=>`${s.name}: المتوسط ${avgFor(s.id)}% • عدد التقييمات ${gradesFor(s.id).length}`).join('\n')||'لا توجد درجات مسجلة.';
  if(/اشرح|شرح|افهم|وضح/.test(text)){
    if(school.match)return `📚 من محتوى المنصة: ${school.match.title} — ${school.match.subject}\n${school.match.description||'لا يوجد وصف كافٍ في بيانات الدرس.'}\n\nإذا أردت شرحًا أوسع، اكتب اسم الجزء أو السؤال المحدد.`;
    if(knowledge)return knowledge;
    return `أقدر أشرح لك خطوة بخطوة. اكتب اسم المادة + الدرس + السؤال، مثل: «اشرح لي قانون نيوتن الثاني بمثال» أو «اشرح درس المفعول به».`;
  }
  if(/اختبرني|اسألني|سؤال/.test(text)){const grade=isStudent?user.grade:students[0]?.grade;const e=db.exams.find(x=>x.grade===grade&&(!requestedSubject||x.subject===requestedSubject));if(e)return `وجدت اختبارًا مرتبطًا بك: ${e.title} (${e.questions.length} سؤال). افتح «الاختبارات» لبدئه.`;return 'لا يوجد اختبار مناسب محفوظ في المنصة حاليًا. يمكن لإدارة المنصة إنشاء اختبار من قسم الاختبارات.'}
  if(/تنبيه|إشعار/.test(text)){const ns=db.notifications.filter(n=>n.to===current.id||n.to==='all').slice(-10).reverse();return ns.length?`🔔 آخر التنبيهات:\n${ns.map(n=>`• ${n.title}: ${n.body}`).join('\n')}`:'لا توجد تنبيهات جديدة.'}
  const calc=text.match(/(-?\d+(?:\.\d+)?)\s*([+\-×x*÷/])\s*(-?\d+(?:\.\d+)?)/);if(calc){const a=+calc[1],b=+calc[3],op=calc[2],r=op==='+'?a+b:op==='-'?a-b:op==='÷'||op==='/'?a/b:a*b;return `🧮 ${a} ${op} ${b} = ${r}`}
  if(knowledge)return `📘 ${knowledge}`;
  if(school.match)return `📚 وجدت في محتوى المنصة: ${school.match.title} — ${school.match.description||'المحتوى متاح داخل المكتبة.'}`;
  if(isTeacher)return `أقدر أبحث داخل بياناتك التعليمية: ${db.subjects.filter(x=>x.teacher===current.id).length} مادة، ${db.assignments.filter(x=>x.teacher===current.id).length} واجب، ${db.exams.filter(x=>x.teacher===current.id).length} اختبار. اكتب سؤالك بصيغة طبيعية وسأحاول ربطه بالبيانات.`;
  if(isParent)return `أقدر مساعدتك في متابعة ${students.length} من الأبناء المرتبطين بالحساب: الدرجات، الحضور، الواجبات، الاختبارات، التنبيهات.`;
  return `أنا MK AI المحلي. أبحث أولًا في بيانات المنصة والحساب، ثم أستخدم قاعدة تعليمية محلية للأسئلة العامة.\n\nجرّب سؤالًا مباشرًا مثل:\n• «ما هو قانون نيوتن الثاني؟»\n• «اشرح لي درس الرياضيات»\n• «ما واجباتي؟»\n• «حلل مستواي»\n• «ما المواد المسجلة لي؟»\n• «ما درجاتي وحضوري؟»\n\nملاحظة: بدون خدمة نموذج ذكاء اصطناعي خارجية لا يمكن لهذا الملف المحلي أن يضمن إجابة صحيحة حرفيًا عن كل سؤال في العالم، لكنه يعمل بدون مفتاح API ويعتمد على بيانات المنصة أولًا.`;
}

/* Better student details: show the real class and teacher assignments. */
studentDetails=function(id){const s=db.students.find(x=>String(x.id)===String(id));if(!s)return;const st=attendanceStats(id),g=db.grades.filter(x=>x.student===id),subs=db.subjects.filter(x=>x.grade===s.grade);openModal(`<h3>${esc(s.name)}</h3><div class="grade-banner"><b>${esc(s.grade)}</b><p>الحضور ${st.rate}% • المتوسط ${avgStudent(id)}% • التقييمات ${g.length}</p></div><h4 style="margin-top:18px">📚 المواد المرتبطة</h4><div class="list">${subs.map(x=>`<div class="list-item"><b>${esc(x.name)}</b><span class="small muted">${esc('إدارة المنصة')}</span></div>`).join('')||'<div class="empty">لا توجد مواد مرتبطة.</div>'}</div>`)}

/* Ensure old records become compatible with the stronger relationship model. */


function finishLogin(u,auto=false){
  if(!u)return false;
  if(u.active===false){if(!auto)toast('الحساب متوقف');return false}
  const role=String(u.role||'').toLowerCase();
  if(!['admin','parent','student'].includes(role)){if(!auto)toast('نوع الحساب غير مدعوم في المنصة.');return false}
  current={id:String(u.id),role};
  __mkAuthReady=false;
  audit('login',`${auto?'دخول مباشر':'تسجيل دخول'} ${role}`);
  document.getElementById('auth').style.display='none';
  document.getElementById('app').style.display='block';
  document.body.classList.add('mk-platform-only');
  renderSide();showPage(role==='parent'?'dashboard':'courses');
  if(!auto)toast('مرحبًا بك في منصة MK التعليمية');
  return true;
}

let __mkLoginPending=false;
function mkTogglePassword(id){
  const input=document.getElementById(String(id||''));if(!input)return;
  const button=[...document.querySelectorAll('[data-mk-password-toggle]')].find(item=>item.getAttribute('data-mk-password-toggle')===input.id),visible=input.type==='password';
  input.type=visible?'text':'password';
  if(button){button.setAttribute('aria-pressed',String(visible));button.setAttribute('aria-label',visible?'إخفاء كلمة المرور':'إظهار كلمة المرور');button.title=visible?'إخفاء كلمة المرور':'إظهار كلمة المرور';button.innerHTML=visible?'<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path d="m3 3 18 18"/></svg>':'<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';}
  input.focus();
}

async function login(e){
  if(e)e.preventDefault();if(__mkLoginPending)return false;__mkLoginPending=true;
  const submitButton=document.querySelector('#loginForm button[type="submit"]');if(submitButton)submitButton.disabled=true;
  try{
    const identifier=String(document.getElementById('loginEmail')?.value||'').trim(),pass=String(document.getElementById('loginPass')?.value||'');
    if(!identifier||!pass){toast('اكتب البريد أو اسم المستخدم وكلمة المرور');return false;}
    if(!window.mkVideoEngineConfigured?.()){toast('خادم المنصة غير متاح حاليًا. حاول مرة أخرى بعد تشغيله.');return false;}
    const probe={id:identifier,email:identifier,role:'student',parentPhone:String(document.getElementById('loginParentPhone')?.value||'').trim()};
    if(!await window.mkBackendAuthLogin?.(probe,pass,document.getElementById('rememberLogin')?.checked!==false)){toast(window.mkBackendAuthError||'تعذر تسجيل الدخول. تحقق من بياناتك ثم أعد المحاولة.');return false;}
    const dataId=String(window.mkBackendLastUserId||identifier),dataRole=String(window.mkBackendLastRole||'');
    if(!finishLogin({id:dataId,role:dataRole,name:dataId,active:true},false))return false;
    const pulled=await window.mkBackendPullPlatform?.();
    if(!pulled){const reason=String(window.__mkBackendLastError||'تعذر تحميل بيانات المنصة من الخادم.');current=null;__mkAuthReady=false;__mkServerSnapshot=null;__mkServerRevision=0;window.__mkServerAllowedKeys=new Set();mkRuntimeRemoveItem('mk_video_jwt');document.body.classList.remove('mk-platform-only','mk-platform-active');document.getElementById('app').style.display='none';document.getElementById('auth').style.display='grid';toast(`لم يكتمل تحميل بيانات المنصة: ${reason}`);return false;}
    const live=[...(db.students||[]),...(db.parents||[]),...Object.values(db.users||{})].find(x=>String(x.id)===dataId);
    if(live?.active===false){await logout();toast('الحساب متوقف أو ينتظر اعتماد إدارة المنصة.');return false;}
    if(live)current={...live,id:dataId,role:dataRole};
    __mkAuthReady=true;document.body.classList.add('mk-platform-only');renderSide();showPage(current.role==='parent'?'dashboard':'courses');window.mkStartServerStateCoordinator?.();
    toast('مرحبًا بك في منصة MK التعليمية');return true;
  }catch(err){console.error('MK Platform login error:',err);toast('حدث خطأ أثناء تسجيل الدخول. أعد المحاولة.');return false;}
  finally{__mkLoginPending=false;if(submitButton?.isConnected)submitButton.disabled=false;}
}

async function autoLoginLastAccount(){
  const cfg=window.mkVideoCfg?.()||{};if(!cfg.url||!window.mkVideoEngineConfigured?.())return false;
  try{
    const response=await fetch(cfg.url+'/api/v1/auth/session',{credentials:'include',cache:'no-store'});if(!response.ok)return false;
    const data=await response.json();if(!data?.token||!data?.user_id||!data?.role)return false;
    mkRuntimeSetItem('mk_video_jwt',data.token);window.mkBackendLastUserId=String(data.user_id);window.mkBackendLastRole=String(data.role);
    if(!finishLogin({id:String(data.user_id),role:String(data.role),name:String(data.user_id),active:true},true))return false;
    const pulled=await window.mkBackendPullPlatform?.();if(!pulled)throw new Error(window.__mkBackendLastError||'تعذر تحميل بيانات المنصة');
    const id=String(data.user_id),live=[...(db.students||[]),...(db.parents||[]),...Object.values(db.users||{})].find(x=>String(x.id)===id);
    if(live?.active===false)throw new Error('الحساب متوقف أو ينتظر اعتماد الإدارة');if(live)current={...live,id,role:String(data.role)};
    __mkAuthReady=true;document.body.classList.add('mk-platform-only');renderSide();showPage(current.role==='parent'?'dashboard':'courses');window.mkStartServerStateCoordinator?.();return true;
  }catch(error){mkRuntimeRemoveItem('mk_video_jwt');current=null;__mkAuthReady=false;document.body.classList.remove('mk-platform-only','mk-platform-active');document.getElementById('app').style.display='none';document.getElementById('auth').style.display='grid';console.warn('MK session restore failed',error?.message||error);return false;}
}

async function logout(){
  const cfg=window.mkVideoCfg?.()||{},token=mkRuntimeGetItem('mk_video_jwt');
  if(cfg.url&&token)try{await fetch(cfg.url+'/api/v1/auth/logout',{method:'POST',credentials:'include',headers:{Authorization:'Bearer '+token}})}catch{}
  current=null;__mkAuthReady=false;__mkServerSnapshot=null;__mkServerRevision=0;__mkAccountSignature='';window.__mkServerAllowedKeys=new Set();
  mkRuntimeRemoveItem('mk_video_jwt');mkRuntimeRemoveItem('mk_video_media_tokens');document.body.classList.remove('mk-platform-only','mk-platform-active');
  document.getElementById('app').style.display='none';document.getElementById('auth').style.display='grid';
  if(document.getElementById('loginEmail'))document.getElementById('loginEmail').value='';if(document.getElementById('loginPass'))document.getElementById('loginPass').value='';
}

document.getElementById('loginForm').addEventListener('submit',login);

if(mkRuntimeGetItem('mk_theme')==='dark' && !document.body.classList.contains('dark'))toggleTheme();

/* ===== MK Platform V17 Upgrade ===== */
  const style=document.createElement('style');
  style.textContent=`
    .class-card{position:relative;text-align:right}
    .class-card .class-count{font-size:24px;font-weight:900;margin:10px 0}
    .mini-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
    .mini-actions .btn{padding:8px 10px;font-size:12px}
    .school-kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
    .school-kpi .k{padding:14px;border:1px solid var(--line);border-radius:16px;background:var(--surface2)}
    .school-kpi .k b{display:block;font-size:24px;margin-top:5px}

    .report-bar{display:grid;grid-template-columns:160px 1fr 60px;gap:10px;align-items:center;margin:9px 0}
    .report-bar .progress{margin:0}
    @media(max-width:900px){.school-kpi{grid-template-columns:1fr 1fr}.report-bar{grid-template-columns:1fr 60px}.report-bar .progress{grid-column:1/-1}}
  `;
  document.head.appendChild(style);

function notifyUser(to,title,body){
  if(!to)return;
  db.notifications.push({id:uid('n'),to,title,body,date:new Date().toLocaleString('ar-EG')});
}


function addChildToParentModal(){if(current?.role!=='parent')return forbidden();toast('للأمان، لا يمكن الربط باستخدام ID الطالب. استخدم كود الربط المؤقت من لوحة ولي الأمر.')}
function addChildToParent(e){if(e?.preventDefault)e.preventDefault();return addChildToParentModal()}

pages.students=function(){if(current.role==='admin')return pages.studentAffairs();const arr=current.role==='teacher'?visibleStudents():db.students;return `<div class="grid"><div class="card"><div class="section-head"><h3>${current.role==='parent'?'👨‍👩‍👧 أبنائي':current.role==='teacher'?'طلاب موادي':'الطلاب'}</h3>${current.role==='admin'?'<button class="btn primary" data-mk-click="studentModal()">+ إضافة طالب</button>':''}</div><div class="table-wrap"><table class="table"><tr><th>الطالب</th><th>السنة الدراسية</th><th>الحضور</th><th>المتوسط</th><th></th></tr>${arr.map(s=>`<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.grade)}</td><td>${attendanceStats(s.id).rate}%</td><td>${avgStudent(s.id)}%</td><td><button class="btn" data-mk-click="studentDetails('${s.id}')">عرض الملف</button></td></tr>`).join('')}</table></div></div></div>`};

// Enhanced reports: class, subject, absence and performance indicators.
pages.reports=function(){
  if(current.role!=='admin')return forbidden();
  const total=Object.values(db.attendance).flatMap(x=>Object.values(x));
  const present=total.filter(x=>x==='present').length;
  const overall=total.length?Math.round(present/total.length*100):0;
  const late=total.filter(x=>x==='late').length, absent=total.filter(x=>x==='absent').length;
  const subjectMap={};db.grades.forEach(g=>{subjectMap[g.subject]??=[];subjectMap[g.subject].push(g.score/g.max*100)});
  const subjectRows=Object.entries(subjectMap).map(([sub,a])=>[sub,Math.round(a.reduce((x,y)=>x+y,0)/a.length)]).sort((a,b)=>b[1]-a[1]);
  const top=[...db.students].map(s=>({s,avg:avgStudent(s.id)})).sort((a,b)=>b.avg-a.avg).slice(0,6);
  const frequent=[...db.students].map(s=>({s,st:attendanceStats(s.id)})).sort((a,b)=>b.st.absent-a.st.absent).slice(0,6);
  return `<div class="stats"><div class="stat"><span class="muted">الطلاب</span><div class="num">${db.students.length}</div></div><div class="stat"><span class="muted">الدورات</span><div class="num">${(db.courses||[]).length}</div></div><div class="stat"><span class="muted">الحضور</span><div class="num">${overall}%</div></div><div class="stat"><span class="muted">الغياب</span><div class="num">${absent}</div></div></div>
  <div class="grid"><div class="card half"><h3>📚 أداء المواد</h3>${subjectRows.slice(0,12).map(([sub,p])=>`<div class="report-bar"><span>${esc(sub)}</span><div class="progress"><i style="width:${p}%"></i></div><b>${p}%</b></div>`).join('')||'<div class="empty">لا توجد درجات.</div>'}</div>
  <div class="card half"><h3>🏆 أعلى متوسطات الطلاب</h3><div class="list">${top.map(x=>`<div class="list-item"><div class="section-head"><b>${esc(x.s.name)}</b><span>${x.avg}%</span></div><div class="progress"><i style="width:${x.avg}%"></i></div></div>`).join('')||'<div class="empty">لا توجد بيانات.</div>'}</div>
  <div class="card half"><h3>⚠️ الطلاب الأكثر غيابًا</h3><div class="list">${frequent.map(x=>`<div class="list-item"><div class="section-head"><b>${esc(x.s.name)}</b><span class="chip ${x.st.absent?'bad':'good'}">${x.st.absent} غياب</span></div><span class="small muted">حضور ${x.st.rate}% • تأخير ${x.st.late}</span></div>`).join('')}</div></div>
  <div class="card"><div class="section-head"><h3>📊 ملخص التشغيل</h3><span class="chip">تحديث مباشر</span></div><div class="school-kpi"><div class="k">الواجبات<b>${db.assignments.length}</b></div><div class="k">الاختبارات<b>${db.exams.length}</b></div><div class="k">التسليمات<b>${db.submissions.length}</b></div><div class="k">الطلاب<b>${db.students.length}</b></div></div></div></div>`;
};

// Attendance: validate the teacher, student, and status before saving.
function setAttendance(student,status){
  if(!current || current.role!=='teacher')return;
  if(!['present','late','absent','excused'].includes(status))return;
  if(!teacherStudents(current.id).some(s=>String(s.id)===String(student)))return;
  const date=document.getElementById('attDate')?.value||new Date().toISOString().slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
  db.attendance[student]??={};
  const before=db.attendance[student][date]||'present';
  db.attendance[student][date]=status;
  if(before!==status){
    const s=db.students.find(x=>String(x.id)===String(student));
    if(s){
      notifyUser(s.id,'Attendance updated',`Attendance for ${date}: ${statusLabel(status)}`);
      const p=db.parents.find(x=>(x.studentIds||[]).some(id=>String(id)===String(student)));
      if(p)notifyUser(p.id,'Student attendance updated',`${s.name}: ${statusLabel(status)}`);
      audit('update_attendance',`${s.name} | ${date} | ${status}`);
    }
  }
  save();
  renderPage();
}

// Grades: validate inputs and subject ownership before saving.
function addGrade(e){
  if(e)e.preventDefault();
  if(!current || current.role!=='teacher')return;
  const studentEl=document.getElementById('gmStudent');
  const subjectEl=document.getElementById('gmSub');
  const titleEl=document.getElementById('gmTitle');
  const scoreEl=document.getElementById('gmScore');
  const maxEl=document.getElementById('gmMax');
  const commentEl=document.getElementById('gmComment');
  if(!studentEl||!subjectEl||!titleEl||!scoreEl||!maxEl||!commentEl)return;
  const student=studentEl.value;
  const [subject,grade]=subjectEl.value.split('|');
  const title=titleEl.value.trim();
  const score=Number(scoreEl.value);
  const max=Number(maxEl.value);
  if(!title||!Number.isFinite(score)||!Number.isFinite(max)||max<=0||score<0||score>max){
    toast('Check the assessment title and score range.');
    return;
  }
  const s=db.students.find(x=>String(x.id)===String(student));
  const sub=db.subjects.find(x=>x.teacher===current.id&&x.name===subject&&x.grade===grade);
  if(!s||!sub||!teacherStudents(current.id).some(x=>String(x.id)===String(student))||s.grade!==grade){
    toast('You are not authorized to grade this student for this subject.');
    return;
  }
  const record={
    id:uid('g'),student:s.id,teacher:current.id,subject:sub.name,grade:sub.grade,
    type:'assessment',title,score,max,comment:commentEl.value.trim(),
    date:new Date().toISOString().slice(0,10)
  };
  db.grades.push(record);
  notifyUser(s.id,'New assessment grade',`${title}: ${score}/${max} in ${sub.name}`);
  const p=db.parents.find(x=>(x.studentIds||[]).some(id=>String(id)===String(s.id)));
  if(p)notifyUser(p.id,'New student grade',`${s.name}: ${title} (${score}/${max})`);
  audit('add_grade',`${s.name} | ${sub.name} | ${score}/${max}`);
  save();
  closeModal();
  renderPage();
  toast('Grade saved.');
}

// Expose the page registry for the additional scripts loaded afterward.
window.pages=pages;
// Admin can inspect the audit trail from settings.
async function mkSaveExamGameSettings(event){
  event.preventDefault();
  if(current?.role!=='admin')return forbidden();
  const previous=db.examGameSettings||{};
  const next=Object.fromEntries(MK_EXAM_GAMES.map(stage=>[stage.key,{enabled:document.getElementById(`mkExamGame_${stage.key}`)?.checked===true}]));
  db.examGameSettings=next;clearTimeout(__mkServerSyncTimer);
  if(!await window.mkBackendPushPlatform?.()){db.examGameSettings=previous;save();return toast(window.__mkBackendLastError||'تعذر حفظ إعداد ألعاب الاختبارات على الخادم؛ لم تُعتمد التغييرات.');}
  audit('exam_games_settings_update',MK_EXAM_GAMES.filter(stage=>next[stage.key].enabled).map(stage=>stage.title).join('، ')||'إيقاف ألعاب الاختبارات');
  renderPage();toast('تم حفظ ألعاب الاختبارات على الخادم');
}
pages.settings=function(){
  return `<div class="grid"><div class="card"><h3>⚙️ إعدادات المنصة</h3><div class="quick-grid"><button class="quick" data-mk-click="toggleTheme()">◐<b>الوضع الليلي</b></button><button class="quick" data-mk-click="exportData()">⬇️<b>نسخ احتياطي</b></button><button class="quick" data-mk-click="importModal()">⬆️<b>استرجاع نسخة</b></button><button class="quick" data-mk-click="resetData()">♻️<b>إعادة تهيئة بيانات المنصة</b></button></div></div>${current.role==='admin'?`<div class="card"><div class="section-head"><div><h3>🎮 ألعاب الاختبارات حسب المرحلة</h3><span class="small muted">اختر الألعاب التي تظهر للطلاب. الاختبارات تظل بالتصحيح والوقت نفسيهما.</span></div><span class="chip">تحكم الإدارة</span></div><form data-mk-submit="mkSaveExamGameSettings(event)"><div class="list">${MK_EXAM_GAMES.map(stage=>`<label class="list-item" style="display:flex;align-items:flex-start;gap:12px;cursor:pointer"><input id="mkExamGame_${stage.key}" type="checkbox" style="width:20px;height:20px;flex:0 0 20px;margin-top:3px" ${db.examGameSettings?.[stage.key]?.enabled===true?'checked':''}><span><b>${stage.icon} ${esc(stage.label)} — ${esc(stage.title)}</b><span class="small muted" style="display:block">${esc(stage.description)} • ${stage.grades[0]} إلى ${stage.grades.at(-1)}</span></span></label>`).join('')}</div><button class="btn primary" type="submit" style="margin-top:12px">حفظ خيارات الألعاب</button></form></div><div class="card"><div class="section-head"><h3>🔐 سجل العمليات</h3><span class="chip">${db.audit.length} عملية</span></div><div class="table-wrap"><table class="table"><tr><th>التاريخ</th><th>الدور</th><th>العملية</th><th>التفاصيل</th></tr>${db.audit.slice(-80).reverse().map(a=>`<tr><td>${esc(new Date(a.date).toLocaleString('ar-EG'))}</td><td>${esc(a.role)}</td><td>${esc(a.action)}</td><td>${esc(a.details)}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">لا توجد عمليات.</td></tr>'}</table></div></div>`:''}</div>`;
};




/* ================= MK Platform V26 — Student Affairs + Courses ================= */
function studentAffairsStudent(id){return db.students.find(s=>s.id===id)}
function studentFiles(s){s.files=Array.isArray(s.files)?s.files:[];return s.files}
function toggleStudentActive(id){if(current?.role!=='admin')return forbidden();const s=studentAffairsStudent(id);if(!s)return toast('الطالب غير موجود');const activate=s.active===false;if(activate&&!confirm(`هل راجعت هوية الطالب وصفه وتريد اعتماد حساب ${s.name}؟`))return;s.active=activate;s.accountStatus=activate?'active':'suspended';s.suspendedUntil='';if(activate)s.suspensionReason='';save();audit(activate?'student_account_activated':'student_account_disabled',`${s.name} (${s.id})`);renderPage();toast(activate?'تم تفعيل حساب الطالب':'تم إيقاف حساب الطالب')}
function openStudentAffairs(id){
  if(current.role!=='admin')return forbidden();
  const s=studentAffairsStudent(id);if(!s)return toast('الطالب غير موجود');
  studentFiles(s);
  openModal(`<div class="section-head"><div><h3>📁 شؤون الطالب — ${esc(s.name)}</h3><span class="small muted">هذه البيانات والملفات متاحة للمدير فقط.</span></div></div>
  <div class="grade-banner"><div class="split"><div><b>ID الطالب</b><div style="font-size:20px;font-weight:900;margin-top:5px">${esc(s.id)}</div></div><div><b>تاريخ الميلاد</b><div style="margin-top:5px">${esc(s.birthDate||'غير مسجل')}</div></div></div></div>
  <form data-mk-submit="saveStudentAffairs(event,'${s.id}')" style="margin-top:15px"><div class="form-grid"><label>تاريخ الميلاد<input id="saBirth" type="date" value="${esc(s.birthDate||'')}"></label></div><div class="form-grid"><label>السنة الدراسية المعتمدة<select id="saGrade" required>${grades.map(g=>`<option value="${esc(g)}" ${g===s.grade?'selected':''}>${esc(g)}</option>`).join('')}</select></label></div><div class="form-grid"><label>رقم هاتف ولي الأمر — مطلوب للدخول<input id="saParentPhone" type="tel" inputmode="tel" autocomplete="tel" value="${esc(s.parentPhone||'')}" placeholder="01xxxxxxxxx" required></label><label>ملاحظة إدارية (اختياري)<input id="saNote" value="${esc(s.adminNote||'')}" placeholder="بيانات داخلية لشؤون الطلبة"></label></div><button class="btn primary">حفظ البيانات المعتمدة</button></form>
  <hr style="margin:20px 0;border:0;border-top:1px solid var(--line)">
  <h4>📎 ملفات الطالب — للمدير فقط</h4><form data-mk-submit="addStudentFile(event,'${s.id}')"><div class="form-grid"><label>نوع الملف<select id="sfType"><option>شهادة الميلاد</option><option>صورة شخصية</option><option>بطاقة ولي الأمر</option><option>إيصال مصروفات</option><option>شهادة دراسية</option><option>ملف آخر</option></select></label><label>اسم الملف<input id="sfName" placeholder="مثال: شهادة الميلاد 2026" required></label></div><div class="field"><label>اختر الصورة أو PDF</label><input id="sfFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif,.pdf" required><div class="small muted">الملف يُرفع إلى خادم المنصة المشترك، بحد أقصى 5MB.</div></div><button class="btn">+ إضافة الملف</button></form>
  <div class="list" style="margin-top:14px">${studentFiles(s).map((f,i)=>`<div class="list-item"><div class="section-head"><div><b>📄 ${esc(f.name)}</b><div class="small muted">${esc(f.type)} • ${esc(f.date||'')}</div></div><div class="row"><button class="btn" data-mk-click="viewStudentFile('${s.id}',${i})">عرض</button><button class="btn danger" data-mk-click="deleteStudentFile('${s.id}',${i})">حذف</button></div></div></div>`).join('')||'<div class="empty">لا توجد ملفات مضافة لهذا الطالب.</div>'}</div>`);
}
async function saveStudentAffairs(e,id){e.preventDefault();if(current.role!=='admin')return;const s=studentAffairsStudent(id);if(!s)return toast('الطالب غير موجود');const grade=String(saGrade?.value||'').trim(),parentPhone=String(document.getElementById('saParentPhone')?.value||'').replace(/[\s()-]/g,'');if(!grade||!grades.includes(grade))return toast('اختر السنة الدراسية المعتمدة');if(!/^(?:01[0125]\d{8}|(?:\+?20)1[0125]\d{8})$/.test(parentPhone))return toast('أدخل رقم هاتف ولي الأمر المصري الصحيح');const before={birthDate:s.birthDate,grade:s.grade,parentPhone:s.parentPhone,adminNote:s.adminNote};s.birthDate=saBirth.value||'';s.grade=grade;s.parentPhone=parentPhone;s.adminNote=saNote.value.trim();save();if(!await window.mkBackendSyncUsers?.()){Object.assign(s,before);save();openStudentAffairs(id);return toast(window.__mkBackendLastError||'تعذر مزامنة رقم ولي الأمر إلى خادم الدخول');}audit('student_affairs_update',`${s.name} — ${s.id} — ${grade}`);closeModal();renderPage();toast('تم حفظ البيانات المعتمدة لشؤون الطالب')}
async function addStudentFile(e,id){e.preventDefault();if(current.role!=='admin')return;const s=studentAffairsStudent(id),f=sfFile.files?.[0];if(!s||!f)return;if(f.size>5*1024*1024)return toast('الملف أكبر من 5MB');try{const ref=await window.mkUploadSchoolFile(f,'student-file',{student_id:id});studentFiles(s).push({id:ref.id,fileId:ref.id,name:sfName.value.trim()||f.name,type:sfType.value,mime:ref.type,size:ref.size,date:new Date().toLocaleDateString('ar-EG')});save();audit('student_file_add',`${s.name} — ${sfType.value}`);openStudentAffairs(id);toast('تم رفع الملف إلى خادم المنصة')}catch(err){toast(err.message||'تعذر رفع ملف الطالب')}}
async function viewStudentFile(id,i){if(current.role!=='admin')return forbidden();const s=studentAffairsStudent(id),f=studentFiles(s)[i];if(!f)return;if(!f.fileId)return toast('هذا الملف قديم ولم يعد مخزنًا على الخادم؛ ارفعه مرة أخرى.');try{const url=await window.mkResolveSchoolFile(f.fileId);openModal(`<div class="section-head"><h3>${esc(f.name)}</h3><button class="btn" data-mk-click="openStudentAffairs('${id}')">رجوع</button></div>${String(f.mime||'').startsWith('image/')?`<img src="${url}" alt="${esc(f.name)}" style="width:100%;max-height:65vh;object-fit:contain;border:1px solid var(--line);border-radius:18px;background:#f8fafc">`:`<iframe src="${url}" title="${esc(f.name)}" style="width:100%;height:65vh;border:0"></iframe>`}`)}catch(err){toast(err.message||'تعذر فتح الملف')}}
async function deleteStudentFile(id,i){if(current.role!=='admin')return;const s=studentAffairsStudent(id);if(!s)return;if(!confirm('حذف هذا الملف من ملف الطالب؟'))return;const list=studentFiles(s),f=list[i];try{if(f?.fileId)await window.mkDeleteSchoolFile(f.fileId);list.splice(i,1);save();audit('student_file_delete',s.name);openStudentAffairs(id);toast('تم حذف الملف')}catch(err){toast(err.message||'تعذر حذف الملف من الخادم')}}
pages.studentAffairs=function(){
  if(current.role!=='admin')return forbidden();
  const arr=db.students||[];
  return `<div class="stats"><div class="stat"><span class="muted">إجمالي الطلاب</span><div class="num">${arr.length}</div></div><div class="stat"><span class="muted">حسابات غير مفعّلة</span><div class="num">${arr.filter(s=>s.active===false).length}</div></div><div class="stat"><span class="muted">ملفات مرفوعة</span><div class="num">${arr.reduce((n,s)=>n+studentFiles(s).length,0)}</div></div></div>
  <div class="grid"><div class="card"><div class="section-head"><div><h3>🗂️ شؤون الطلبة</h3><span class="small muted">راجع هوية الطالب وسنته الدراسية قبل تفعيل أي حساب تسجيل عام. الحسابات الموقوفة لا تستطيع تسجيل الدخول إلى الخادم.</span></div><div class="row"><span class="chip">المدير فقط</span><button class="btn primary" data-mk-click="studentModal()">+ إضافة طالب</button></div></div><div class="table-wrap"><table class="table"><tr><th>الطالب</th><th>الحالة</th><th>تاريخ الميلاد</th><th>السنة</th><th>الملفات</th><th></th></tr>${arr.map(s=>`<tr><td><b>${esc(s.name)}</b><br><span class="small muted">${esc(s.email)}</span></td><td><span class="chip ${s.active===false?'warn':'good'}">${s.active===false?'غير مفعّل':'نشط'}</span></td><td>${esc(s.birthDate||'—')}</td><td>${esc(s.grade)}</td><td>${studentFiles(s).length}</td><td><div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn primary" data-mk-click="openStudentAffairs('${s.id}')">فتح الملف الإداري</button><button class="btn" data-mk-click="studentDetails('${s.id}')">الملف الدراسي</button><button class="btn ${s.active===false?'good':'danger'}" data-mk-click="toggleStudentActive('${s.id}')">${s.active===false?'اعتماد الحساب':'إيقاف الحساب'}</button></div></td></tr>`).join('')||'<tr><td colspan="7" class="empty">لا يوجد طلاب.</td></tr>'}</table></div></div></div>`;
};

function courseFileReader(input,cb){const f=input?.files?.[0];if(!f)return cb(null);if(f.size>5*1024*1024)return toast('صورة الدورة أكبر من 5MB');window.mkUploadSchoolFile(f,'course-cover').then(ref=>cb({name:ref.name,mime:ref.type,size:ref.size,fileId:ref.id})).catch(err=>toast(err.message||'تعذر رفع صورة الدورة'));}
function courseModal(){if(current.role!=='admin')return forbidden();openModal(`<h3>🎓 إضافة دورة تعليمية</h3><form data-mk-submit="addCourse(event)"><div class="form-grid"><label>اسم الدورة<input id="coTitle" required placeholder="مثال: أساسيات البرمجة للمبتدئين"></label><label>المدرب<input id="coInstructor" required placeholder="اسم المدرب"></label></div><div class="field"><label>وصف الدورة<textarea id="coDesc" rows="4" required placeholder="ماذا سيتعلم الطالب؟"></textarea></div><div class="form-grid"><label>نوع الدورة<select id="coType" data-mk-change="toggleCoursePrice()"><option value="free">مجانية</option><option value="paid">مدفوعة</option></select></label><label id="coPriceWrap" style="display:none">السعر بالجنيه المصري<input id="coPrice" type="number" min="0" step="0.01" value="100"></label></div><div class="field"><label>صورة الدورة (اختياري)<input id="coCover" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label></div><div class="field"><label>المحتوى المختصر / الدروس<textarea id="coLessons" rows="5" placeholder="درس 1: ...\nدرس 2: ...\nدرس 3: ..."></textarea></div><button class="btn primary">نشر الدورة</button></form>`)}
function toggleCoursePrice(){const paid=document.getElementById('coType')?.value==='paid';for(const id of ['coPriceWrap','coOriginalPriceWrap']){const wrap=document.getElementById(id);if(wrap)wrap.style.display=paid?'grid':'none'}}
function addCourse(e){e.preventDefault();if(current.role!=='admin')return;const type=coType.value,price=type==='paid'?Math.max(0,+coPrice.value||0):0;if(type==='paid'&&!price)return toast('حدد سعر الدورة');courseFileReader(coCover,(cover)=>{db.courses=db.courses||[];db.courses.push({id:uid('course'),title:coTitle.value.trim(),instructor:coInstructor.value.trim(),description:coDesc.value.trim(),type,price,cover,lessons:coLessons.value.trim().split(/\n+/).map(x=>x.trim()).filter(Boolean),active:true,created:new Date().toISOString().slice(0,10),enrollments:[]});save();audit('course_create',coTitle.value);closeModal();showPage('courses');toast(type==='paid'?'تم نشر الدورة المدفوعة':'تم نشر الدورة المجانية')})}
function deleteCourse(id){if(current.role!=='admin')return;if(!confirm('حذف الدورة؟'))return;db.courses=(db.courses||[]).filter(c=>c.id!==id);save();audit('course_delete',id);page='courses';renderSide();renderPage();toast('تم حذف الدورة')}
function courseAccess(c,studentId){const id=String(studentId);if(!c||c.active===false||!Array.isArray(c.enrollments)||!c.enrollments.some(x=>String(x)===id))return false;if(String(c.type||c.kind||'free')!=='paid')return true;return Array.isArray(db.payments)&&db.payments.some(p=>p&&String(p.studentId)===id&&String(p.courseId)===String(c.id)&&p.kind!=='library'&&p.status==='paid')}
function coursePending(c,studentId){return Array.isArray(c.pending)&&c.pending.some(x=>String(x)===String(studentId))}
function courseProgress(c,studentId){const key=c.id+'::'+studentId;const arr=db.courseProgress?.[key];return Array.isArray(arr)?arr:[]}
function requestCourse(id){const c=(db.courses||[]).find(x=>x.id===id);if(!c||current.role!=='student')return;if(courseAccess(c,current.id))return toast('أنت مسجل بالفعل');c.enrollments=Array.isArray(c.enrollments)?c.enrollments:[];c.pending=Array.isArray(c.pending)?c.pending:[];if(c.type==='free'){if(!c.enrollments.includes(current.id))c.enrollments.push(current.id);save();if(window.mkBackendSyncPlatform)mkBackendSyncPlatform().catch(()=>{});audit('course_enroll_free',`${current.name} — ${c.title}`);closeModal();renderPage();toast('تم التسجيل في الدورة المجانية')}else{if(c.pending.includes(current.id))return toast('طلبك قيد المراجعة الإدارة');c.pending.push(current.id);save();audit('course_request_paid',`${current.name} — ${c.title}`);closeModal();renderPage();toast('تم إرسال طلب الالتحاق المدفوع للإدارة')}}
function approveCourseRequest(courseId,studentId){if(current.role!=='admin')return;const c=(db.courses||[]).find(x=>x.id===courseId);if(!c)return;c.pending=(c.pending||[]).filter(x=>x!==studentId);c.enrollments=Array.isArray(c.enrollments)?c.enrollments:[];if(!c.enrollments.map(String).includes(String(studentId)))c.enrollments.push(studentId);c.enrolledAtByStudent=c.enrolledAtByStudent||{};c.enrolledAtByStudent[String(studentId)]=c.enrolledAtByStudent[String(studentId)]||new Date().toISOString();save();window.mkBackendSyncPlatform?.().catch(()=>{});notifyUser(studentId,'تم قبول الدورة',`تم قبولك في دورة ${c.title}`);renderPage();toast('تم قبول الطالب في الدورة')}
function rejectCourseRequest(courseId,studentId){if(current.role!=='admin')return;const c=(db.courses||[]).find(x=>x.id===courseId);if(!c)return;c.pending=(c.pending||[]).filter(x=>x!==studentId);save();renderPage();toast('تم رفض الطلب')}
function toggleCourseLesson(courseId,index){if(current.role!=='student')return;const c=(db.courses||[]).find(x=>x.id===courseId);if(!c||!courseAccess(c,current.id))return;const key=c.id+'::'+current.id;db.courseProgress=db.courseProgress||{};const arr=courseProgress(c,current.id);if(!arr.includes(index))arr.push(index);db.courseProgress[key]=arr;save();courseDetails(courseId);toast('تم تسجيل الدرس كمكتمل')}
function courseDetails(id){const c=(db.courses||[]).find(x=>x.id===id);if(!c)return;const enrolled=courseAccess(c,current.id),pending=coursePending(c,current.id),progress=courseProgress(c,current.id),total=(c.lessons||[]).length,percent=total?Math.round(progress.length/total*100):0;openModal(`<div class="section-head"><div><h3>🎓 ${esc(c.title)}</h3><span class="small muted">${esc(c.instructor)} • ${c.type==='paid'?`مدفوعة — ${c.price} جنيه`:'مجانية'}</span></div><button class="btn" data-mk-click="closeModal()">إغلاق</button></div>${c.cover?.fileId?`<img data-mk-file-ref="${esc(c.cover.fileId)}" alt="" style="width:100%;height:190px;object-fit:cover;border-radius:18px;margin-bottom:14px">`:''}<p>${esc(c.description)}</p><div class="notice ${c.type==='paid'?'warn':'good'}">${c.type==='paid'?`💳 دورة مدفوعة — ${c.price} جنيه. طلب الالتحاق يحتاج موافقة الإدارة.`:'🆓 دورة مجانية — التسجيل فوري والدروس متاحة بعد التسجيل.'}</div>${current.role==='student'&&enrolled?`<div class="grade-banner" style="margin-top:12px"><b>تقدمك: ${percent}%</b><div style="height:9px;background:var(--line);border-radius:99px;margin-top:8px"><div style="width:${percent}%;height:100%;border-radius:99px;background:var(--primary)"></div></div></div>`:''}<h4 style="margin-top:16px">محتوى الدورة</h4><div class="list">${(c.lessons||[]).map((x,i)=>`<div class="list-item"><div class="section-head"><div><b>الدرس ${i+1}</b><br>${esc(x)}</div>${current.role==='student'&&enrolled?`<button class="btn ${progress.includes(i)?'good':''}" data-mk-click="toggleCourseLesson('${c.id}',${i})">${progress.includes(i)?'✓ مكتمل':'تم الإنجاز'}</button>`:''}</div></div>`).join('')||'<div class="empty">سيتم إضافة المحتوى لاحقًا.</div>'}</div>${current.role==='student'&&!enrolled?`<button class="btn primary" style="width:100%;margin-top:14px" data-mk-click="requestCourse('${c.id}')">${pending?'⏳ الطلب قيد المراجعة':'طلب الالتحاق'}</button>`:''}${current.role==='admin'?`<button class="btn danger" style="margin-top:14px" data-mk-click="deleteCourse('${c.id}')">حذف الدورة</button>`:''}`)}
pages.courses=function(){db.courses=db.courses||[];const canManage=current.role==='admin';const reqs=canManage?db.courses.flatMap(c=>(c.pending||[]).map(sid=>({c,s:db.students.find(x=>x.id===sid)})).filter(x=>x.s)):[];return `<div class="grid">${canManage?`<div class="card"><div class="section-head"><h3>📥 طلبات الالتحاق</h3><span class="chip">${reqs.length} طلب</span></div><div class="list">${reqs.map(r=>`<div class="list-item"><div class="section-head"><div><b>${esc(r.s.name)}</b><br><span class="small muted">${esc(r.c.title)} • ${r.c.type==='paid'?esc(String(r.c.price))+' جنيه':'مجانية'}</span></div><div class="row"><button class="btn primary" data-mk-click="approveCourseRequest('${r.c.id}','${r.s.id}')">قبول</button><button class="btn danger" data-mk-click="rejectCourseRequest('${r.c.id}','${r.s.id}')">رفض</button></div></div></div>`).join('')||'<div class="empty">لا توجد طلبات معلقة.</div>'}</div></div>`:''}<div class="card"><div class="section-head"><div><h3>🎓 الدورات التعليمية</h3><span class="small muted">دورات مجانية أو مدفوعة من إدارة المنصة.</span></div>${canManage?'<button class="btn primary" data-mk-click="courseModal()">+ إضافة دورة</button>':''}</div><div class="quick-grid">${db.courses.map(c=>`<div class="quick" style="text-align:right"><div style="height:120px;border-radius:14px;background:${c.cover?.fileId?'transparent':'linear-gradient(135deg,#315efb,#6d4aff)'};overflow:hidden;display:grid;place-items:center;color:#fff;font-size:34px">${c.cover?.fileId?`<img data-mk-file-ref="${esc(c.cover.fileId)}" style="width:100%;height:100%;object-fit:cover" alt="">`:'🎓'}</div><b style="margin-top:10px">${esc(c.title)}</b><span class="small muted">${esc(c.instructor)}</span><div class="chips" style="margin-top:8px"><span class="chip ${c.type==='paid'?'warn':'good'}">${c.type==='paid'?`${c.price} جنيه`:'مجانية'}</span><span class="chip">${(c.enrollments||[]).length} مشترك</span></div><p class="small muted">${esc(c.description).slice(0,100)}${c.description.length>100?'…':''}</p><button class="btn" style="width:100%" data-mk-click="courseDetails('${c.id}')">فتح الدورة</button></div>`).join('')||'<div class="empty" style="grid-column:1/-1">لا توجد دورات منشورة بعد.</div>'}</div></div></div>`};

// Registration uses server-backed accounts when Backend is configured. Parent linking is code-only.
openRegister=function(type='student'){
  if(type==='parent'){openModal(`<h3>إنشاء حساب ولي أمر</h3><form data-mk-submit="registerParent(event)"><div class="field"><label>الاسم الكامل</label><input id="pName" required maxlength="200"></div><div class="field"><label>البريد الإلكتروني</label><input id="pEmail" type="email" required maxlength="320"></div><div class="field"><label>رقم هاتف ولي الأمر — مطلوب للدخول</label><input id="pPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="01xxxxxxxxx" required></div><div class="field"><label>كلمة المرور (8 أحرف على الأقل)</label><input id="pPass" type="password" minlength="8" autocomplete="new-password" required></div><div class="notice">لربط الأبناء، استخدم كودًا ينشئه الطالب من لوحة حسابه. الكود صالح لمدة 15 دقيقة ولمرة واحدة فقط.</div><button class="btn primary" style="width:100%">إنشاء حساب ولي الأمر</button></form>`);return;}
  openModal(`<h3>إنشاء حساب طالب</h3><form data-mk-submit="registerStudent(event)"><div class="field"><label>الاسم الكامل</label><input id="rName" required maxlength="200"></div><div class="field"><label>البريد الإلكتروني</label><input id="rEmail" type="email" required maxlength="320"></div><div class="field"><label>رقم هاتف ولي الأمر — سيُطلب عند الدخول</label><input id="rParentPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="01xxxxxxxxx" required></div><div class="field"><label>كلمة المرور (8 أحرف على الأقل)</label><input id="rPass" type="password" minlength="8" autocomplete="new-password" required></div><div class="field"><label>تاريخ الميلاد</label><input id="rBirthDate" type="date" required></div><div class="field"><label>السنة الدراسية</label><select id="rGrade" required data-mk-change="updateRegisterTrack()">${grades.map(g=>`<option>${esc(g)}</option>`).join('')}</select></div><div id="rTrackWrap" class="field hidden"><label>المسار الدراسي للصف الثاني الثانوي</label><select id="rTrack"><option value="">اختر المسار</option><option value="medicine-life-sciences">طب وعلوم الحياة</option><option value="engineering-computing">هندسة وعلوم الحاسب</option><option value="business">الأعمال</option><option value="literature-arts">الأدب والفنون</option></select></div><button class="btn primary" style="width:100%">إنشاء الحساب</button></form>`);updateRegisterTrack();
};
window.updateRegisterTrack=function(){const wrap=document.getElementById('rTrackWrap'),grade=document.getElementById('rGrade')?.value,select=document.getElementById('rTrack');if(!wrap||!select)return;const required=grade==='ثانية ثانوي';wrap.classList.toggle('hidden',!required);select.required=required;if(!required)select.value='';};
  registerStudent=async function(e){e.preventDefault();const email=rEmail.value.trim().toLowerCase(),password=String(rPass.value||''),birth=String(rBirthDate?.value||'').trim(),parentPhone=String(document.getElementById('rParentPhone')?.value||'').replace(/[\s()-]/g,''),track=String(document.getElementById('rTrack')?.value||'');if(!/^(?:01[0125]\d{8}|(?:\+?20)1[0125]\d{8})$/.test(parentPhone))return toast('أدخل رقم هاتف ولي الأمر المصري الصحيح');if(password.length<8)return toast('كلمة المرور يجب ألا تقل عن 8 أحرف');if(!birth)return toast('تاريخ الميلاد إجباري');if(rGrade.value==='ثانية ثانوي'&&!track)return toast('اختر المسار الدراسي للصف الثاني الثانوي');if([...db.students,...db.teachers,Object.values(db.users),...db.parents].some(x=>String(x.email||'').trim().toLowerCase()===email))return toast('البريد مستخدم بالفعل');const serverConfigured=!!window.mkVideoEngineConfigured?.();if(!serverConfigured)return toast('إنشاء الحسابات يتطلب اتصال خادم المنصة.');const student={id:uid('s'),role:'student',name:rName.value.trim(),email,parentPhone,passHash:await mkHashPassword(password),grade:rGrade.value,track,birthDate:birth,active:!serverConfigured,joined:new Date().toISOString().slice(0,10),files:[],adminNote:''};try{await mkRegisterBackendAccount(student,password)}catch(err){return toast(err.message||'تعذر إنشاء الحساب على الخادم')}db.students.push(student);mkRememberPassword(student.id,password);save();audit('student_register',student.name);closeModal();toast(`تم إنشاء الحساب ${student.id} وهو معلّق حتى تراجع المنصة بياناته وتفعّله.`)};

// Admin-created student records use the immutable account ID and verified profile fields.
studentModal=function(){if(current.role!=='admin')return forbidden();openModal(`<h3>إضافة طالب من شؤون الطلبة</h3><form data-mk-submit="addStudent(event)"><div class="form-grid"><label>الاسم<input id="smName" required></label></div><div class="form-grid"><label>البريد<input id="smEmail" type="email" required></label><label>تاريخ الميلاد<input id="smBirth" type="date" required></label></div><div class="form-grid"><label>رقم هاتف ولي الأمر<input id="smParentPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="01xxxxxxxxx" required></label><label>كلمة المرور<input id="smPass" type="password" required minlength="8" autocomplete="new-password"></label></div><div class="field"><label>السنة</label><select id="smGrade">${grades.map(g=>`<option>${g}</option>`).join('')}</select></div><button class="btn primary">إضافة الطالب وحفظ ملفه</button></form>`)};
addStudent=async function(e){e.preventDefault();if(current?.role!=='admin')return forbidden();const email=smEmail.value.trim().toLowerCase(),parentPhone=String(document.getElementById('smParentPhone')?.value||'').replace(/[\s()-]/g,'');if([...db.students,...db.teachers,Object.values(db.users),...db.parents].some(u=>String(u.email||'').toLowerCase()===email))return toast('البريد مستخدم بالفعل');if(!/^(?:01[0125]\d{8}|(?:\+?20)1[0125]\d{8})$/.test(parentPhone))return toast('أدخل رقم هاتف ولي الأمر المصري الصحيح');const s={id:uid('s'),role:'student',name:smName.value.trim(),email,parentPhone,passHash:await mkHashPassword(smPass.value),grade:smGrade.value,birthDate:smBirth.value,active:true,joined:new Date().toISOString().slice(0,10),files:[]};db.students.push(s);mkRememberPassword(s.id,smPass.value);save();if(!await window.mkBackendSyncUsers?.()){db.students=db.students.filter(u=>String(u.id)!==String(s.id));MK_AUTH_VAULT.delete(String(s.id));save();return toast(window.__mkBackendLastError||'تعذر إنشاء حساب الطالب على الخادم');}audit('student_create',s.name);closeModal();renderPage();toast(`تم إضافة الطالب ${s.name} — ID: ${s.id}`)};

// Student profile: show the immutable account ID and personal learning fields only.
pages.profile=function(){if(current.role!=='student')return forbidden();const s=me();return `<div class="grid"><div class="card"><div class="section-head"><h3>👤 ملفي الدراسي</h3><span class="chip good">طالب</span></div><div class="grade-banner"><div class="split"><div><span class="small muted">الاسم</span><h2 style="margin:5px 0">${esc(s.name)}</h2><span class="small muted">${esc(s.email)}</span></div><div style="text-align:center"><span class="small muted">معرّف الحساب</span><div style="font-size:20px;font-weight:900;margin-top:5px">${esc(s.id)}</div></div></div></div><div class="quick-grid" style="margin-top:15px"><div class="quick"><span class="small muted">تاريخ الميلاد</span><b>${esc(s.birthDate||'غير مسجل')}</b></div><div class="quick"><span class="small muted">السنة</span><b>${esc(s.grade)}</b></div><div class="quick"><span class="small muted">الحالة</span><b>نشط</b></div></div><div class="notice" style="margin-top:15px">🔒 المستندات الإدارية مثل شهادة الميلاد والملفات الرسمية محفوظة في شؤون الطلبة ولا تظهر في حساب الطالب.</div></div></div>`};

// Navigation: add Student Affairs and Courses without removing existing sections.


// Ensure new collections exist in previous browser databases.
db.courses=db.courses||[];
(db.students||[]).forEach(s=>{s.files=Array.isArray(s.files)?s.files:[];if(typeof s.birthDate!=='string')s.birthDate='';if(typeof s.adminNote!=='string')s.adminNote=''});
save();

/* MK Platform V29.1 — Final hardening / navigation + student identity migration */
(function(){
  const MK_FINAL_VERSION = 29.1;

  function finalNormalizeStudentIdentity(){
    let changed=false;
    db.students = Array.isArray(db.students) ? db.students : [];
    db.parents = Array.isArray(db.parents) ? db.parents : [];
    const used=new Set();
    db.students.forEach((s,i)=>{
      if(!s || typeof s!=='object') return;
      let id=String(s.id||'').trim();
      if(!id || used.has(id)){
        do{id=uid('s')}while(used.has(id));
        s.id=id; changed=true;
      }
      used.add(id);
      if(!Array.isArray(s.files)){s.files=[];changed=true;}
      if(typeof s.adminNote!=='string'){s.adminNote='';changed=true;}
    });

    // Migrate old parent links once, then retain only immutable student IDs.
    db.parents.forEach(p=>{
      const oldIds=Array.isArray(p.studentIds)?p.studentIds:[];
      const legacyCodes=Array.isArray(p.studentCodes)?p.studentCodes:[];
      const links=[...oldIds,...legacyCodes];
      const resolved=[];
      links.forEach(raw=>{
        const v=String(raw||'').trim();
        if(!v) return;
        const byId=db.students.find(s=>String(s.id)===v);
        const byCode=db.students.find(s=>String(s.studentCode||'').trim().toUpperCase()===v.toUpperCase());
        const s=byId||byCode;
        if(s && !resolved.includes(s.id)) resolved.push(s.id);
      });
      if(JSON.stringify(resolved)!==JSON.stringify(oldIds.filter(x=>db.students.some(s=>String(s.id)===String(x))).map(String))){
        p.studentIds=resolved; changed=true;
      } else if(!Array.isArray(p.studentIds)) {p.studentIds=resolved;changed=true;}
      // studentCodes was only a migration source; never use it for future authorization.
      if(Object.prototype.hasOwnProperty.call(p,'studentCodes')){delete p.studentCodes;changed=true;}
    });

    db.students.forEach(s=>{if(Object.prototype.hasOwnProperty.call(s,'studentCode')){delete s.studentCode;changed=true;}});
    const stripLegacyStudentCodes=value=>{
      if(Array.isArray(value)){value.forEach(stripLegacyStudentCodes);return;}
      if(!value||typeof value!=='object')return;
      for(const key of Object.keys(value)){
        const normalized=key.toLowerCase().replace(/[^a-z0-9]/g,'');
        if(normalized==='studentcode'||normalized==='studentcodes'){delete value[key];changed=true;}
        else stripLegacyStudentCodes(value[key]);
      }
    };
    stripLegacyStudentCodes(db);
    for(const key of ['messages','announcements','studentCode','studentCodes'])if(Object.prototype.hasOwnProperty.call(db,key)){delete db[key];changed=true;}
    const keptNotifications=(Array.isArray(db.notifications)?db.notifications:[]).filter(n=>!n?.announcementId&&!n?.messageId&&!/^(إعلان جديد|رسالة جديدة)/.test(String(n?.title||'')));
    if(keptNotifications.length!==(db.notifications||[]).length){db.notifications=keptNotifications;changed=true;}
    if(db.users?.admin){db.users.admin.id='admin';db.users.admin.role='admin';}
    db.version=Math.max(Number(db.version)||0,MK_FINAL_VERSION);
    db.schema='V29.7-student-id-notifications-forum';
    if(changed) save();
  }

  finalNormalizeStudentIdentity();

  // Canonicalize the logged-in role. The built-in admin identity must always be admin,
  // even if an old/local account record previously stored another role.
  // One authoritative navigation map. No legacy navigation definition can override this one.

  // Normalize course records so the Courses section is usable on old databases.
  db.platformRewards=Array.isArray(db.platformRewards)?db.platformRewards:[];db.platformPoints=db.platformPoints&&typeof db.platformPoints==='object'?db.platformPoints:{};db.courses=Array.isArray(db.courses)?db.courses:[];
  db.courses.forEach(c=>{
    c.pending=Array.isArray(c.pending)?c.pending:[];
    c.enrollments=Array.isArray(c.enrollments)?c.enrollments:[];
    c.lessons=Array.isArray(c.lessons)?c.lessons:[];
    if(typeof c.active!=='boolean') c.active=true;
  });
  db.courseProgress=db.courseProgress&&typeof db.courseProgress==='object'?db.courseProgress:{};
  save();

  // Clear role labels in the sidebar.


  // Keep routing permission-driven and prevent stale pages from being reached directly.


  // Student Affairs is the administrative Students section: one screen for identity,
  // verified profile fields, private files and administrative notes.
  const _studentPage = pages.students;
  pages.students=function(){
    if(current && current.role==='admin') return pages.studentAffairs();
    return _studentPage();
  };

  // Parent/student access must always resolve through internal Student ID.
  visibleStudents=function(){
    if(current.role==='teacher'){
      const gs=db.subjects.filter(x=>x.teacher===current.id).map(x=>x.grade);
      return db.students.filter(s=>gs.includes(s.grade));
    }
    if(current.role==='parent'){
      const p=db.parents.find(x=>x.id===current.id);
      const ids=new Set(Array.isArray(p?.studentIds)?p.studentIds.map(String):[]);
      return db.students.filter(s=>ids.has(String(s.id)));
    }
    return db.students;
  };
  myStudentIds=function(){return current.role==='student'?[String(current.id)]:current.role==='parent'?visibleStudents().map(s=>String(s.id)):visibleStudents().map(s=>String(s.id));};

  // Harden student details so a parent cannot open another student's record by changing an ID in the UI.
  studentDetails=function(id){
    const s=db.students.find(x=>String(x.id)===String(id));
    if(!s) return toast('الطالب غير موجود');
    if(current.role==='student' && String(current.id)!==String(id)) return forbidden();
    if(current.role==='parent' && !visibleStudents().some(x=>String(x.id)===String(id))) return forbidden();
    if(current.role==='teacher' && !visibleStudents().some(x=>String(x.id)===String(id))) return forbidden();
    const st=attendanceStats(id), g=db.grades.filter(x=>x.student===id);
    openModal(`<h3>${esc(s.name)}</h3><div class="grade-banner"><b>${esc(s.grade)}</b><p>ID الطالب: <strong>${esc(s.id)}</strong></p><p>الحضور ${st.rate}% • التقييمات ${g.length}</p></div><h4>الدرجات</h4><div class="list">${g.map(x=>`<div class="list-item"><b>${esc(x.subject)} — ${esc(x.title)}</b><br>${x.score}/${x.max} • ${esc(x.comment||'')}</div>`).join('')||'لا توجد درجات'}</div>`);
  };

  // Never expose administrative files/notes to non-admin roles.
  const oldOpenStudentAffairs=openStudentAffairs;
  openStudentAffairs=function(id){if(current.role!=='admin')return forbidden();return oldOpenStudentAffairs(id);};

  save();
})();

(function(){
function isAdmin(){return String(current?.role||'').toLowerCase()==='admin'}
function isStudent(){return !!current&&String(current.role||'').toLowerCase()==='student'}
// Later feature modules run in separate closures and call these role guards.
window.isAdmin=isAdmin;
window.isStudent=isStudent;
function mkAdminVideoControls(){
 if(!isAdmin())return forbidden();
 openModal('<h3>🎬 مركز تحكم الفيديو</h3><p class="small muted">الحد الأقصى ثابت عند 3 مشاهدات لكل طالب لكل فيديو. يمكنك إعادة العداد عند الحاجة.</p><form data-mk-submit="mkAdminResetViews(event)"><div class="field"><label>Student ID <span class="small muted">اختياري</span></label><input id="mkResetStudent" placeholder="اتركه فارغًا لإدارة فيديو فقط"></div><div class="field"><label>Video ID <span class="small muted">اختياري</span></label><input id="mkResetVideo" placeholder="اترك الاثنين فارغين لإعادة كل العدادات"></div><div class="notice warn">⚠️ إعادة كل العدادات إجراء إداري شامل.</div><button class="btn primary" style="width:100%">إعادة العداد</button></form><button class="btn danger" style="width:100%;margin-top:10px" data-mk-click="mkAdminResetAllViews()">إعادة جميع عدادات المشاهدة</button>');
}
async function mkAdminResetViews(e){
 e.preventDefault();
 const url=(window.mkVideoEngineConfigured&&window.mkVideoEngineConfigured())?window.mkVideoEngineUrl(''):location.origin;
 const jwt=mkRuntimeGetItem('mk_video_jwt');
 if(!jwt)return toast('سجّل دخول الأدمن بمحرك الفيديو أولًا');
 const body={student_id:String(document.getElementById('mkResetStudent')?.value||'').trim()||null,video_id:String(document.getElementById('mkResetVideo')?.value||'').trim()||null};
 try{const r=await fetch(url+'/api/v1/admin/video/reset-views',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt},body:JSON.stringify(body)});if(!r.ok)throw new Error();toast('تمت إعادة عداد المشاهدة بنجاح');closeModal()}catch(_){toast('تعذر تنفيذ العملية على السيرفر')}
}
async function mkAdminResetAllViews(){
 if(!confirm('هل تريد إعادة جميع عدادات مشاهدة الفيديو لكل الطلاب؟'))return;
 const url=(window.mkVideoEngineConfigured&&window.mkVideoEngineConfigured())?window.mkVideoEngineUrl(''):location.origin,jwt=mkRuntimeGetItem('mk_video_jwt');
 if(!jwt)return toast('سجّل دخول الأدمن بمحرك الفيديو أولًا');
 try{const r=await fetch(url+'/api/v1/admin/video/reset-views',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt},body:JSON.stringify({})});if(!r.ok)throw new Error();toast('تمت إعادة جميع العدادات');closeModal()}catch(_){toast('تعذر تنفيذ العملية على السيرفر')}
}

if(current&&isAdmin())current.role='admin';

// Admin: the Students page IS Student Affairs.
pages.students=function(){if(isAdmin())return pages.studentAffairs();if(current.role==='parent'){var kids=visibleStudents();return '<div class="grid"><div class="card"><h3>👨‍👩‍👧 أبنائي</h3><div class="quick-grid">'+kids.map(function(s){return '<div class="quick"><b>'+esc(s.name)+'</b><span class="small muted">ID: '+esc(s.id)+'</span><button class="btn" data-mk-click="studentDetails(\''+s.id+'\')">فتح الملف</button></div>'}).join('')+'</div></div></div>'}if(current.role==='teacher')return _teacherStudents();return '<div class="card"><div class="empty">هذه الصفحة متاحة للإدارة والمعلمين وأولياء الأمور.</div></div>'};
function _teacherStudents(){var a=visibleStudents();return '<div class="card"><h3>👨‍🎓 طلاب موادي</h3><div class="table-wrap"><table class="table"><tr><th>الطالب</th><th>السنة الدراسية</th><th>الحضور</th><th></th></tr>'+a.map(function(s){return '<tr><td>'+esc(s.name)+'</td><td>'+esc(s.grade)+'</td><td>'+attendanceStats(s.id).rate+'%</td><td><button class="btn" data-mk-click="studentDetails(\''+s.id+'\')">عرض</button></td></tr>'}).join('')+'</table></div></div>'}
// Courses: free = instant enrollment; paid = request then admin approval.
window.mkFreeEnroll=async function(id){if(!isStudent())return forbidden();var c=db.courses.find(function(x){return String(x.id)===String(id)});if(!c)return toast('الدورة غير موجودة');c.enrollments=Array.isArray(c.enrollments)?c.enrollments:[];var sid=String(current.id);if(c.enrollments.map(String).includes(sid))return toast('أنت مسجل بالفعل');var cfgUrl=(window.mkVideoEngineConfigured&&window.mkVideoEngineConfigured())?window.mkVideoEngineUrl(''):location.origin,jwt=mkRuntimeGetItem('mk_video_jwt');if(!jwt)return toast('انتهت جلسة الخادم؛ سجّل الدخول مرة أخرى قبل الاشتراك');try{var rr=await fetch(cfgUrl+'/api/v1/courses/enroll-free',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt},body:JSON.stringify({course_id:String(id)})}),body=await rr.json().catch(function(){return {}});if(!rr.ok)throw new Error(body.message||body.error||'server enrollment rejected')}catch(e){return toast(e.message||'تعذر تأكيد التسجيل على السيرفر؛ حاول مرة أخرى')}c.enrollments.push(sid);c.enrolledAtByStudent=c.enrolledAtByStudent||{};c.enrolledAtByStudent[sid]=c.enrolledAtByStudent[sid]||new Date().toISOString();save();courseDetails(id);toast('تم تسجيلك في الدورة المجانية')};
window.mkPaidRequest=function(id){if(!isStudent())return forbidden();var c=db.courses.find(function(x){return String(x.id)===String(id)});if(!c)return toast('الدورة غير موجودة');c.pending=Array.isArray(c.pending)?c.pending:[];var sid=String(current.id);if(c.enrollments?.map(String).includes(sid))return toast('أنت مسجل بالفعل');if(c.pending.map(String).includes(sid))return toast('طلبك قيد المراجعة');c.pending.push(sid);save();courseDetails(id);toast('تم إرسال طلب الالتحاق للإدارة')};
courseDetails=function(id){var c=db.courses.find(function(x){return String(x.id)===String(id)});if(!c)return toast('الدورة غير موجودة');c.lessons=Array.isArray(c.lessons)?c.lessons:[];c.enrollments=Array.isArray(c.enrollments)?c.enrollments:[];c.pending=Array.isArray(c.pending)?c.pending:[];var sid=isStudent()?String(current.id):'',enrolled=sid&&c.enrollments.map(String).includes(sid),pending=sid&&c.pending.map(String).includes(sid),prog=sid?courseProgress(c,sid):[],pct=c.lessons.length?Math.round(prog.length/c.lessons.length*100):0;var act=isStudent()&&!enrolled?(c.type==='paid'?'<button class="btn primary" style="width:100%;margin-top:14px" data-mk-click="mkPaidRequest(\''+c.id+'\')">'+(pending?'⏳ الطلب قيد المراجعة':'💳 طلب الالتحاق — '+esc(String(c.price))+' جنيه')+'</button>':'<button class="btn primary" style="width:100%;margin-top:14px" data-mk-click="mkFreeEnroll(\''+c.id+'\')">🆓 ابدأ الدورة مجانًا</button>'):'';var content=enrolled?'<div class="grade-banner"><b>تقدمك: '+pct+'%</b><div class="progress"><i style="width:'+pct+'%"></i></div></div><h4>📚 محتوى الدورة</h4><div class="list">'+c.lessons.map(function(x,i){return '<div class="list-item"><div class="section-head"><div><b>الدرس '+(i+1)+'</b><br>'+esc(x)+'</div><button class="btn" data-mk-click="toggleCourseLesson(\''+c.id+'\','+i+')">'+(prog.includes(i)?'✓ مكتمل':'تم الإنجاز')+'</button></div></div>'}).join('')+'</div>':'<div class="notice '+(c.type==='paid'?'warn':'good')+'">'+(c.type==='paid'?'الدورة مدفوعة وتحتاج موافقة الإدارة قبل فتح المحتوى.':'الدورة مجانية، اضغط ابدأ الدورة لفتح المحتوى.')+'</div>';openModal('<div class="section-head"><div><h3>🎓 '+esc(c.title)+'</h3><span class="small muted">'+esc(c.instructor||'')+' • '+(c.type==='paid'?esc(String(c.price))+' جنيه':'مجانية')+'</span></div><button class="btn" data-mk-click="closeModal()">إغلاق</button></div>'+(c.cover?.fileId?'<img data-mk-file-ref="'+esc(c.cover.fileId)+'" style="width:100%;height:190px;object-fit:cover;border-radius:18px">':'')+'<p>'+esc(c.description||'')+'</p>'+content+act+(isAdmin()?'<button class="btn danger" style="margin-top:14px" data-mk-click="deleteCourse(\''+c.id+'\')">حذف الدورة</button>':'') )};
pages.courses=function(){db.courses=Array.isArray(db.courses)?db.courses:[];var admin=isAdmin(),student=isStudent(),sid=student?String(current.id):'';var req=admin?db.courses.flatMap(function(c){return (c.pending||[]).map(function(x){return {c:c,s:db.students.find(function(s){return String(s.id)===String(x)})}})}).filter(function(x){return x.s}):[];return '<div class="grid">'+(admin?'<div class="card"><div class="section-head"><h3>📥 طلبات الالتحاق</h3><span class="chip warn">'+req.length+' طلب</span></div><div class="list">'+(req.map(function(r){return '<div class="list-item"><div class="section-head"><div><b>'+esc(r.s.name)+'</b><br><span class="small muted">'+esc(r.c.title)+' • '+r.c.price+' جنيه</span></div><div><button class="btn primary" data-mk-click="approveCourseRequest(\''+r.c.id+'\',\''+r.s.id+'\')">قبول</button> <button class="btn danger" data-mk-click="rejectCourseRequest(\''+r.c.id+'\',\''+r.s.id+'\')">رفض</button></div></div></div>'}).join('')||'<div class="empty">لا توجد طلبات معلقة.</div>')+'</div></div>':'')+'<div class="card"><div class="section-head"><div><h3>🎓 الدورات التعليمية</h3><span class="small muted">'+(student?'الدورات المتاحة للطلاب':'إدارة ونشر ومتابعة الدورات')+'</span></div>'+(admin?'<button class="btn primary" data-mk-click="courseModal()">+ إضافة دورة</button>':'')+'</div><div class="quick-grid">'+(db.courses.filter(function(c){return c.active!==false}).map(function(c){var en=student&&c.enrollments.map(String).includes(sid),pe=student&&c.pending.map(String).includes(sid);return '<div class="quick" style="text-align:right"><div style="height:120px;border-radius:14px;background:#315efb;overflow:hidden;display:grid;place-items:center;color:#fff;font-size:34px">'+(c.cover?.fileId?'<img data-mk-file-ref="'+esc(c.cover.fileId)+'" style="width:100%;height:100%;object-fit:cover">':'🎓')+'</div><b>'+esc(c.title)+'</b><span class="small muted">'+esc(c.instructor||'')+'</span><div class="chips"><span class="chip '+(c.type==='paid'?'warn':'good')+'">'+(c.type==='paid'?esc(String(c.price))+' جنيه':'مجانية')+'</span>'+(en?'<span class="chip good">مسجل</span>':'')+(pe?'<span class="chip warn">قيد المراجعة</span>':'')+'</div><p class="small muted">'+esc(c.description||'').slice(0,110)+'</p><button class="btn primary" style="width:100%" data-mk-click="courseDetails(\''+c.id+'\')">'+(en?'فتح الدورة':pe?'عرض الطلب':'عرض الدورة')+'</button></div>'}).join('')||'<div class="empty">لا توجد دورات منشورة حاليًا.</div>')+'</div></div></div>'};
// Migration/hardening.
db.courses=Array.isArray(db.courses)?db.courses:[];db.courseProgress=db.courseProgress&&typeof db.courseProgress==='object'?db.courseProgress:{};db.courses.forEach(function(c){c.enrollments=Array.isArray(c.enrollments)?c.enrollments:[];c.pending=Array.isArray(c.pending)?c.pending:[];c.lessons=Array.isArray(c.lessons)?c.lessons:[];if(c.active===undefined)c.active=true});db.version=Math.max(Number(db.version)||0,29.3);db.schema='V29.4-real-students-affairs-courses';save();renderSide();


})();
/* Notifications center, opened from the top-bar bell only. */
(function(){
  db.notifications=Array.isArray(db.notifications)?db.notifications:[];
  function uidSafe(prefix){return typeof uid==='function'?uid(prefix):prefix+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,8)}
  function actorById(id){
    if(String(id)==='admin') return db.users?.admin||{id:'admin',name:'مدير المنصة',role:'admin'};
    return [...(db.students||[]),...(db.parents||[])].find(x=>String(x.id)===String(id))||null;
  }
  function allRecipients(){
    const out=[]; const seen=new Set();

    const arr=[db.users?.admin,...(db.students||[]),...(db.parents||[])];
    arr.forEach(x=>{if(x&&x.id&&!seen.has(String(x.id))&&x.active!==false){seen.add(String(x.id));out.push(x)}});
    return out;
  }
  function unreadNotifications(){return db.notifications.filter(n=>String(n.to)===String(current?.id)&&!n.read).length}
  window.notifyUser=function(to,title,body,extra){
    if(!to)return;
    db.notifications.push({id:uidSafe('n'),to:String(to),title:String(title||'تنبيه'),body:String(body||''),date:new Date().toISOString(),read:false,...(extra||{})});
    save();
  };
  window.notifyAll=function(title,body,filter){
    allRecipients().filter(x=>!filter||filter(x)).forEach(x=>db.notifications.push({id:uidSafe('n'),to:String(x.id),title:String(title||'تنبيه'),body:String(body||''),date:new Date().toISOString(),read:false}));
    save();
  };
  window.mkMarkAllNotifications=function(){
    db.notifications.filter(n=>String(n.to)===String(current.id)||String(n.to)==='all').forEach(n=>n.read=true); save(); renderPage(); renderSide(); toast('تم تعليم كل التنبيهات كمقروءة');
  };
  window.mkOpenNotification=function(id){
    const n=db.notifications.find(x=>String(x.id)===String(id)&&(String(x.to)===String(current.id)||String(x.to)==='all'));if(!n)return;n.read=true;save();openModal('<div class="section-head"><h3>🔔 '+esc(n.title)+'</h3><button class="btn" data-mk-click="closeModal()">إغلاق</button></div><div class="notice" style="white-space:pre-wrap;line-height:1.9">'+esc(n.body)+'</div><div class="small muted" style="margin-top:10px">'+esc(new Date(n.date).toLocaleString('ar-EG'))+'</div>');renderSide();
  };
  pages.notifications=function(){
    const arr=db.notifications.filter(n=>String(n.to)===String(current.id)||String(n.to)==='all').sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    return '<div class="grid"><div class="card"><div class="section-head"><div><h3>🔔 التنبيهات</h3><span class="small muted">تنبيهات حسابك التعليمية والإدارية.</span></div><div class="row" style="gap:8px">'+(isAdmin()?'<button class="btn primary" data-mk-click="mkNotificationModal()">+ إرسال تنبيه</button>':'')+'<button class="btn" data-mk-click="mkMarkAllNotifications()">تعليم الكل كمقروء</button></div></div><div class="list">'+(arr.map(n=>'<div class="list-item" style="cursor:pointer;border-right:4px solid '+(n.read?'#d1d5db':'#315efb')+'" data-mk-click="mkOpenNotification(\''+n.id+'\')"><div class="section-head"><div><b>'+esc(n.title)+'</b><div class="small muted">'+esc(new Date(n.date).toLocaleString('ar-EG'))+'</div></div>'+(!n.read?'<span class="chip warn">جديد</span>':'')+'</div><div class="small">'+esc(n.body).slice(0,180)+'</div></div>').join('')||'<div class="empty">لا توجد تنبيهات حاليًا.</div>')+'</div></div></div>';
  };
  // Admin can send account notifications; the bell is their only entry point.
  window.mkNotificationModal=function(){
    if(!isAdmin())return forbidden(); const users=allRecipients().filter(x=>String(x.id)!=='admin');
    openModal('<h3>🔔 إرسال تنبيه</h3><form data-mk-submit="mkSendDirectNotification(event)"><div class="field"><label>المستلم</label><select id="mkNotTo"><option value="all">كل المستخدمين</option>'+users.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name||x.id)+'</option>').join('')+'</select></div><div class="field"><label>عنوان التنبيه</label><input id="mkNotTitle" required></div><div class="field"><label>النص</label><textarea id="mkNotBody" rows="5" required></textarea></div><button class="btn primary">إرسال التنبيه</button></form>');
  };
  window.mkSendDirectNotification=function(e){e.preventDefault();if(!isAdmin())return forbidden();const title=document.getElementById('mkNotTitle')?.value.trim(),body=document.getElementById('mkNotBody')?.value.trim(),to=document.getElementById('mkNotTo')?.value;if(!title||!body)return toast('أكمل بيانات التنبيه');if(to==='all')notifyAll(title,body);else notifyUser(to,title,body);closeModal();showPage('notifications');toast('تم إرسال التنبيه');};


  // Add quick actions on the admin dashboard if the dashboard is rendered.
  db.version=Math.max(Number(db.version)||0,29.7);db.schema='V29.7-notifications-forum';save();
  renderSide();
})();


// Secure server-backed parent/student linking. Codes are never generated client-side.
window.mkCreateParentLinkCode=async function(){
  if(current?.role!=='student')return toast('هذه الخاصية متاحة للطالب فقط');
  const cfg=window.mkVideoCfg?.()||{}, base=cfg.url||location.origin, token=mkRuntimeGetItem('mk_video_jwt');
  if(!token)return toast('انتهت جلسة الخادم؛ سجّل الدخول مرة أخرى');
  try{const r=await fetch(base+'/api/v1/parent-links/code',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});const data=await r.json();if(!r.ok)throw new Error(data.message||data.error||'تعذر إنشاء الكود');const el=document.getElementById('parentLinkCodeResult');if(el){el.style.display='block';el.innerHTML='<b>كود الربط: <code>'+String(data.code).replace(/[^A-F0-9]/g,'')+'</code></b><br>صالح لمدة 15 دقيقة ولمرة واحدة فقط. شاركه مع ولي أمرك فقط.';}toast('تم إنشاء كود الربط');}catch(e){toast(e.message||'تعذر الاتصال بالخادم');}
};
window.mkRedeemParentLink=async function(){
  if(current?.role!=='parent')return toast('هذه الخاصية متاحة لولي الأمر فقط');
  const el=document.getElementById('parentLinkCode'),code=String(el?.value||'').trim().toUpperCase();if(!code)return toast('أدخل كود الربط أولًا');
  const cfg=window.mkVideoCfg?.()||{},base=cfg.url||location.origin,token=mkRuntimeGetItem('mk_video_jwt');if(!token)return toast('انتهت جلسة الخادم؛ سجّل الدخول مرة أخرى');
  try{const r=await fetch(base+'/api/v1/parent-links/redeem',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({code})});const data=await r.json();if(!r.ok)throw new Error(data.message||data.error||'تعذر ربط الطالب');let p=db.parents.find(x=>String(x.id)===String(current.id));if(p){p.studentIds=Array.isArray(p.studentIds)?p.studentIds:[];if(!p.studentIds.includes(data.student_id))p.studentIds.push(data.student_id);save();}if(el)el.value='';await window.mkBackendPullPlatform?.(true);toast('تم الربط على الخادم بنجاح');renderPage();}catch(e){toast(e.message||'تعذر الاتصال بالخادم');}
};

/* Administrator-controlled homework formats, course unlocks, and post-submission solution videos. */
window.assignmentModal=function(){
  if(current?.role!=='admin')return forbidden();
  const targetGrades=[...new Set([...(Array.isArray(grades)?grades:[]),...(db.students||[]).map(s=>String(s.grade||''))].filter(Boolean))];
  const courseOptions=(db.courses||[]).filter(c=>c.active!==false).map(c=>`<option value="${esc(c.id)}">${esc(c.title)} — ${esc(c.grade||'كل الصفوف')}</option>`).join('');
  openModal(`<div class="section-head"><div><h3>إنشاء واجب</h3><span class="small muted">تدير المنصة الواجبات والتصحيح مركزيًا.</span></div><button class="btn" type="button" data-mk-click="closeModal()">إغلاق</button></div><form data-mk-submit="addAssignment(event)">
    <div class="form-grid"><label>عنوان الواجب<input id="amTitle" maxlength="200" required></label><label>المادة<input id="amSubject" maxlength="120" required></label></div>
    <div class="form-grid"><label>الصف<select id="amGrade" required><option value="">اختر الصف</option>${targetGrades.map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('')}</select></label></div>
    <div class="form-grid"><label>الدورة المرتبطة (اختياري)<select id="amCourse"><option value="">واجب عام</option>${courseOptions}</select><span class="small muted">إذا رُبط الواجب بدورة، لن يقبل الخادم التسليم حتى تكتمل فيديوهاتها المتاحة.</span></label></div>
    <label>تعليمات الواجب<textarea id="amDesc" rows="3" maxlength="3000" required></textarea></label>
    <div class="form-grid"><label>نوع الأسئلة<select id="amType" data-mk-change="mkAssignmentQuestionHint()"><option value="essay">مقالي</option><option value="multiple_choice">اختيار من متعدد</option></select></label><label>درجة كل سؤال<input id="amPoints" type="number" min="1" max="100" value="5" required></label></div>
    <label>الأسئلة<textarea id="amQuestions" rows="7" required placeholder="سؤال في كل سطر"></textarea><span id="amQuestionHint" class="small muted">اكتب سؤالًا واحدًا في كل سطر، وستكون الإجابة مقالية.</span></label>
    <div class="form-grid"><label>آخر موعد<input id="amDue" type="date" required></label><label>فيديو حل الواجب بعد التسليم (اختياري)<input id="amSolutionVideo" type="url" placeholder="https://example.com/solution.mp4"><span class="small muted">لن يظهر للطالب إلا بعد إرسال الإجابة.</span></label></div>
    <button class="btn primary" style="width:100%">نشر الواجب</button></form>`);
};
window.mkAssignmentQuestionHint=function(){const el=document.getElementById('amQuestionHint');if(!el)return;el.textContent=document.getElementById('amType')?.value==='multiple_choice'?'كل سطر بهذا الشكل: السؤال | الاختيار 1 | الاختيار 2 | الاختيار 3 | الاختيار 4 | رقم الإجابة الصحيحة (1-4).':'اكتب سؤالًا واحدًا في كل سطر، وستكون الإجابة مقالية.';};
window.addAssignment=function(e){
  e.preventDefault();if(current?.role!=='admin')return forbidden();
  const grade=String(document.getElementById('amGrade')?.value||''),courseId=String(document.getElementById('amCourse')?.value||''),course=(db.courses||[]).find(c=>String(c.id)===courseId),type=String(document.getElementById('amType')?.value||'essay'),points=Number(document.getElementById('amPoints')?.value),lines=String(document.getElementById('amQuestions')?.value||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if(!grade)return toast('اختر الصف المستهدف');if(!Number.isInteger(points)||points<1||points>100)return toast('درجة السؤال من 1 إلى 100');if(!lines.length||lines.length>100)return toast('أضف من سؤال واحد إلى 100 سؤال');
  if(courseId&&(!course||course.active===false||(course.grade&&String(course.grade)!==grade)))return toast('الدورة المختارة لا تتبع الصف المحدد');
  const questions=[];
  for(let i=0;i<lines.length;i++){
    if(type==='multiple_choice'){
      const parts=lines[i].split('|').map(x=>x.trim()),answerRaw=String(parts[5]||'').toUpperCase(),answer='ABCD'.indexOf(answerRaw)>=0?'ABCD'.indexOf(answerRaw):Number(answerRaw)-1;
      if(parts.length!==6||!parts[0]||parts.slice(1,5).some(x=>!x)||new Set(parts.slice(1,5)).size!==4||!Number.isInteger(answer)||answer<0||answer>3)return toast('راجع السؤال '+(i+1)+': اكتب السؤال وأربعة اختيارات ورقم الإجابة الصحيحة من 1 إلى 4');
      questions.push({id:uid('aq'),type:'multiple_choice',text:parts[0],options:parts.slice(1,5),answerIndex:answer,points,number:i+1});
    }else questions.push({id:uid('aq'),type:'essay',text:lines[i],points,number:i+1});
  }
  const solutionVideoUrl=String(document.getElementById('amSolutionVideo')?.value||'').trim();if(solutionVideoUrl&&!/^https?:\/\//i.test(solutionVideoUrl))return toast('رابط فيديو الحل يجب أن يبدأ بـ https:// أو http://');
  const assignment={id:uid('a'),teacher:'admin',subject:String(document.getElementById('amSubject')?.value||'').trim(),grade,courseId:courseId||'',answerType:type,title:String(document.getElementById('amTitle')?.value||'').trim(),desc:String(document.getElementById('amDesc')?.value||'').trim(),due:String(document.getElementById('amDue')?.value||''),points:questions.reduce((n,q)=>n+q.points,0),questionPoints:points,questions,solutionVideoUrl,active:true,published:true};
  db.assignments=db.assignments||[];db.assignments.push(assignment);save();audit('assignment_create',assignment.title+' — '+type);window.mkBackendPushPlatform?.().then(ok=>{if(!ok){db.assignments=db.assignments.filter(x=>String(x.id)!==String(assignment.id));save();return toast('تعذر حفظ الواجب على الخادم؛ لم يتم نشره.');}renderPage();toast('تم نشر الواجب وإتاحته للصف المحدد')}).catch(()=>toast('تعذر حفظ الواجب على الخادم'));
};
window.submitAssignment=function(id){
  if(current?.role!=='student')return forbidden();const a=(db.assignments||[]).find(x=>String(x.id)===String(id));if(!a)return toast('الواجب غير موجود');const existing=(db.submissions||[]).find(s=>String(s.assignment)===String(id)&&String(s.student)===String(current.id));if(existing)return viewSubmission(id);
  const qs=Array.isArray(a.questions)?a.questions:[];if(!qs.length)return toast('هذا الواجب لا يحتوي أسئلة');
  if(a.courseId){const course=(db.courses||[]).find(c=>String(c.id)===String(a.courseId));if(!course||!courseAccess(course,current.id))return toast('يجب الاشتراك في الدورة المرتبطة أولًا');const watched=courseProgress(course,current.id);const required=(course.lessons||[]).map((l,i)=>({l,i})).filter(x=>!!String(x.l.videoRef||x.l.videoUrl||'').trim());if(required.some(x=>!watched.includes(x.i)))return toast('أكمل مشاهدة فيديوهات الدورة المتاحة قبل فتح الواجب');}
  const multiple=a.answerType==='multiple_choice'||a.answerType==='mcq';
  openModal(`<div class="section-head"><div><h3>${esc(a.title)}</h3><span class="small muted">${esc(a.subject)} • ${a.points} درجة • آخر موعد ${esc(a.due)}</span></div><span class="chip">${qs.length} أسئلة — ${multiple?'اختيار من متعدد':'مقالي'}</span></div><form data-mk-submit="saveSubmission(event,'${esc(String(id))}')"><div class="assignment-paper">${qs.map((q,i)=>`<div class="assignment-q"><b>${i+1}. ${esc(q.text||'')}</b>${multiple?`<fieldset class="field"><legend>اختر إجابة واحدة</legend>${(q.options||[]).map((option,index)=>`<label class="list-item" style="display:block"><input type="radio" name="ans_${i}" value="${index}" required> ${esc(option)}</label>`).join('')}</fieldset>`:`<div class="field"><label for="ans_${i}">إجابتك</label><textarea id="ans_${i}" rows="4" required maxlength="20000" placeholder="اكتب إجابتك بالتفصيل..."></textarea></div>`}</div>`).join('')}</div><button class="btn primary" style="width:100%">تسليم الواجب</button></form>`);
};
window.saveSubmission=async function(e,id){
  e.preventDefault();if(current?.role!=='student')return forbidden();const a=(db.assignments||[]).find(x=>String(x.id)===String(id));if(!a)return toast('الواجب غير موجود');const qs=Array.isArray(a.questions)?a.questions:[],multiple=a.answerType==='multiple_choice'||a.answerType==='mcq';
  const answers=qs.map((q,i)=>multiple?Number(document.querySelector(`input[name="ans_${i}"]:checked`)?.value):String(document.getElementById('ans_'+i)?.value||''));if(answers.some(x=>multiple?!Number.isInteger(x):!String(x).trim()))return toast('أكمل إجابة كل الأسئلة');
  const old=db.submissions||[],submission={id:uid('sub'),assignment:String(id),student:String(current.id),answers,text:answers.map((answer,i)=>`السؤال ${i+1}: ${multiple?(q=>q.options?.[answer])(qs[i]):answer}`).join('\n\n'),submittedAt:new Date().toISOString(),status:multiple?'graded':'submitted',...(multiple?{score:0,max:a.points,feedback:'يتم اعتماد الدرجة على الخادم'}:{})};db.submissions=[...old,submission];save();
  const pushed=await window.mkBackendPushPlatform?.();if(!pushed){db.submissions=old;save();return toast(window.__mkBackendLastError||'تعذر تسليم الواجب؛ لم يؤكد الخادم حفظه.');}
  await window.mkBackendPullPlatform?.(true);closeModal();renderPage();toast(multiple?'تم التسليم وتصحيح الاختيارات تلقائيًا':'تم تسليم الواجب بنجاح');
};
window.viewSubmission=function(id){const s=(db.submissions||[]).find(x=>String(x.assignment)===String(id)&&String(x.student)===String(current.id)),a=(db.assignments||[]).find(x=>String(x.id)===String(id));if(!s||!a)return toast('التسليم غير موجود');const url=String(a.solutionVideoUrl||'');openModal(`<div class="section-head"><h3>تسليم الواجب</h3><button class="btn" data-mk-click="closeModal()">إغلاق</button></div><div class="notice ${s.status==='graded'?'good':'warn'}">${s.status==='graded'?`الدرجة: ${Number(s.score)||0}/${Number(s.max)||Number(a.points)||0}<br>${esc(s.feedback||'تم التصحيح تلقائيًا')}`:'تم التسليم وبانتظار التصحيح.'}</div><div class="list-item" style="margin-top:12px;white-space:pre-wrap">${esc(s.text||'')}</div>${url&&/^https?:\/\//i.test(url)?`<div class="card" style="margin-top:12px"><h4>🎬 فيديو حل الواجب</h4><video controls playsinline preload="metadata" src="${esc(url)}" style="width:100%;max-height:460px;background:#000;border-radius:12px"></video></div>`:''}`);};
window.assignmentCard=function(a){const sub=(db.submissions||[]).find(s=>String(s.assignment)===String(a.id)&&String(s.student)===String(current.id));const isAdmin=current?.role==='admin',isTeacher=current?.role==='teacher';return `<div class="list-item"><div class="section-head"><div><b>${esc(a.title)}</b><div class="small muted">${esc(a.subject)} • ${esc(a.grade)} • ${Number(a.points)||0} درجة • ${a.answerType==='multiple_choice'?'اختيار من متعدد':'مقالي'} • آخر موعد ${esc(a.due||'—')}</div></div><div>${current?.role==='student'?`<button class="btn ${sub?'':'primary'}" data-mk-click="${sub?`viewSubmission('${esc(a.id)}')`:`submitAssignment('${esc(a.id)}')`}">${sub?'عرض التسليم':'حل الواجب'}</button>`:''}</div></div><p>${esc(a.desc||'')}</p>${a.courseId?`<div class="small muted">مرتبط بالدورة: ${esc(db.courses.find(c=>String(c.id)===String(a.courseId))?.title||'دورة')}</div>`:''}${(isAdmin||isTeacher)?`<button class="btn" data-mk-click="submissions('${esc(a.id)}')">التسليمات والتصحيح</button>`:''}</div>`;};
window.pages.assignments=function(){const admin=current?.role==='admin',teacher=current?.role==='teacher',arr=current?.role==='student'?db.assignments.filter(a=>itemForStudent(a,me())):teacher?db.assignments.filter(a=>String(a.teacher)===String(current.id)):db.assignments;return `<div class="grid"><div class="card"><div class="section-head"><div><h3>الواجبات</h3><span class="small muted">أنشأتها إدارة المنصة، ونوع السؤال محدد لكل واجب.</span></div>${admin?'<button class="btn primary" data-mk-click="assignmentModal()">+ إنشاء واجب</button>':''}</div><div class="list">${arr.map(a=>assignmentCard(a)).join('')||'<div class="empty">لا توجد واجبات حاليًا.</div>'}</div></div></div>`;};
function exportData(){if(current?.role!=='admin')return forbidden();const backup=JSON.parse(JSON.stringify(db));delete backup.users;const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='mk-school-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('تم تنزيل نسخة بيانات المنصة');}
function importModal(){if(current?.role!=='admin')return forbidden();openModal('<h3>استعادة نسخة احتياطية</h3><p class="muted">اختر ملف JSON موثوقًا أو الصق محتواه. ستُستبدل بيانات المنصة الحالية بعد التأكيد.</p><div class="field"><label>ملف النسخة</label><input type="file" accept="application/json,.json" data-mk-change="readBackupFile(event)"></div><div class="field"><label>بيانات JSON</label><textarea id="mkBackupJson" rows="10" dir="ltr" placeholder="{ ... }"></textarea></div><button class="btn primary" data-mk-click="applyBackupImport()">استعادة النسخة</button>');}
async function readBackupFile(e){const f=e.target.files?.[0];if(!f)return;if(f.size>10*1024*1024)return toast('حجم ملف النسخة يتجاوز 10MB');document.getElementById('mkBackupJson').value=await f.text();}
function applyBackupImport(){if(current?.role!=='admin')return forbidden();try{const parsed=JSON.parse(document.getElementById('mkBackupJson')?.value||'');if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error();const imported=normalizeDB(parsed);if(!confirm('استبدال بيانات المنصة الحالية بالنسخة المحددة؟'))return;imported.users=db.users;db=imported;save();audit('backup_restore','تم استعادة نسخة احتياطية');closeModal();renderPage();toast('تمت استعادة النسخة الاحتياطية');}catch{toast('ملف النسخة غير صالح أو لا يحتوي بيانات منصة متوافقة');}}
function resetData(){if(current?.role!=='admin')return forbidden();if(!confirm('سيؤدي هذا إلى استبدال بيانات المنصة الحالية ببيانات البداية. هل تريد المتابعة؟'))return;const adminUsers=db.users;db=normalizeDB(seed());db.users=adminUsers;save();audit('school_data_reset','إعادة تهيئة بيانات المنصة');renderPage();toast('تمت إعادة تهيئة بيانات المنصة');}
function safeSchoolResourceUrl(item){const raw=String(item?.url||item?.link||item?.href||'').trim();if(!raw)return '';try{const u=new URL(raw,location.href);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}}
function openLesson(id){const item=db.lessonLinks.find(x=>String(x.id)===String(id));if(!item)return toast('الدرس غير موجود');if(current?.role==='student'&&item.grade!==me()?.grade)return forbidden();if(current?.role==='parent'&&!visibleStudents().some(s=>s.grade===item.grade))return forbidden();const href=safeSchoolResourceUrl(item);openModal('<h3>'+esc(item.title||'الدرس')+'</h3><p class="muted">'+esc(item.subject||'')+' • '+esc(item.grade||'')+'</p><div class="notice">'+esc(item.description||item.content||item.body||'لا يوجد وصف إضافي لهذا الدرس.')+'</div>'+(href?'<p><a class="btn primary" href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">فتح الدرس</a></p>':''));}
function openLibraryResource(id){const item=db.library.find(x=>String(x.id)===String(id));if(!item)return toast('المورد غير موجود');if(current?.role==='student'&&item.grade!==me()?.grade)return forbidden();if(current?.role==='parent'&&!visibleStudents().some(s=>s.grade===item.grade))return forbidden();const href=safeSchoolResourceUrl(item);openModal('<h3>'+esc(item.title||'المورد التعليمي')+'</h3><p class="muted">'+esc(item.subject||'')+' • '+esc(item.grade||'')+' • '+esc(item.type||'')+'</p><div class="notice">'+esc(item.description||item.summary||item.content||'المورد متاح من خلال الرابط المرفق.')+'</div>'+(href?'<p><a class="btn primary" href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">فتح المورد</a></p>':''));}









