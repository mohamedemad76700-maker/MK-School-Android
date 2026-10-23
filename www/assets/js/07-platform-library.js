/* Administrator-managed books and summaries, with server-enforced paid access. */
(function () {
  const role = () => String(current?.role || '').toLowerCase();
  const admin = () => role() === 'admin' || String(current?.id || '') === 'admin';
  const student = () => role() === 'student';
  const escapeHtml = value => window.esc(String(value ?? ''));
  const quote = value => String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n]/g, ' ');
  const records = () => Array.isArray(db.platformLibrary) ? db.platformLibrary : (db.platformLibrary = []);
  const payments = () => Array.isArray(db.payments) ? db.payments : (db.payments = []);
  const legacyLibraryPage = window.pages.library;
  const getResource = id => records().find(item => String(item.id) === String(id));
  const getPayment = resource => student() && resource
    ? payments().find(item => item.kind === 'library' && String(item.resourceId) === String(resource.id) && String(item.studentId) === String(current.id) && ['pending', 'paid'].includes(item.status))
    : null;
  const dateLabel = value => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('ar-EG');
  };

  /* The app shell is a single educational platform; feature navigation lives in the role menu. */
  window.navItems = () => [['courses', 'المنصة التعليمية', '🎓']];

  function itemCard(item) {
    const adminView = admin();
    const payment = getPayment(item);
    const free = item.type !== 'paid' || !(Number(item.price) > 0);
    const canOpen = adminView || free || payment?.status === 'paid';
    const status = payment?.status === 'pending' ? '<span class="chip warn">طلبك قيد المراجعة</span>' : '';
    const category = item.category === 'summary' ? 'ملخص' : 'كتاب';
    const access = free ? '<span class="chip good">مجاني</span>' : `<span class="chip warn">${escapeHtml(Number(item.price))} جنيه مصري</span>`;
    const action = adminView
      ? `<div class="row"><a class="btn" data-mk-file-ref="${escapeHtml(item.fileId)}" data-mk-file-download="1" download="${escapeHtml(item.fileName || item.title)}">فتح الملف</a><button class="btn" data-mk-click="mkLibraryEdit('${quote(item.id)}')">تعديل</button><button class="btn danger" data-mk-click="mkLibraryDelete('${quote(item.id)}')">حذف</button></div>`
      : canOpen
        ? `<a class="btn primary" data-mk-file-ref="${escapeHtml(item.fileId)}" data-mk-file-download="1" download="${escapeHtml(item.fileName || item.title)}">${free ? 'فتح / تحميل' : 'فتح المورد'}</a>`
        : payment?.status === 'pending' ? '<button class="btn" disabled>بانتظار المراجعة</button>' : `<button class="btn primary" data-mk-click="mkLibraryBuy('${quote(item.id)}')">شراء المورد</button>`;
    return `<article class="card" style="display:flex;flex-direction:column;gap:10px"><div class="section-head"><div class="chips"><span class="chip">${category}</span>${item.grade ? `<span class="chip">${escapeHtml(item.grade)}</span>` : ''}${item.subject ? `<span class="chip">${escapeHtml(item.subject)}</span>` : ''}</div><div class="row">${access}${status}</div></div><h3 style="margin:0">${escapeHtml(item.title)}</h3><p class="small muted">${escapeHtml(item.description || '')}</p><div class="small muted">📎 ${escapeHtml(item.fileName || 'ملف تعليمي')} • نُشر ${dateLabel(item.createdAt)}</div><div style="margin-top:auto">${action}</div></article>`;
  }

  window.mkLibraryOpenForm = function (id = '') {
    if (!admin()) return window.forbidden?.();
    const item = id ? getResource(id) : null;
    const gradeOptions = [...new Set([...(Array.isArray(grades) ? grades : []), ...(db.students || []).map(student => String(student.grade || ''))].filter(Boolean))]
      .map(grade => `<option value="${escapeHtml(grade)}" ${item?.grade === grade ? 'selected' : ''}>${escapeHtml(grade)}</option>`).join('');
    window.openModal(`<div class="section-head"><div><h3>${item ? 'تعديل مورد المكتبة' : 'إضافة كتاب أو ملخص'}</h3><span class="small muted">الرفع والنشر متاحان لحساب المدير فقط.</span></div><button class="btn" type="button" data-mk-click="closeModal()">إغلاق</button></div>
      <form data-mk-submit="mkLibrarySave(event)"><input id="mkLibraryId" type="hidden" value="${escapeHtml(item?.id || '')}">
      <label>عنوان المورد<input id="mkLibraryTitle" maxlength="180" required value="${escapeHtml(item?.title || '')}" placeholder="اسم الكتاب أو الملخص"></label>
      <div class="form-grid"><label>النوع<select id="mkLibraryCategory"><option value="book" ${item?.category !== 'summary' ? 'selected' : ''}>كتاب</option><option value="summary" ${item?.category === 'summary' ? 'selected' : ''}>ملخص</option></select></label><label>الصف المستهدف<select id="mkLibraryGrade"><option value="">كل الصفوف</option>${gradeOptions}</select></label></div>
      <label>المادة<input id="mkLibrarySubject" maxlength="100" value="${escapeHtml(item?.subject || '')}" placeholder="مثال: الرياضيات"></label>
      <label>وصف قصير<textarea id="mkLibraryDescription" rows="3" maxlength="1200">${escapeHtml(item?.description || '')}</textarea></label>
      ${item ? `<div class="notice">الملف الحالي: ${escapeHtml(item.fileName || 'مرفق')}</div>` : '<label>الكتاب أو الملخص (PDF أو DOCX أو XLSX أو TXT أو MD أو CSV، بحد أقصى 10MB)<input id="mkLibraryFile" type="file" accept=".pdf,.docx,.xlsx,.txt,.md,.csv" required></label>'}
      <div class="form-grid"><label>الإتاحة<select id="mkLibraryType" data-mk-change="mkLibraryTogglePrice()"><option value="free" ${item?.type !== 'paid' ? 'selected' : ''}>مجاني</option><option value="paid" ${item?.type === 'paid' ? 'selected' : ''}>مدفوع</option></select></label><label id="mkLibraryPriceWrap" style="${item?.type === 'paid' ? '' : 'display:none'}">السعر بالجنيه المصري<input id="mkLibraryPrice" type="number" min="0.01" max="1000000" step="0.01" value="${escapeHtml(item?.price || 1)}"></label></div>
      <label class="row"><input id="mkLibraryActive" type="checkbox" ${item?.active !== false ? 'checked' : ''}> منشور ومتاح للطلاب</label>
      <div class="notice">المورد المدفوع يظل مقفولًا حتى يراجع المدير طلب Vodafone Cash ويعتمده.</div><button class="btn primary" style="width:100%">${item ? 'حفظ التعديلات' : 'رفع ونشر المورد'}</button></form>`);
    window.mkLibraryTogglePrice();
  };
  window.mkLibraryTogglePrice = function () {
    const paid = document.getElementById('mkLibraryType')?.value === 'paid';
    const wrap = document.getElementById('mkLibraryPriceWrap');
    const price = document.getElementById('mkLibraryPrice');
    if (wrap) wrap.style.display = paid ? '' : 'none';
    if (price) price.required = paid;
  };
  window.mkLibrarySave = async function (event) {
    event.preventDefault();
    if (!admin()) return window.forbidden?.();
    const id = document.getElementById('mkLibraryId')?.value || '';
    const existing = id ? getResource(id) : null;
    const previous = existing ? structuredClone(existing) : null;
    const title = document.getElementById('mkLibraryTitle')?.value.trim() || '';
    const type = document.getElementById('mkLibraryType')?.value || 'free';
    const price = type === 'paid' ? Number(document.getElementById('mkLibraryPrice')?.value) : 0;
    if (!title) return window.toast?.('اكتب عنوان المورد');
    if (type === 'paid' && (!Number.isFinite(price) || price <= 0 || price > 1000000)) return window.toast?.('أدخل سعرًا صحيحًا أكبر من صفر');
    let uploaded = null;
    let updated = null;
    try {
      if (!existing) {
        const file = document.getElementById('mkLibraryFile')?.files?.[0];
        if (!file) return window.toast?.('اختر ملف الكتاب أو الملخص');
        if (file.size > 10 * 1024 * 1024) return window.toast?.('حجم الملف يجب ألا يتجاوز 10MB');
        uploaded = await window.mkUploadSchoolFile(file, 'platform-library');
      }
      updated = {
        ...(existing || {}), id: existing?.id || uid('lib'), title,
        category: document.getElementById('mkLibraryCategory')?.value === 'summary' ? 'summary' : 'book',
        grade: document.getElementById('mkLibraryGrade')?.value || '',
        subject: document.getElementById('mkLibrarySubject')?.value.trim() || '',
        description: document.getElementById('mkLibraryDescription')?.value.trim() || '',
        type, price, currency: 'EGP', active: !!document.getElementById('mkLibraryActive')?.checked,
        ...(uploaded ? { fileId: uploaded.id, fileName: uploaded.name, fileType: uploaded.type, fileSize: uploaded.size } : {}),
        createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      if (existing) Object.assign(existing, updated); else records().push(updated);
      window.save();
      const saved = await window.mkBackendPushPlatform?.();
      if (!saved) {
        if (existing && previous) Object.assign(existing, previous);
        else db.platformLibrary = records().filter(resource => String(resource.id) !== String(updated.id));
        if (uploaded) await window.mkDeleteSchoolFile?.(uploaded.id).catch(() => {});
        window.save();
        return window.toast?.(window.__mkBackendLastError || 'تعذر حفظ المورد على خادم المدرسة.');
      }
      window.closeModal();
      window.renderPage();
      window.toast(existing ? 'تم تحديث مورد المكتبة' : 'تم رفع ونشر المورد');
    } catch (error) {
      if (existing && previous) Object.assign(existing, previous);
      else if (updated) db.platformLibrary = records().filter(resource => String(resource.id) !== String(updated.id));
      if (uploaded) await window.mkDeleteSchoolFile?.(uploaded.id).catch(() => {});
      window.save();
      window.toast?.(error?.message || 'تعذر رفع المورد أو حفظه');
    }
  };
  window.mkLibraryEdit = id => window.mkLibraryOpenForm(id);
  window.mkLibraryDelete = async function (id) {
    if (!admin()) return window.forbidden?.();
    const item = getResource(id);
    if (!item || !window.confirm(`حذف المورد «${item.title}»؟`)) return;
    const prior = item;
    db.platformLibrary = records().filter(row => String(row.id) !== String(id));
    save();
    const saved = await window.mkBackendPushPlatform?.();
    if (!saved) {
      db.platformLibrary.push(prior);
      save();
      return window.toast?.(window.__mkBackendLastError || 'تعذر حذف المورد من الخادم.');
    }
    await window.mkDeleteSchoolFile?.(item.fileId).catch(() => {});
    renderPage();
    window.toast('تم حذف المورد');
  };

  window.mkLibraryBuy = function (id) {
    if (!student()) return window.forbidden?.();
    const item = getResource(id);
    if (!item || item.active === false || item.type !== 'paid' || !(Number(item.price) > 0)) return window.toast?.('المورد غير متاح للشراء');
    const currentPayment = getPayment(item);
    if (currentPayment) return window.toast?.(currentPayment.status === 'paid' ? 'تم اعتماد شراء هذا المورد' : 'طلب الشراء قيد مراجعة الإدارة');
    const number = String(db.paymentSettings?.vodafoneCashNumber || '').trim();
    if (!number) return window.toast?.('لم تضبط الإدارة رقم Vodafone Cash لاستقبال التحويلات بعد');
    window.openModal(`<div class="section-head"><div><h3>شراء ${escapeHtml(item.category === 'summary' ? 'الملخص' : 'الكتاب')}</h3><span class="small muted">${escapeHtml(item.title)} • ${escapeHtml(item.price)} جنيه</span></div><button class="btn" data-mk-click="closeModal()">إغلاق</button></div>
      <div class="notice">حوّل ${escapeHtml(item.price)} جنيه عبر Vodafone Cash إلى الرقم التالي:</div><div class="quick" dir="ltr"><b>${escapeHtml(number)}</b></div>
      <form data-mk-submit="mkLibrarySubmitPayment(event,'${quote(item.id)}')"><label>رقم الهاتف الذي حوّلت منه<input id="mkLibrarySender" type="tel" inputmode="tel" required placeholder="01xxxxxxxxx"></label><label>رقم العملية / المرجع<input id="mkLibraryReference" maxlength="80" required></label><label>صورة الإيصال (مطلوبة، حتى 3MB)<input id="mkLibraryReceipt" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required></label><button class="btn primary" style="width:100%">إرسال طلب الشراء</button></form>`);
  };
  window.mkLibrarySubmitPayment = async function (event, id) {
    event.preventDefault();
    if (!student()) return window.forbidden?.();
    const item = getResource(id);
    if (!item || item.active === false || item.type !== 'paid' || !(Number(item.price) > 0)) return window.toast?.('المورد لم يعد متاحًا للشراء');
    if (getPayment(item)) return window.toast?.('لديك طلب شراء نشط لهذا المورد');
    const senderPhone = String(document.getElementById('mkLibrarySender')?.value || '').replace(/[\s()-]/g, '');
    if (!/^(?:01[0125]\d{8}|(?:\+?20)1[0125]\d{8})$/.test(senderPhone)) return window.toast?.('اكتب رقم هاتف مصري صحيحًا تم التحويل منه');
    const reference = document.getElementById('mkLibraryReference')?.value.trim() || '';
    if (reference.length < 4 || reference.length > 80) return window.toast?.('اكتب رقم العملية أو المرجع بشكل صحيح');
    if (payments().some(payment => String(payment.reference || '').trim().toLowerCase() === reference.toLowerCase() && payment.status !== 'rejected')) return window.toast?.('تم إرسال رقم العملية هذا من قبل');
    const file = document.getElementById('mkLibraryReceipt')?.files?.[0];
    if (!file || file.size > 3 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) return window.toast?.('ارفع صورة JPG أو PNG أو WebP أو GIF بحد أقصى 3MB');
    let uploaded;
    try {
      uploaded = await window.mkUploadSchoolFile(file, 'payment-receipt');
      const payment = { id: uid('pay'), kind: 'library', resourceId: item.id, resourceTitle: item.title, studentId: current.id, amount: Number(item.price), currency: 'EGP', provider: 'vodafone_cash', senderPhone, reference, receipt: { fileId: uploaded.id, name: uploaded.name, type: uploaded.type, size: uploaded.size }, status: 'pending', createdAt: new Date().toISOString() };
      payments().push(payment);
      window.save();
      if (!await window.mkBackendPushPlatform?.()) {
        db.payments = payments().filter(row => String(row.id) !== String(payment.id));
        await window.mkDeleteSchoolFile?.(uploaded.id).catch(() => {});
        window.save();
        return window.toast?.(window.__mkBackendLastError || 'تعذر حفظ الطلب على الخادم؛ لم يتم إرساله.');
      }
      window.closeModal();
      window.renderPage();
      window.toast('تم إرسال طلب الشراء للإدارة. سيفتح المورد بعد اعتماد الدفع.');
    } catch (error) {
      if (uploaded) await window.mkDeleteSchoolFile?.(uploaded.id).catch(() => {});
      window.toast?.(error?.message || 'تعذر إرسال طلب الشراء');
    }
  };

  window.mkLibraryApprovePayment = async function (id, status) {
    if (!admin()) return window.forbidden?.();
    const payment = payments().find(row => String(row.id) === String(id) && row.kind === 'library');
    if (!payment || payment.status !== 'pending') return window.toast?.('طلب المكتبة لم يعد قيد المراجعة');
    const item = getResource(payment.resourceId);
    if (!item) return window.toast?.('المورد المرتبط بالطلب لم يعد موجودًا');
    payment.status = status;
    payment.approvedAt = status === 'paid' ? new Date().toISOString() : undefined;
    payment.rejectedAt = status === 'rejected' ? new Date().toISOString() : undefined;
    payment.approvedBy = current.id;
    save();
    const saved = await window.mkBackendPushPlatform?.();
    if (!saved) {
      payment.status = 'pending';
      delete payment.approvedAt;
      delete payment.rejectedAt;
      delete payment.approvedBy;
      save();
      return window.toast?.(window.__mkBackendLastError || 'تعذر حفظ مراجعة الدفع.');
    }
    window.notifyUser?.(payment.studentId, status === 'paid' ? 'تم اعتماد شراء مورد المكتبة' : 'رُفض طلب شراء مورد المكتبة', status === 'paid' ? `أصبح المورد «${item.title}» متاحًا في المكتبة.` : `راجع الإدارة بخصوص المورد «${item.title}».`);
    window.audit?.(status === 'paid' ? 'library_purchase_approved' : 'library_purchase_rejected', `${payment.id} — ${item.title}`);
    renderPage();
    window.toast(status === 'paid' ? 'تم اعتماد الدفع وفتح الملف للطالب' : 'تم رفض طلب الشراء');
  };

  window.pages.library = function () {
    if (role() === 'teacher') return window.forbidden?.() || '<div class="card">هذه الصفحة غير متاحة لهذا الحساب.</div>';
    const items = records().filter(item => item && item.active !== false).slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const heading = admin() ? 'كتب وملخصات المدرسة' : 'مكتبة الكتب والملخصات';
    const note = admin() ? 'ارفع ملفات آمنة وحدد الصف والسعر، ثم راجع طلبات الشراء من صفحة المدفوعات.' : 'الملفات المدفوعة لا تفتح إلا بعد مراجعة الإدارة لطلب الدفع.';
    const adminAction = admin() ? '<button class="btn primary" data-mk-click="mkLibraryOpenForm()">+ إضافة كتاب أو ملخص</button>' : '';
    const libraryBlock = `<section class="card"><div class="section-head"><div><h3>📚 ${heading}</h3><span class="small muted">${note}</span></div>${adminAction}</div><div class="platform-content">${items.map(itemCard).join('') || '<div class="empty">لا توجد كتب أو ملخصات منشورة بعد.</div>'}</div></section>`;
    return `${libraryBlock}${typeof legacyLibraryPage === 'function' ? legacyLibraryPage() : ''}`;
  };

  window.pages.payments = function () {
    const rows = payments().filter(payment => admin() || String(payment.studentId) === String(current?.id)).slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const label = payment => payment.kind === 'library'
      ? getResource(payment.resourceId)?.title || payment.resourceTitle || 'مورد مكتبة'
      : (db.courses || []).find(course => String(course.id) === String(payment.courseId))?.title || 'دورة';
    const state = payment => ({ pending: 'قيد مراجعة الإدارة', paid: 'تم الاعتماد', rejected: 'مرفوض' })[payment.status] || 'غير معروف';
    if (admin()) return `<div class="card"><div class="section-head"><div><h3>💳 طلبات الدفع</h3><span class="small muted">راجع إيصال التحويل ورقم الهاتف قبل الاعتماد.</span></div><button class="btn" data-mk-click="mkVodafoneSettings()">⚙️ رقم الاستقبال</button></div><div class="table-wrap"><table class="table"><thead><tr><th>الطالب</th><th>الدورة / المورد</th><th>المبلغ</th><th>هاتف التحويل</th><th>المرجع</th><th>الإيصال</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>${rows.map(payment => {
      const learner = (db.students || []).find(row => String(row.id) === String(payment.studentId));
      const receipt = payment.receipt?.fileId ? `<a class="btn" data-mk-file-ref="${escapeHtml(payment.receipt.fileId)}" data-mk-file-download="1" download="${escapeHtml(payment.receipt.name || 'receipt')}">عرض الإيصال</a>` : '—';
      const actions = payment.status !== 'pending' ? '—' : payment.kind === 'library'
        ? `<button class="btn good" data-mk-click="mkLibraryApprovePayment('${quote(payment.id)}','paid')">اعتماد وفتح المورد</button> <button class="btn danger" data-mk-click="mkLibraryApprovePayment('${quote(payment.id)}','rejected')">رفض</button>`
        : `<button class="btn good" data-mk-click="v32ApprovePayment('${quote(payment.id)}')">اعتماد وفتح الدورة</button> <button class="btn danger" data-mk-click="v32RejectPayment('${quote(payment.id)}')">رفض</button>`;
      return `<tr><td>${escapeHtml(learner?.name || payment.studentId)}</td><td>${payment.kind === 'library' ? '📚 ' : '🎓 '}${escapeHtml(label(payment))}</td><td>${escapeHtml(payment.amount)} ${escapeHtml(payment.currency || 'EGP')}</td><td dir="ltr">${escapeHtml(payment.senderPhone || '—')}</td><td>${escapeHtml(payment.reference || '—')}</td><td>${receipt}</td><td><span class="chip ${payment.status === 'paid' ? 'good' : payment.status === 'rejected' ? 'bad' : 'warn'}">${state(payment)}</span></td><td>${actions}</td></tr>`;
    }).join('') || '<tr><td colspan="8" class="empty">لا توجد طلبات دفع.</td></tr>'}</tbody></table></div></div>`;
    return `<div class="card"><div class="section-head"><h3>💳 مدفوعاتي</h3></div><div class="list">${rows.map(payment => `<div class="list-item"><div><b>${payment.kind === 'library' ? '📚 ' : '🎓 '}${escapeHtml(label(payment))}</b><div class="small muted">${escapeHtml(payment.amount)} جنيه • تحويل من ${escapeHtml(payment.senderPhone || '—')} • مرجع ${escapeHtml(payment.reference || '—')}</div></div><span class="chip ${payment.status === 'paid' ? 'good' : payment.status === 'rejected' ? 'bad' : 'warn'}">${state(payment)}</span></div>`).join('') || '<div class="empty">لا توجد طلبات دفع.</div>'}</div></div>`;
  };

  /* Keep all learning tools inside the Platform section. */
  window.mkRenderPlatformCatalog=window.pages.courses;
  const platformTabsByRole={
    admin:[['dashboard','الرئيسية التعليمية','⌂'],['courses','الدورات والمحاضرات','🎓'],['studentAffairs','بيانات المستخدمين والتسجيل','👥'],['deviceControl','فك ربط الأجهزة','📱'],['announcements','إعلانات المنصة','📣'],['community','المنتدى','💬'],['assignments','الواجبات','📝'],['exams','الاختبارات','🧪'],['questionBank','بنك الأسئلة','🧠'],['grades','الدرجات','⭐'],['certificates','الشهادات','🏅'],['ai','MK AI','🤖'],['rewards','متجر النقاط','⭐'],['library','المكتبة','📚'],['payments','طلبات الدفع','💳'],['activityLog','سجل النشاط','🧾'],['settings','إعدادات المنصة','⚙️'],['messages','الرسائل','✉️'],['notifications','التنبيهات','🔔']],
    teacher:[['dashboard','الرئيسية التعليمية','⌂'],['courses','الدورات والمحاضرات','🎓'],['announcements','إعلانات المنصة','📣'],['community','المنتدى','💬'],['assignments','الواجبات','📝'],['exams','الاختبارات','🧪'],['questionBank','بنك الأسئلة','🧠'],['grades','الدرجات','⭐'],['settings','إعدادات الحساب','⚙️'],['messages','الرسائل','✉️'],['notifications','التنبيهات','🔔']],
    parent:[['dashboard','الرئيسية التعليمية','⌂'],['courses','الدورات والمحاضرات','🎓'],['announcements','إعلانات المنصة','📣'],['community','المنتدى','💬'],['assignments','واجبات الأبناء','📝'],['grades','درجات الأبناء','⭐'],['familyLink','ربط الأبناء','👨‍👩‍👧'],['ai','المساعد الذكي','🤖'],['settings','إعدادات الحساب','⚙️'],['messages','الرسائل','✉️'],['notifications','التنبيهات','🔔']],
    student:[['dashboard','الرئيسية التعليمية','⌂'],['courses','الدورات والمحاضرات','🎓'],['announcements','إعلانات المنصة','📣'],['community','المنتدى','💬'],['exams','اختباراتي','🧪'],['grades','درجاتي','⭐'],['certificates','شهاداتي','🏅'],['achievements','إنجازاتي','🏆'],['rewards','متجر النقاط','⭐'],['library','مكتبتي','📚'],['payments','مدفوعاتي','💳'],['familyLink','ربط ولي الأمر','👨‍👩‍👧'],['ai','المساعد الذكي','🤖'],['profile','حسابي وإحصائياتي','👤'],['settings','إعدادات الحساب','⚙️'],['messages','الرسائل','✉️'],['notifications','التنبيهات','🔔']]
  };
  window.mkPlatformAdminTabs=platformTabsByRole.admin;
  const platformPageRoutes={community:'community',assignments:'assignments',exams:'exams',questionBank:'questionBank',grades:'grades',achievements:'achievements',library:'library',payments:'payments',profile:'profile',familyLink:'familyLink',rewards:'rewards',activityLog:'activityLog',studentAffairs:'studentAffairs',deviceControl:'deviceControl',settings:'settings',announcements:'announcements',certificates:'certificates',messages:'messages',notifications:'notifications',dashboard:'learningDashboard'};
  for(const name of ['teacher','parent','student'])platformTabsByRole[name]=platformTabsByRole[name].filter(item=>item[0]!=='settings');
  const baseCatalogSearch=window.mkPlatformCatalogSearch;
  window.mkPlatformCatalogSearch=function(value){
    window.mkPlatformCatalogQuery=String(value||'');
    if(window.mkPlatformCatalogQuery.trim()&&(window.mkPlatformTab!=='courses'||window.mkPlatformView!=='catalog')){
      window.mkPlatformTab='courses';window.mkPlatformView='catalog';baseShowPage('courses');return;
    }
    if(typeof baseCatalogSearch==='function')return baseCatalogSearch(value);
  };
  const baseShowPage=window.showPage;
  window.mkPlatformOpen=function(tab){
    const tabs=platformTabsByRole[String(current?.role||'').toLowerCase()]||[];
    if(!tabs.some(item=>item[0]===tab))return window.toast?.('هذا القسم غير متاح لهذا الحساب');
    window.mkPlatformTab=tab;if(tab==='courses')window.mkPlatformView='catalog';
    window.mkClosePlatformMenu?.();
    if(page==='courses'){renderSide();renderPage();window.scrollTo({top:0,behavior:'smooth'});}
    else baseShowPage('courses');
  };
  window.mkPlatformHome=function(){window.mkPlatformOpen('courses')};
  window.showPage=function(target){
    if(target==='courses')return window.mkPlatformOpen('courses');
    if(platformPageRoutes[target])return window.mkPlatformOpen(platformPageRoutes[target]);
    window.mkClosePlatformMenu();
    if(target!=='courses')window.toast?.('هذا القسم غير متاح في نسخة المنصة');
    return window.mkPlatformOpen('courses');
  };
   window.mkTogglePlatformMenu=function(){const wrap=document.getElementById('mkPlatformMenuWrap'),trigger=document.getElementById('mkPlatformMenuTrigger');if(!wrap)return;const open=!wrap.classList.contains('open');wrap.classList.toggle('open',open);trigger?.setAttribute('aria-expanded',String(open));if(open)requestAnimationFrame(()=>document.querySelector('#mkPlatformMenu button')?.focus());};
   window.mkClosePlatformMenu=function(restoreFocus=false){const wrap=document.getElementById('mkPlatformMenuWrap'),trigger=document.getElementById('mkPlatformMenuTrigger');wrap?.classList.remove('open');trigger?.setAttribute('aria-expanded','false');if(restoreFocus)trigger?.focus();};
  function renderPlatformMenu(tabs,active){
    const groups=new Map(),management=new Set(['studentAffairs','deviceControl','activityLog','settings']);
    for(const item of tabs){
      const key=item[0],group=admin()&&(management.has(key)||key==='payments')?'إدارة المنصة':['dashboard','courses','assignments','exams','questionBank','grades','certificates','achievements'].includes(key)?'التعلم والمتابعة':['community','announcements','library','rewards','ai'].includes(key)?'المجتمع والمصادر':'حسابك والتواصل';
      if(!groups.has(group))groups.set(group,[]);groups.get(group).push(item);
    }
    return '<div class="mk-platform-menu-heading">أقسام المنصة</div>'+[...groups].map(([title,items])=>`<section class="mk-platform-menu-group"><div class="mk-platform-menu-group-title">${title}</div>${items.map(([key,label,icon])=>`<button type="button" role="menuitem" class="${active===key?'active':''}" aria-current="${active===key?'page':'false'}" data-mk-click="mkPlatformOpen('${key}')"><span class="mk-menu-icon" aria-hidden="true">${icon}</span><span>${label}</span></button>`).join('')}</section>`).join('');
  }
  function syncPlatformHeader(tabs,active){
    const isPlatform=page==='courses'||page==='courseDetails';document.body.classList.toggle('mk-platform-active',isPlatform);
    const search=document.getElementById('mkPlatformTopSearch');if(search){search.value=window.mkPlatformCatalogQuery||'';search.setAttribute('aria-label','البحث في الدورات والمحاضرات');}
    const pointsPill=document.getElementById('mkPlatformPointsPill');if(pointsPill){const student=String(current?.role||'').toLowerCase()==='student';pointsPill.hidden=!student;const value=document.getElementById('mkPlatformPointsValue');if(value)value.textContent=String(Math.max(0,Number(db.platformPoints?.[current?.id]||0)));if(isPlatform&&student)void window.mkRefreshPlatformPoints?.();}
    const menu=document.getElementById('mkPlatformMenu');if(menu)menu.innerHTML=renderPlatformMenu(tabs,active);
    const brand=document.querySelector('.logo-mini');if(brand?.lastChild?.nodeType===3)brand.lastChild.textContent=' منصة MK التعليمية';
    const actions=document.querySelector('.top-actions');if(actions&&!actions.querySelector('[data-mk-platform-logout]')){const button=document.createElement('button');button.type='button';button.className='icon-btn';button.dataset.mkPlatformLogout='1';button.textContent='⎋';button.title='تسجيل الخروج';button.setAttribute('aria-label','تسجيل الخروج');button.addEventListener('click',()=>window.logout?.());actions.appendChild(button);}
  }
  document.addEventListener('click',event=>{const wrap=document.getElementById('mkPlatformMenuWrap');if(wrap&&!wrap.contains(event.target))window.mkClosePlatformMenu();});
   document.addEventListener('keydown',event=>{const wrap=document.getElementById('mkPlatformMenuWrap'),menu=document.getElementById('mkPlatformMenu');if(event.key==='Escape'&&wrap?.classList.contains('open')){window.mkClosePlatformMenu(true);return;}if(!wrap?.classList.contains('open')||!menu?.contains(document.activeElement))return;const items=[...menu.querySelectorAll('button[role="menuitem"]')];if(!items.length)return;const index=items.indexOf(document.activeElement);let next=-1;if(event.key==='ArrowDown')next=(index+1)%items.length;else if(event.key==='ArrowUp')next=(index-1+items.length)%items.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=items.length-1;if(next>=0){event.preventDefault();items[next].focus();}});
  let pointsFetchAt=0,pointsFetchPromise=null;
  window.mkRefreshPlatformPoints=async function(force=false){if(!current||String(current.role).toLowerCase()!=='student')return;const now=Date.now();if(pointsFetchPromise)return pointsFetchPromise;if(!force&&now-pointsFetchAt<30000)return;const cfg=window.mkVideoCfg?.()||{},token=mkRuntimeGetItem('mk_video_jwt');if(!cfg.url||!token)return;pointsFetchAt=now;pointsFetchPromise=(async()=>{try{const response=await fetch(cfg.url+'/api/v1/platform/rewards',{headers:{Authorization:'Bearer '+token},cache:'no-store'}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||data.error||'points refresh failed');if(String(current?.role||'').toLowerCase()!=='student')return;db.platformPoints=db.platformPoints||{};db.platformPoints[current.id]=Math.max(0,Number(data.balance)||0);if(Array.isArray(data.rewards))db.platformRewards=data.rewards.map(item=>({id:String(item.id),title:String(item.title||''),description:String(item.description||''),cost:Number(item.cost)||0,stock:Number(item.stock),active:item.active!==false}));save();const value=document.getElementById('mkPlatformPointsValue');if(value)value.textContent=String(db.platformPoints[current.id]);}catch(error){pointsFetchAt=0;console.warn('Unable to refresh platform points',error)}finally{pointsFetchPromise=null}})();return pointsFetchPromise;};
  window.pages.rewards=function(){const admin=String(current?.role||'').toLowerCase()==='admin',student=String(current?.role||'').toLowerCase()==='student';if(!admin&&!student)return window.forbidden?.()||'<div class="notice warn">هذا القسم غير متاح لهذا الحساب.</div>';return window.mkPlatformRewardsBlock?.(admin,student)||'<div class="card empty">متجر النقاط غير متاح حاليًا.</div>';};
  window.pages.familyLink=function(){
    const role=String(current?.role||'').toLowerCase();
    if(role==='student')return `<section class="card"><div class="section-head"><div><h3>👨‍👩‍👧 ربط حساب ولي الأمر</h3><span class="small muted">أنشئ كودًا مؤقتًا ليتمكن ولي أمرك من ربط حسابه ومتابعة نتائجك وواجباتك.</span></div></div><div class="notice">الكود صالح لمرة واحدة لمدة 15 دقيقة. شاركه مع ولي أمرك عبر وسيلة خاصة فقط.</div><button class="btn primary" style="margin-top:14px" data-mk-click="mkCreateParentLinkCode()">إنشاء كود ربط آمن</button><div id="parentLinkCodeResult" class="notice good" style="display:none;margin-top:14px" role="status" aria-live="polite"></div><div class="small muted" style="margin-top:12px">رقم ولي الأمر المسجل: <b dir="ltr">${escapeHtml(current?.parentPhone||current?.guardianPhone||'يمكنك مراجعته مع الإدارة')}</b></div></section>`;
    if(role==='parent'){
      const children=typeof visibleStudents==='function'?visibleStudents():[];
      return `<section class="card"><div class="section-head"><div><h3>👨‍👩‍👧 ربط ومتابعة الأبناء</h3><span class="small muted">اربط حساب الطالب بكوده المؤقت لمتابعة درجاته وواجباته ودوراته من داخل المنصة.</span></div><button class="btn" data-mk-click="showPage('grades')">درجات الأبناء</button></div><form class="row" data-mk-submit="mkRedeemParentLink();return false"><label style="flex:1">كود الربط الذي أنشأه الطالب<input id="parentLinkCode" inputmode="text" autocomplete="one-time-code" maxlength="32" required placeholder="أدخل الكود المرسل لك"></label><button class="btn primary" style="align-self:end">ربط حساب الطالب</button></form><h3 style="margin-top:20px">الأبناء المرتبطون</h3><div class="quick-grid">${children.map(child=>`<article class="quick"><b>${escapeHtml(child.name||'طالب')}</b><span class="small muted">${escapeHtml(child.grade||'')}</span><button class="btn" data-mk-click="showPage('grades')">متابعة النتائج</button></article>`).join('')||'<div class="empty" style="grid-column:1/-1">لا يوجد أبناء مرتبطون بعد. اطلب من الطالب إنشاء كود ربط من حسابه.</div>'}</div></section>`;
    }
    return '<div class="card empty">خدمة ربط ولي الأمر متاحة لحساب الطالب وولي الأمر فقط.</div>';
  };
  window.pages.learningDashboard=function(){
    const role=String(current?.role||'').toLowerCase(),userId=String(current?.id||'');
    const shortcuts=[['courses','الدورات','🎓'],['assignments',role==='parent'?'واجبات الأبناء':'الواجبات','📝'],['grades',role==='parent'?'نتائج الأبناء':'النتائج','⭐'],['ai','المساعد الذكي','🤖'],['community','المنتدى','💬']].filter(([key])=>(platformTabsByRole[role]||[]).some(item=>item[0]===key));
    if(role==='student'){
      const enrolled=(db.courses||[]).filter(course=>course.active!==false&&(course.enrollments||[]).map(String).includes(userId));
      const total=enrolled.reduce((sum,course)=>sum+(course.lessons||[]).length,0),watched=enrolled.reduce((sum,course)=>sum+(Array.isArray(courseProgress(course,userId))?courseProgress(course,userId).length:0),0),percent=total?Math.min(100,Math.round(watched/total*100)):0;
      const points=Math.max(0,Number(db.platformPoints?.[userId]||0));
      const latestGrade=(db.examResults||[]).filter(result=>String(result.student||result.studentId)===userId).slice(-3).reverse();
      return `<section class="hero"><div><h1>أهلًا ${escapeHtml(current?.name||'بك')} 👋</h1><p>مساحتك التعليمية لمتابعة الدورات والواجبات والنتائج من مكان واحد.</p></div><span class="hero-badge">🎯 تقدّمك ${percent}%</span></section><div class="stats"><article class="stat"><span class="muted">دوراتي</span><div class="num">${enrolled.length}</div><span class="small">دورة نشطة</span></article><article class="stat"><span class="muted">الدروس المكتملة</span><div class="num">${watched} / ${total}</div><div class="progress"><i style="width:${percent}%"></i></div></article><article class="stat"><span class="muted">رصيد النقاط</span><div class="num">⭐ ${points}</div><button class="btn" data-mk-click="mkPlatformOpen('rewards')">استبدل نقاطك</button></article><article class="stat"><span class="muted">آخر نتيجة</span><div class="num">${latestGrade.length?escapeHtml(String(latestGrade[0].score??latestGrade[0].percentage??'—')):'—'}</div><button class="btn" data-mk-click="mkPlatformOpen('grades')">عرض النتائج</button></article></div><section class="card"><div class="section-head"><div><h2>📚 تابع تعلمك</h2><span class="small muted">افتح الدورة التي تريد إكمالها أو استكشف دورات جديدة.</span></div><button class="btn primary" data-mk-click="mkPlatformOpen('courses')">استكشاف الدورات</button></div><div class="quick-grid">${enrolled.slice(0,4).map(course=>{const done=Array.isArray(courseProgress(course,userId))?courseProgress(course,userId).length:0,count=(course.lessons||[]).length,pct=count?Math.min(100,Math.round(done/count*100)):0;return `<article class="quick" style="text-align:right"><b>${escapeHtml(course.title||'دورة تعليمية')}</b><span class="small muted">${escapeHtml(course.instructor||'فريق المنصة')} • ${count} درس</span><div class="progress"><i style="width:${pct}%"></i></div><span class="small muted">أنجزت ${done} من ${count}</span><button class="btn primary" data-mk-click="courseDetails('${quote(course.id)}')">متابعة الدورة</button></article>`}).join('')||'<div class="empty" style="grid-column:1/-1">ابدأ باختيار دورة تعليمية من كتالوج المنصة.</div>'}</div></section><section class="card"><div class="section-head"><h2>⚡ وصول سريع</h2><span class="small muted">كل أدوات التعلم قريبة منك</span></div><div class="quick-grid">${shortcuts.map(([key,label,icon])=>`<button class="quick" data-mk-click="mkPlatformOpen('${key}')"><span style="font-size:24px">${icon}</span><b>${label}</b></button>`).join('')}</div></section><section class="card"><div class="section-head"><h2>🧾 أحدث نتائجك</h2><button class="btn" data-mk-click="mkPlatformOpen('grades')">كل النتائج</button></div><div class="list">${latestGrade.map(result=>`<div class="list-item row"><b>${escapeHtml(result.title||result.examTitle||'اختبار')}</b><span>${escapeHtml(String(result.score??result.percentage??'—'))}${result.max?` / ${escapeHtml(String(result.max))}`:''}</span></div>`).join('')||'<div class="empty">ستظهر نتائجك هنا بعد إكمال أول اختبار أو واجب.</div>'}</div></section>`;
    }
    if(role==='parent'){
      const children=typeof visibleStudents==='function'?visibleStudents():[];
      return `<section class="hero"><div><h1>متابعة الأبناء</h1><p>تابع نتائج أبنائك وواجباتهم ودوراتهم من حساب ولي الأمر.</p></div><span class="hero-badge">👨‍👩‍👧 ${children.length} حساب مرتبط</span></section><section class="card"><div class="section-head"><h2>الأبناء المرتبطون</h2><button class="btn primary" data-mk-click="mkPlatformOpen('familyLink')">إدارة الربط</button></div><div class="quick-grid">${children.map(child=>`<article class="quick"><b>${escapeHtml(child.name||'طالب')}</b><span class="small muted">${escapeHtml(child.grade||'')}</span><button class="btn" data-mk-click="mkPlatformOpen('grades')">متابعة النتائج</button></article>`).join('')||'<div class="empty" style="grid-column:1/-1">اربط حساب ابنك بكود الربط لتظهر نتائجه هنا.</div>'}</div></section><section class="card"><h2>⚡ متابعة سريعة</h2><div class="quick-grid">${shortcuts.map(([key,label,icon])=>`<button class="quick" data-mk-click="mkPlatformOpen('${key}')"><span style="font-size:24px">${icon}</span><b>${label}</b></button>`).join('')}</div></section>`;
    }
    const admin=role==='admin';
    return `<section class="hero"><div><h1>${admin?'إدارة المنصة التعليمية':'مساحتك التعليمية'}</h1><p>${admin?'تابع خدمات المنصة التعليمية وإدارة حساباتها من لوحة واحدة.':'ابدأ من الدورات وتابع أنشطتك التعليمية.'}</p></div><span class="hero-badge">🎓 منصة MK التعليمية</span></section><section class="card"><div class="section-head"><h2>⚡ أقسام المنصة</h2></div><div class="quick-grid">${shortcuts.map(([key,label,icon])=>`<button class="quick" data-mk-click="mkPlatformOpen('${key}')"><span style="font-size:24px">${icon}</span><b>${label}</b></button>`).join('')}</div>${admin?'<div class="row" style="margin-top:14px"><button class="btn" data-mk-click="mkPlatformOpen(\'studentAffairs\')">بيانات المستخدمين والتسجيل</button><button class="btn" data-mk-click="mkPlatformOpen(\'payments\')">طلبات الدفع</button><button class="btn" data-mk-click="mkPlatformOpen(\'deviceControl\')">فك ربط الأجهزة</button></div>':''}</section>`;
  };
  const baseSettingsPage=window.pages.settings;
  window.mkAdminResetAccountPassword=async function(event){event.preventDefault();if(String(current?.role||'').toLowerCase()!=='admin')return window.forbidden?.();const lookup=String(document.getElementById('mkResetAccountLookup')?.value||'').trim(),password=String(document.getElementById('mkResetAccountPassword')?.value||''),message=document.getElementById('mkResetAccountMessage'),button=document.getElementById('mkResetAccountSubmit'),cfg=window.mkVideoCfg?.()||{},token=mkRuntimeGetItem('mk_video_jwt');if(!lookup||password.length<8||password.length>1024)return toast('أدخل البريد أو رقم الحساب وكلمة مرور مؤقتة لا تقل عن 8 أحرف');if(!cfg.url||!token)return toast('خادم المدرسة غير متصل');button.disabled=true;if(message)message.textContent='جارٍ تغيير كلمة المرور وإغلاق الجلسات القديمة…';try{const response=await fetch(cfg.url+'/api/v1/admin/accounts/password-reset',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({user_id:lookup,password})}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||data.error||'تعذر تغيير كلمة المرور');document.getElementById('mkResetAccountPassword').value='';if(message)message.textContent=`تم تغيير كلمة مرور الحساب ${data.user_id} وإغلاق جلساته. أبلغ صاحب الحساب بكلمة المرور المؤقتة عبر وسيلة خاصة.`;audit('admin_manual_password_reset',String(data.user_id));toast('تم تغيير كلمة المرور بنجاح')}catch(error){if(message)message.textContent=error.message||'تعذر تغيير كلمة المرور'}finally{button.disabled=false}};
  window.pages.settings=function(){const html=baseSettingsPage?.()||'';if(String(current?.role||'').toLowerCase()!=='admin')return html;return html+`<section class="card"><div class="section-head"><div><h3>🔐 مساعدة استعادة كلمة المرور</h3><span class="small muted">إذا لم تصل رسالة الاستعادة، يمكن للإدارة تعيين كلمة مرور مؤقتة وإبلاغ صاحب الحساب بها مباشرة.</span></div></div><form data-mk-submit="mkAdminResetAccountPassword(event)"><div class="form-grid"><label>البريد أو رقم الحساب<input id="mkResetAccountLookup" required maxlength="320" autocomplete="off"></label><label>كلمة المرور المؤقتة (8 أحرف على الأقل)<input id="mkResetAccountPassword" type="password" required minlength="8" maxlength="1024" autocomplete="new-password"></label></div><button id="mkResetAccountSubmit" class="btn primary" style="margin-top:12px">تغيير كلمة المرور وإغلاق الجلسات</button><div id="mkResetAccountMessage" class="small muted" role="status" aria-live="polite" style="margin-top:10px"></div></form><div class="notice warn" style="margin-top:12px">الاستعادة الذاتية عبر البريد تحتاج ضبط SMTP في ملف .env. لا تشارك كلمة المرور المؤقتة في المنتدى أو الرسائل العامة.</div></section>`;};
  const unrestrictedSettingsPage=window.pages.settings;
  window.pages.settings=function(){if(!admin())return '<div class="card empty">إعدادات الإدارة غير متاحة لهذا الحساب.</div>';return unrestrictedSettingsPage?.()||'';};
  window.pages.courses=function(){
    const tabs=platformTabsByRole[String(current?.role||'').toLowerCase()]||[];
    const active=tabs.some(item=>item[0]===window.mkPlatformTab)?window.mkPlatformTab:'courses';
    window.mkPlatformTab=active;
    syncPlatformHeader(tabs,active);
    const panel=active==='courses'?window.mkRenderPlatformCatalog():window.pages[active]?.()||'<div class="card empty">هذا القسم غير متاح.</div>';
    return `<div class="mk-platform-hub"><main class="mk-platform-hub-panel">${panel}</main></div>`;
  };})();
