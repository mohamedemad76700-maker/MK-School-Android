(function installCommunityForums() {
  const pageWindow = window;
  const roleName = () => String(current?.role || '').toLowerCase();
  const isAdminUser = () => roleName() === 'admin';
  const state = () => {
    db.communitySpaces = Array.isArray(db.communitySpaces) ? db.communitySpaces : [];
    db.communityReplies = db.communityReplies && typeof db.communityReplies === 'object' ? db.communityReplies : {};
    db.communityControls = db.communityControls && typeof db.communityControls === 'object' ? db.communityControls : {};
    db.communityBannedMembers = Array.isArray(db.communityBannedMembers) ? db.communityBannedMembers : [];
    return db;
  };
  let loading = false;
  let loadedAt = 0;
  let loadError = '';
  const replyTargets = new Map();
  const domId = value => String(value || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0,128);
  const h = value => typeof esc === 'function' ? esc(String(value ?? '')) : String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const activeSpace = id => state().communitySpaces.find(space => String(space.id) === String(id));

  async function communityApi(path, options = {}) {
    const cfg = pageWindow.mkVideoCfg?.();
    const token = typeof mkRuntimeGetItem === 'function' ? mkRuntimeGetItem('mk_video_jwt') : '';
    if (!cfg?.url || !token) throw new Error('انتهت جلسة المنتدى؛ سجّل الدخول مرة أخرى.');
    const response = await fetch(`${cfg.url}/api/v1/platform/community${path}`, {
      ...options,
      headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}`, ...(options.headers || {}) },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || 'تعذر تنفيذ طلب المنتدى.');
    return data;
  }

  pageWindow.mkCommunityLoad = async function(force = false) {
    if (loading || (!force && Date.now() - loadedAt < 20000)) return;
    loading = true;
    try {
      const data = await communityApi('');
      db.communitySpaces = Array.isArray(data.spaces) ? data.spaces : [];
      db.communityReplies = data.replies && typeof data.replies === 'object' ? data.replies : {};
      db.communityControls = data.controls && typeof data.controls === 'object' ? data.controls : {};
      db.communityBanned = data.banned === true;
      db.communityBannedMembers = Array.isArray(data.bannedMembers) ? data.bannedMembers : [];
      loadedAt = Date.now();
      loadError = '';
      if (page === 'community') renderPage();
    } catch (error) {
      loadError = error?.message || 'تعذر تحميل المنتدى';
      if (page === 'community') renderPage();
    } finally { loading = false; }
  };

  pageWindow.mkCommunitySetView = function(view) {
    pageWindow.mkCommunityView = ['all','mine','pending','hidden'].includes(view) ? view : 'all';
    renderPage();
  };
  pageWindow.mkCommunitySelectSpace = function(id) {
    pageWindow.mkCommunitySpaceFilter = String(id || 'all');
    pageWindow.mkCommunityView = 'all';
    renderPage();
  };

  function topicCategory(topic) {
    const kind = topic.category === 'support' ? 'دعم فني' : 'استفسار علمي';
    const recipient = String(topic.recipientType || topic.targetType || 'public');
    if (recipient === 'support') return `${kind} · إلى دعم المنصة`;
    if (recipient === 'instructor') return `${kind} · إلى ${topic.recipientLabel || topic.targetInstructor || 'مدرّس الدورة'}`;
    if (recipient === 'group') return `${kind} · ${topic.recipientLabel || activeSpace(topic.groupId)?.title || 'منتدى جماعي'}`;
    return `${kind} · المنتدى العام`;
  }

  function renderReply(topicId, reply, admin) {
    const replyId = domId(reply.id);
    if (reply.deleted) return admin ? `<div class="mk-community-reply mk-community-reply-removed"><span>رد محذوف — ${h(reply.authorName || 'عضو')}</span><button class="btn" data-mk-click="mkCommunityReplyModeration('${replyId}','restore_reply')">استعادة</button></div>` : '';
    return `<div class="mk-community-reply ${reply.parentId ? 'nested' : ''}"><div class="mk-community-reply-meta"><b>${h(reply.authorName || 'عضو')}</b><span>${h(new Date(reply.createdAt || Date.now()).toLocaleString('ar-EG'))}</span></div><p>${h(reply.body)}</p><div class="mk-community-reply-actions"><button class="btn" data-mk-click="mkCommunitySetReply('${domId(topicId)}','${replyId}')">رد</button>${admin ? `<button class="btn danger" data-mk-click="mkCommunityReplyModeration('${replyId}','delete_reply')">حذف الرد</button>` : ''}</div></div>`;
  }

  function renderTopic(topic, admin, mine, banned) {
    const topicId = domId(topic.id);
    const control = state().communityControls[String(topic.id)] || {};
    const replies = (state().communityReplies[String(topic.id)] || []).filter(reply => admin || !reply.deleted);
    const hidden = control.hidden === true;
    const locked = control.locked === true;
    const authorBanned = state().communityBannedMembers.some(item => String(item.userId) === String(topic.authorId));
    const status = hidden ? 'مخفي' : topic.status === 'approved' ? 'منشور' : topic.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة';
    const attachment = topic.attachment?.fileId ? (String(topic.attachment.type || '').startsWith('image/')
      ? `<img class="mk-community-attachment" data-mk-file-ref="${h(topic.attachment.fileId)}" alt="مرفق الموضوع">`
      : `<a class="btn" data-mk-file-ref="${h(topic.attachment.fileId)}" target="_blank" rel="noopener">📎 ${h(topic.attachment.name || 'عرض المرفق')}</a>`) : '';
    const adminActions = admin ? `<div class="mk-community-admin-actions">${topic.status === 'pending' ? `<button class="btn good" data-mk-click="mkCommunityModerate('${topicId}','approved')">نشر</button><button class="btn danger" data-mk-click="mkCommunityModerate('${topicId}','rejected')">رفض</button>` : ''}<button class="btn" data-mk-click="mkCommunityControl('${topicId}','${locked ? 'unlock' : 'lock'}')">${locked ? 'فتح الردود' : 'قفل الردود'}</button><button class="btn danger" data-mk-click="mkCommunityControl('${topicId}','${hidden ? 'restore' : 'hide'}')">${hidden ? 'استعادة الموضوع' : 'إخفاء الموضوع'}</button><button class="btn ${authorBanned ? '' : 'danger'}" data-mk-click="mkCommunityBan('${domId(topic.authorId)}','${authorBanned ? 'unban' : 'ban'}')">${authorBanned ? 'رفع الحظر' : 'حظر العضو'}</button></div>` : '';
    const canReply = !banned && !locked && !hidden && (topic.status === 'approved' || mine || admin);
    const repliesHtml = replies.length ? `<div class="mk-community-replies"><h4>الردود <span>${replies.filter(reply => !reply.deleted).length}</span></h4>${replies.map(reply => renderReply(topicId, reply, admin)).join('')}</div>` : `<div class="mk-community-replies-count">لا توجد ردود بعد.</div>`;
    const replyForm = canReply ? `<form class="mk-community-reply-form" data-mk-submit="mkCommunityReply(event,'${topicId}')"><label for="mk-community-reply-${topicId}">اكتب ردك</label><textarea id="mk-community-reply-${topicId}" name="body" maxlength="4000" required placeholder="اكتب إجابة مفيدة ومحترمة…"></textarea><button class="btn primary" type="submit">إرسال الرد</button></form>` : banned ? '<div class="notice warn">تم إيقاف حسابك مؤقتًا عن المشاركة في المنتدى.</div>' : locked ? '<div class="notice">أغلق الأدمن الردود على هذا الموضوع.</div>' : '';
    return `<article class="mk-community-topic ${hidden ? 'is-hidden' : ''}"><div class="mk-community-topic-head"><div class="avatar">${h(String(topic.authorName || 'م')[0])}</div><div><b>${h(topic.authorName || 'عضو')}</b><div class="small muted">${h(new Date(topic.createdAt || Date.now()).toLocaleString('ar-EG'))} · ${h(topicCategory(topic))}</div></div><span class="chip ${topic.status === 'approved' && !hidden ? 'good' : 'warn'}">${status}${locked ? ' · الردود مغلقة' : ''}</span></div><h3>${h(topic.title)}</h3><p>${h(topic.body)}</p>${attachment}${adminActions}${repliesHtml}${replyForm}</article>`;
  }

  pageWindow.pages.community = function() {
    if (!current) return '<div class="card empty">سجّل الدخول لفتح المنتدى.</div>';
    if (!loadedAt && !loading) setTimeout(() => pageWindow.mkCommunityLoad(), 0);
    const data = state(), admin = isAdminUser(), id = String(current.id), view = pageWindow.mkCommunityView || 'all';
    const all = Array.isArray(data.communityTopics) ? data.communityTopics : [];
    const spaces = data.communitySpaces.filter(space => space.active !== false || admin);
    const spaceFilter = String(pageWindow.mkCommunitySpaceFilter || 'all');
    let rows = all.filter(topic => admin || String(topic.authorId) === id || (topic.status === 'approved' && ['public','group'].includes(String(topic.recipientType || topic.targetType || 'public'))));
    if (view === 'mine') rows = rows.filter(topic => String(topic.authorId) === id);
    if (view === 'pending') rows = rows.filter(topic => topic.status === 'pending');
    if (view === 'hidden') rows = rows.filter(topic => data.communityControls[String(topic.id)]?.hidden === true);
    else if (admin) rows = rows.filter(topic => data.communityControls[String(topic.id)]?.hidden !== true);
    if (spaceFilter !== 'all') rows = rows.filter(topic => String(topic.groupId || topic.spaceId || '') === spaceFilter || (spaceFilter === 'general' && String(topic.recipientType || topic.targetType || 'public') === 'public'));
    rows.sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const mine = all.filter(topic => String(topic.authorId) === id);
    const published = all.filter(topic => topic.status === 'approved' && !data.communityControls[String(topic.id)]?.hidden);
    const viewTabs = `<div class="mk-community-tabs"><button class="${view === 'all' ? 'active' : ''}" data-mk-click="mkCommunitySetView('all')">المواضيع <span>${published.length}</span></button><button class="${view === 'mine' ? 'active' : ''}" data-mk-click="mkCommunitySetView('mine')">مواضيعي <span>${mine.length}</span></button>${admin ? `<button class="${view === 'pending' ? 'active' : ''}" data-mk-click="mkCommunitySetView('pending')">قيد المراجعة <span>${all.filter(topic => topic.status === 'pending').length}</span></button><button class="${view === 'hidden' ? 'active' : ''}" data-mk-click="mkCommunitySetView('hidden')">المخفية <span>${all.filter(topic => data.communityControls[String(topic.id)]?.hidden).length}</span></button>` : ''}</div>`;
    const spaceTabs = `<div class="mk-community-space-tabs"><button class="${spaceFilter === 'all' ? 'active' : ''}" data-mk-click="mkCommunitySelectSpace('all')">كل المنتديات</button>${spaces.map(space => `<button class="${spaceFilter === String(space.id) ? 'active' : ''}" data-mk-click="mkCommunitySelectSpace('${domId(space.id)}')">${h(space.title)}${space.visibility === 'private' ? ' 🔒' : ''}</button>`).join('')}</div>`;
    const topics = rows.map(topic => renderTopic(topic, admin, String(topic.authorId) === id, data.communityBanned === true)).join('') || `<div class="empty">${loadError ? h(loadError) : loading ? 'جارٍ تحميل موضوعات المنتدى…' : 'لا توجد موضوعات في هذا المنتدى بعد. ابدأ بطرح أول سؤال.'}</div>`;
    const composeDisabled = data.communityBanned === true;
    return `<style>.mk-community-layout{display:grid;grid-template-columns:minmax(0,1fr) 285px;gap:18px;direction:rtl}.mk-community-profile{align-self:start;position:sticky;top:12px;background:linear-gradient(155deg,#fff,#e9f5ff);text-align:center}.mk-community-profile .avatar{width:76px;height:76px;margin:auto;font-size:30px;border-radius:22px;background:#d8f8fb;color:#00aabe}.mk-community-tabs,.mk-community-space-tabs{display:flex;gap:8px;overflow:auto;border-bottom:1px solid var(--line,#d6dce5);margin:12px 0 16px;padding-bottom:8px}.mk-community-tabs button,.mk-community-space-tabs button{white-space:nowrap;border:0;background:transparent;padding:9px 12px;border-radius:999px;color:var(--muted,#687386)}.mk-community-tabs button.active,.mk-community-space-tabs button.active{background:#e6f6fb;color:#087b91;font-weight:800}.mk-community-topic{background:var(--surface,#fff);border:1px solid var(--line,#dce2ea);border-radius:18px;padding:clamp(14px,3vw,20px);margin:14px 0}.mk-community-topic.is-hidden{border-style:dashed;opacity:.82}.mk-community-topic-head{display:flex;align-items:center;gap:10px}.mk-community-topic-head .chip{margin-right:auto}.mk-community-topic h3{margin:14px 0 8px}.mk-community-topic>p,.mk-community-reply p{white-space:pre-wrap;line-height:1.8;margin:0}.mk-community-admin-actions,.mk-community-reply-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.mk-community-admin-actions .btn,.mk-community-reply-actions .btn{padding:7px 10px;font-size:12px}.mk-community-replies{border-top:1px solid var(--line,#e4e9f0);margin-top:18px;padding-top:14px}.mk-community-replies h4{margin:0 0 10px}.mk-community-replies h4 span{color:var(--muted);font-size:12px}.mk-community-reply{border-right:3px solid #bdeaf1;background:var(--surface2,#f7fafc);padding:12px;border-radius:10px;margin:8px 0}.mk-community-reply.nested{margin-right:24px;border-color:#c9d1ff}.mk-community-reply-meta{display:flex;justify-content:space-between;gap:10px;font-size:12px;color:var(--muted)}.mk-community-reply-removed{display:flex;justify-content:space-between;align-items:center;color:var(--muted)}.mk-community-reply-form{display:grid;gap:8px;margin-top:14px}.mk-community-reply-form label{font-weight:800;font-size:13px}.mk-community-reply-form textarea{width:100%;min-height:80px;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--surface2);color:var(--text);font:inherit}.mk-community-attachment{display:block;max-width:100%;max-height:350px;object-fit:contain;border-radius:12px;margin-top:14px}.mk-community-manage-list{display:grid;gap:10px}.mk-community-space-row{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--line);border-radius:12px;padding:12px}.mk-community-form{display:grid;grid-template-columns:1fr 1fr;gap:12px;direction:rtl}.mk-community-form label{display:grid;gap:7px;font-size:13px;font-weight:800}.mk-community-form .wide,.mk-community-form .notice,.mk-community-form .submit{grid-column:1/-1}.mk-community-form input:not([type=file]),.mk-community-form select,.mk-community-form textarea{width:100%;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--surface2);color:var(--text);font:inherit}.mk-community-form textarea{min-height:110px;resize:vertical}@media(max-width:850px){.mk-community-layout{grid-template-columns:1fr}.mk-community-profile{position:static;order:-1}}@media(max-width:600px){.mk-community-form{grid-template-columns:1fr}.mk-community-form .wide,.mk-community-form .notice,.mk-community-form .submit{grid-column:1}}</style><div class="mk-community-layout"><section><div class="card"><div class="section-head"><div><h2>💬 منتدى المنصة</h2><span class="small muted">اسأل، أجب، وتابع النقاش داخل منتدى عام أو خاص بدورتك.</span></div><div class="row">${admin ? '<button class="btn" data-mk-click="mkCommunityManageSpaces()">⚙ إدارة المنتديات</button>' : ''}<button class="btn primary" ${composeDisabled ? 'disabled' : ''} data-mk-click="mkCommunityCompose()">＋ اطرح سؤالًا</button></div></div>${data.communityBanned ? '<div class="notice warn">حسابك موقوف مؤقتًا عن النشر والردود.</div>' : ''}${loadError ? `<div class="notice warn">${h(loadError)} <button class="btn" data-mk-click="mkCommunityLoad(true)">إعادة المحاولة</button></div>` : ''}${spaceTabs}${viewTabs}${topics}</div></section><aside class="card mk-community-profile"><div class="avatar">${h(String(current.name || 'م')[0])}</div><h3>${h(current.name || 'عضو')}</h3><span class="small muted">${admin ? 'إدارة المنصة' : roleName() === 'parent' ? 'ولي أمر' : 'طالب'}</span><hr style="margin:18px 0;opacity:.25"><h3>ملخص المجتمع</h3><div class="stats"><div class="stat"><span class="muted">الموضوعات</span><div class="num">${published.length}</div></div><div class="stat"><span class="muted">ردودي</span><div class="num">${Object.values(data.communityReplies).flat().filter(reply => String(reply.authorId) === id && !reply.deleted).length}</div></div></div></aside></div>`;
  };

  pageWindow.mkCommunityCompose = function() {
    if (!current) return toast('سجّل الدخول أولًا.');
    if (state().communityBanned) return toast('حسابك موقوف مؤقتًا عن المشاركة في المنتدى.');
    const eligibleCourses = (db.courses || []).filter(course => course.active !== false && (isAdminUser() || (roleName() === 'student' && (course.enrollments || []).map(String).includes(String(current.id)))));
    const spaceOptions = state().communitySpaces.filter(space => space.active !== false).map(space => `<option value="space:${h(space.id)}">${h(space.title)}${space.visibility === 'private' ? ' — خاص 🔒' : ' — عام'}${space.teacherName ? ` · ${h(space.teacherName)}` : ''}</option>`).join('');
    const instructorOptions = eligibleCourses.filter(course => String(course.instructor || course.teacherName || '').trim()).map(course => `<option value="instructor:${h(course.id)}">${h(course.instructor || course.teacherName)} — ${h(course.title || 'دورة')}</option>`).join('');
    openModal(`<div class="section-head"><div><h3>＋ سؤال جديد</h3><span class="small muted">اختر المنتدى والخصوصية المناسبة لسؤالك.</span></div><button type="button" class="btn" data-mk-click="closeModal()">✕</button></div><form class="mk-community-form" data-mk-submit="mkCommunitySubmit(event)"><label class="wide">انشر في<select id="mkCommunityRecipient" required data-mk-change="mkCommunityRecipientChanged()"><option value="public">المنتدى العام</option>${spaceOptions ? `<optgroup label="منتديات المنصة">${spaceOptions}</optgroup>` : ''}<option value="support">دعم المنصة — خاص</option>${instructorOptions ? `<optgroup label="مدرّسو دوراتي">${instructorOptions}</optgroup>` : ''}</select></label><div id="mkCommunityRouteHint" class="notice">السؤال العام يظهر بعد مراجعة الإدارة.</div><label class="wide">عنوان السؤال<input id="mkCommunityTitle" required maxlength="160" placeholder="اكتب عنوانًا واضحًا"></label><label class="wide">التفاصيل<textarea id="mkCommunityBody" required maxlength="6000" placeholder="اشرح سؤالك وما حاولت تجربته"></textarea></label><label class="wide">صورة أو PDF (اختياري)<input type="file" id="mkCommunityAttachment" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"></label><div class="notice">المرفقات حتى 5 ميجابايت. الأسئلة العامة تمر بمراجعة الإدارة.</div><button class="btn primary submit" type="submit">إرسال السؤال</button></form>`);
    pageWindow.mkCommunityRecipientChanged();
  };

  pageWindow.mkCommunityRecipientChanged = function() {
    const selected = document.getElementById('mkCommunityRecipient')?.value || 'public';
    const hint = document.getElementById('mkCommunityRouteHint');
    if (!hint) return;
    if (selected === 'support') hint.textContent = 'الموضوع خاص بك وبإدارة المنصة فقط.';
    else if (selected.startsWith('instructor:')) hint.textContent = 'سيصل السؤال إلى مدرس الدورة المحددة.';
    else if (selected.startsWith('space:')) {
      const space = activeSpace(selected.slice(6));
      hint.textContent = space?.visibility === 'private' ? 'منتدى خاص بطلاب الدورة المسجلين فقط، مع إمكانية اطلاع ولي الأمر المرتبط.' : 'منتدى عام لجميع مستخدمي المنصة.';
    } else hint.textContent = 'السؤال العام يظهر بعد مراجعة الإدارة.';
  };

  pageWindow.mkCommunitySubmit = async function(event) {
    event.preventDefault();
    const title = document.getElementById('mkCommunityTitle')?.value.trim(), body = document.getElementById('mkCommunityBody')?.value.trim();
    const file = document.getElementById('mkCommunityAttachment')?.files?.[0], selected = String(document.getElementById('mkCommunityRecipient')?.value || 'public');
    if (!title || !body) return toast('اكتب عنوان السؤال وتفاصيله.');
    if (file && (file.size > 5 * 1024 * 1024 || !['image/jpeg','image/png','image/webp','image/gif','application/pdf'].includes(file.type))) return toast('اختر صورة أو PDF صالحًا حتى 5 ميجابايت.');
    let recipientType = 'public', recipientLabel = 'المنتدى العام', groupId = '', targetCourseId = '', targetInstructor = '';
    if (selected === 'support') { recipientType = 'support'; recipientLabel = 'دعم المنصة'; }
    else if (selected.startsWith('space:')) { const space = activeSpace(selected.slice(6)); if (!space || space.active === false) return toast('هذا المنتدى غير متاح.'); recipientType = 'group'; groupId = String(space.id); recipientLabel = String(space.title); }
    else if (selected.startsWith('instructor:')) { recipientType = 'instructor'; targetCourseId = selected.slice(11); const course = eligibleCourse(targetCourseId); if (!course) return toast('الدورة غير متاحة لهذا الحساب.'); targetInstructor = String(course.instructor || course.teacherName || '').trim(); if (!targetInstructor) return toast('لا يوجد مدرس مسجل لهذه الدورة.'); recipientLabel = targetInstructor; }
    let attachment = null;
    if (file) { try { const uploaded = await pageWindow.mkUploadSchoolFile(file,'community-attachment'); attachment = { fileId:uploaded.id,name:uploaded.name,type:uploaded.type,size:uploaded.size }; } catch(error) { return toast(error.message || 'تعذر رفع المرفق.'); } }
    const topic = { id:uid('topic'),authorId:String(current.id),authorRole:roleName(),authorName:String(current.name || current.fullName || 'عضو'),category:recipientType === 'support' ? 'support' : 'scientific',recipientType,recipientLabel,groupId,targetCourseId,targetInstructor,title,body,attachment,status:isAdminUser() && recipientType === 'public' ? 'approved' : 'pending',createdAt:new Date().toISOString(),comments:[] };
    db.communityTopics = Array.isArray(db.communityTopics) ? db.communityTopics : [];
    db.communityTopics.unshift(topic);
    clearTimeout(__mkServerSyncTimer);
    try {
      if (!await pageWindow.mkBackendPushPlatform?.()) throw new Error(window.__mkBackendLastError || 'تعذر حفظ السؤال على الخادم.');
      audit('community_topic_created', title);
      closeModal(); pageWindow.mkCommunityView = 'mine'; pageWindow.mkCommunitySpaceFilter = 'all'; loadedAt = 0;
      await pageWindow.mkCommunityLoad(true);
      toast(topic.status === 'approved' ? 'تم نشر السؤال.' : 'تم إرسال السؤال لمراجعة الإدارة.');
    } catch(error) {
      db.communityTopics = db.communityTopics.filter(item => String(item.id) !== String(topic.id));
      if (attachment?.fileId) await pageWindow.mkDeleteSchoolFile?.(attachment.fileId).catch(() => {});
      toast(error.message || 'تعذر إرسال السؤال.');
    }
  };

  function eligibleCourse(id) {
    return (db.courses || []).find(course => String(course.id) === String(id) && course.active !== false && (isAdminUser() || (roleName() === 'student' && (course.enrollments || []).map(String).includes(String(current.id))))) || null;
  }

  pageWindow.mkCommunitySetReply = function(topicId, parentId = '') {
    replyTargets.set(String(topicId), String(parentId || ''));
    document.getElementById(`mk-community-reply-${domId(topicId)}`)?.focus();
    if (parentId) toast('اكتب ردك على التعليق المحدد.');
  };

  pageWindow.mkCommunityReply = async function(event, topicId) {
    event.preventDefault();
    if (state().communityBanned) return toast('حسابك موقوف مؤقتًا عن الردود.');
    const form = event.target, field = form?.querySelector('textarea[name="body"]'), body = String(field?.value || '').trim();
    if (body.length < 2 || body.length > 4000) return toast('اكتب ردًا بين حرفين و4000 حرف.');
    const parentId = replyTargets.get(String(topicId)) || '';
    const submit = form.querySelector('button[type="submit"]'); if (submit) submit.disabled = true;
    try {
      await communityApi(`/topics/${encodeURIComponent(topicId)}/replies`, { method:'POST', body:{ body, parentId } });
      replyTargets.delete(String(topicId)); loadedAt = 0; await pageWindow.mkCommunityLoad(true); toast('تم إرسال ردك.');
    } catch(error) { toast(error.message || 'تعذر إرسال الرد.'); }
    finally { if (submit?.isConnected) submit.disabled = false; }
  };

  pageWindow.mkCommunityControl = async function(topicId, action) {
    if (!isAdminUser()) return toast('هذه الصلاحية للإدارة فقط.');
    const label = ({lock:'قفل الردود',unlock:'فتح الردود',hide:'إخفاء الموضوع',restore:'استعادة الموضوع'})[action];
    if (!label || !confirm(`هل تريد ${label}؟`)) return;
    try { await communityApi('/moderation',{method:'POST',body:{topicId,action}}); loadedAt = 0; await pageWindow.mkCommunityLoad(true); toast('تم تحديث إدارة الموضوع.'); }
    catch(error) { toast(error.message || 'تعذر تحديث الموضوع.'); }
  };

  pageWindow.mkCommunityReplyModeration = async function(replyId, action) {
    if (!isAdminUser()) return toast('هذه الصلاحية للإدارة فقط.');
    if (action === 'delete_reply' && !confirm('إخفاء هذا الرد عن المنتدى؟ يمكن للإدارة استعادته لاحقًا.')) return;
    try { await communityApi('/moderation',{method:'POST',body:{targetId:replyId,action}}); loadedAt = 0; await pageWindow.mkCommunityLoad(true); }
    catch(error) { toast(error.message || 'تعذر تحديث الرد.'); }
  };

  pageWindow.mkCommunityBan = async function(userId, action) {
    if (!isAdminUser()) return toast('هذه الصلاحية للإدارة فقط.');
    if (action === 'ban' && !confirm('حظر هذا العضو من إنشاء مواضيع أو ردود؟ يمكن رفع الحظر لاحقًا.')) return;
    const reasonValue = action === 'ban' ? prompt('سبب الحظر (اختياري):') : '';
    if (reasonValue === null) return;
    const reason = String(reasonValue || '').trim();
    try { await communityApi('/moderation',{method:'POST',body:{targetId:userId,action,reason}}); loadedAt = 0; await pageWindow.mkCommunityLoad(true); toast(action === 'ban' ? 'تم إيقاف العضو عن المنتدى.' : 'تم رفع حظر العضو.'); }
    catch(error) { toast(error.message || 'تعذر تحديث الحظر.'); }
  };

  pageWindow.mkCommunityManageSpaces = function() {
    if (!isAdminUser()) return toast('هذه الصلاحية للإدارة فقط.');
    const courses = (db.courses || []).filter(course => course.active !== false);
    const options = courses.map(course => `<option value="${h(course.id)}">${h(course.title || 'دورة')} · ${h(course.instructor || course.teacherName || 'إدارة المنصة')}</option>`).join('');
    const spaceRows = state().communitySpaces.map(space => `<div class="mk-community-space-row"><div><b>${h(space.title)}</b><div class="small muted">${h(space.visibility === 'private' ? 'خاص بطلاب الدورة المسجلين' : 'عام لجميع مستخدمي المنصة')}${space.teacherName ? ` · ${h(space.teacherName)}` : ''}${space.active === false ? ' · مؤرشف' : ''}</div></div>${space.id === 'general' ? '<span class="chip good">أساسي</span>' : `<button class="btn ${space.active === false ? 'good' : 'danger'}" data-mk-click="mkCommunitySpaceStatus('${domId(space.id)}',${space.active === false})">${space.active === false ? 'استعادة' : 'أرشفة'}</button>`}</div>`).join('');
    const banned = state().communityBannedMembers.map(member => `<div class="mk-community-space-row"><div><b>${h(member.userId)}</b><div class="small muted">${h(member.reason || 'بدون سبب مسجل')}</div></div><button class="btn good" data-mk-click="mkCommunityBan('${domId(member.userId)}','unban')">رفع الحظر</button></div>`).join('') || '<div class="empty">لا توجد حسابات محظورة حاليًا.</div>';
    openModal(`<div class="section-head"><div><h3>إدارة المنتديات</h3><span class="small muted">أنشئ مساحة عامة أو منتدى خاصًا بدورة، وأرشف المساحات القديمة.</span></div><button class="btn" data-mk-click="closeModal()">✕</button></div><form class="mk-community-form" data-mk-submit="mkCommunityCreateSpace(event)"><label>اسم المنتدى<input name="title" required minlength="2" maxlength="120" placeholder="مثال: أسئلة دورة الرياضيات"></label><label>الدورة أو المدرّس<select name="courseId"><option value="">منتدى عام لكل المنصة</option>${options}</select></label><label class="wide">وصف المنتدى<textarea name="description" maxlength="2000" placeholder="موضوعات المنتدى وقواعد المشاركة"></textarea></label><label>الخصوصية<select name="visibility"><option value="public">عام لجميع مستخدمي المنصة</option><option value="private">خاص بالطلاب المشتركين في الدورة</option></select></label><div class="notice">المنتدى الخاص مرتبط بدورة، ولا يراه إلا الطالب المشترك وولي الأمر المرتبط به.</div><button class="btn primary submit" type="submit">إنشاء المنتدى</button></form><h4>المنتديات الحالية</h4><div class="mk-community-manage-list">${spaceRows}</div><h4>حظر الأعضاء</h4><div class="mk-community-manage-list">${banned}</div>`);
  };

  pageWindow.mkCommunityCreateSpace = async function(event) {
    event.preventDefault();
    const form = event.target, data = new FormData(form), title = String(data.get('title') || '').trim(), courseId = String(data.get('courseId') || ''), visibility = String(data.get('visibility') || 'public');
    if (visibility === 'private' && !courseId) return toast('اختر دورة للمنتدى الخاص.');
    const submit = form.querySelector('button[type="submit"]'); if (submit) submit.disabled = true;
    try { await communityApi('/spaces',{method:'POST',body:{title,courseId,visibility,description:String(data.get('description') || '').trim()}}); loadedAt = 0; await pageWindow.mkCommunityLoad(true); pageWindow.mkCommunityManageSpaces(); toast('تم إنشاء المنتدى.'); }
    catch(error) { toast(error.message || 'تعذر إنشاء المنتدى.'); }
    finally { if (submit?.isConnected) submit.disabled = false; }
  };

  pageWindow.mkCommunitySpaceStatus = async function(spaceId, active) {
    if (!isAdminUser()) return toast('هذه الصلاحية للإدارة فقط.');
    try { await communityApi(`/spaces/${encodeURIComponent(spaceId)}`,{method:'PATCH',body:{active}}); loadedAt = 0; await pageWindow.mkCommunityLoad(true); pageWindow.mkCommunityManageSpaces(); }
    catch(error) { toast(error.message || 'تعذر تغيير حالة المنتدى.'); }
  };
})();
