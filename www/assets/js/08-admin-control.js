/* Administrator-wide access to school tools, with ownership retained for teacher content. */
(function () {
  const isAdmin = () => String(current?.role || '').toLowerCase() === 'admin' || String(current?.id || '') === 'admin';
  const baseNavItems = window.navItems;
  const baseAssignmentsPage = window.pages.assignments;
  const baseExamsPage = window.pages.exams;
  const baseQuestionBankPage = window.pages.questionBank;
  const baseSubjectsPage = window.pages.subjects;
  const baseGradesPage = window.pages.grades;
  const schoolGrades = ['KG1','KG2','أولى ابتدائي','ثانية ابتدائي','ثالثة ابتدائي','رابعة ابتدائي','خامسة ابتدائي','سادسة ابتدائي','أولى إعدادي','ثانية إعدادي','ثالثة إعدادي','أولى ثانوي','ثانية ثانوي','ثالثة ثانوي'];
  const escape = value => window.esc(String(value ?? ''));
  const quote = value => String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n]/g, ' ');

  window.navItems = function () {
    const items = typeof baseNavItems === 'function' ? baseNavItems() : [];
    if (isAdmin() && !items.some(item => item[0] === 'subjects')) items.push(['subjects', 'إدارة المواد', '📚']);
    return items;
  };

  function adminSubjectOptions() {
    return (db.subjects || []).map((subject, index) => {
      const teacher = (db.teachers || []).find(item => String(item.id) === String(subject.teacher));
      return { subject, teacher, index };
    }).filter(item => item.teacher);
  }

  window.pages.subjects = function () {
    if (!isAdmin()) return baseSubjectsPage?.() || window.forbidden?.();
    const rows = adminSubjectOptions();
    return `<div class="card"><div class="section-head"><div><h3>📚 إدارة المواد وتوزيعها</h3><span class="small muted">الأدمن يضيف المواد ويربطها بالمدرس والصف المناسب.</span></div><button class="btn primary" data-mk-click="mkAdminSubjectModal()">＋ إضافة مادة</button></div><div class="table-wrap"><table class="table"><thead><tr><th>المادة</th><th>الصف</th><th>المدرس</th></tr></thead><tbody>${rows.map(({ subject, teacher }) => `<tr><td>${escape(subject.name)}</td><td>${escape(subject.grade)}</td><td>${escape(teacher.name || teacher.email || teacher.id)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">لا توجد مواد موزعة بعد.</td></tr>'}</tbody></table></div></div>`;
  };
  window.mkAdminSubjectModal = function () {
    if (!isAdmin()) return window.forbidden?.();
    const teachers = db.teachers || [];
    if (!teachers.length) return window.toast?.('أضف حساب مدرس أولًا حتى تربط المادة به.');
    window.openModal(`<h3>إضافة مادة وتعيين مدرس</h3><form data-mk-submit="mkAdminSubjectSave(event)"><label>اسم المادة<input id="mkAdminSubjectName" maxlength="100" required></label><div class="form-grid"><label>الصف<select id="mkAdminSubjectGrade" required>${schoolGrades.map(grade => `<option value="${escape(grade)}">${escape(grade)}</option>`).join('')}</select></label><label>المدرس<select id="mkAdminSubjectTeacher" required>${teachers.map(teacher => `<option value="${escape(teacher.id)}">${escape(teacher.name || teacher.email || teacher.id)}</option>`).join('')}</select></label></div><button class="btn primary">حفظ المادة</button></form>`);
  };
  window.mkAdminSubjectSave = function (event) {
    event.preventDefault();
    if (!isAdmin()) return window.forbidden?.();
    const name = document.getElementById('mkAdminSubjectName')?.value.trim();
    const grade = document.getElementById('mkAdminSubjectGrade')?.value;
    const teacher = document.getElementById('mkAdminSubjectTeacher')?.value;
    if (!name || !grade || !(db.teachers || []).some(item => String(item.id) === String(teacher))) return window.toast?.('راجع اسم المادة والصف والمدرس.');
    if ((db.subjects || []).some(item => String(item.teacher) === String(teacher) && String(item.grade) === String(grade) && String(item.name).toLowerCase() === name.toLowerCase())) return window.toast?.('هذه المادة مضافة بالفعل لهذا المدرس والصف.');
    db.subjects.push({ id: uid('sub'), teacher, name, grade });
    save(); audit('admin_subject_create', `${name} — ${grade}`); closeModal(); renderPage(); window.toast?.('تمت إضافة المادة وتعيين المدرس.');
  };

  window.pages.assignments = function () {
    if (!isAdmin()) return baseAssignmentsPage?.() || '<div class="card empty">قسم الواجبات غير متاح.</div>';
    const assignments = Array.isArray(db.assignments) ? db.assignments : [];
    return `<div class="card"><div class="section-head"><div><h3>📝 إدارة الواجبات</h3><span class="small muted">عرض كل الواجبات وتسليمات الطلاب، مع نشر واجب لأي مدرس.</span></div><button class="btn primary" data-mk-click="mkAdminAssignmentModal()">＋ إنشاء واجب</button></div><div class="list">${assignments.map(item => { const teacher = (db.teachers || []).find(user => String(user.id) === String(item.teacher)); const submissions = (db.submissions || []).filter(submission => String(submission.assignment) === String(item.id)); return `<article class="list-item"><div class="section-head"><div><b>${escape(item.title)}</b><div class="small muted">${escape(item.subject)} • ${escape(item.grade)} • ${escape(teacher?.name || 'مدرس غير محدد')} • التسليم ${escape(item.due || '—')}</div></div><div class="row"><span class="chip">${submissions.length} تسليم</span><button class="btn" data-mk-click="submissions('${quote(item.id)}')">عرض التسليمات</button><button class="btn danger" data-mk-click="mkAdminAssignmentDelete('${quote(item.id)}')">حذف</button></div></div><p class="small muted">${escape(item.desc || '')}</p></article>`; }).join('') || '<div class="empty">لا توجد واجبات.</div>'}</div></div>`;
  };
  window.mkAdminAssignmentDelete = function (id) { if (!isAdmin()) return window.forbidden?.(); const assignment = (db.assignments || []).find(item => String(item.id) === String(id)); if (!assignment || !confirm(`حذف الواجب «${assignment.title}» وتسليماته؟`)) return; db.assignments = db.assignments.filter(item => String(item.id) !== String(id)); db.submissions = (db.submissions || []).filter(item => String(item.assignment) !== String(id)); save(); audit('admin_assignment_delete', assignment.title); renderPage(); };
  window.mkAdminAssignmentModal = function () {
    if (!isAdmin()) return window.forbidden?.();
    const options = adminSubjectOptions();
    if (!options.length) return window.toast?.('أضف مدرسًا واربط به مادة وصفًا قبل إنشاء الواجب.');
    window.mkAdminAssignmentSubjects = options;
    window.openModal(`<h3>إنشاء واجب وتعيينه لمدرس</h3><form data-mk-submit="mkAdminAssignmentSave(event)"><label>عنوان الواجب<input id="mkAdminAssignmentTitle" maxlength="180" required></label><label>المدرس والمادة والصف<select id="mkAdminAssignmentSubject">${options.map(({ subject, teacher, index }) => `<option value="${index}">${escape(teacher.name || teacher.id)} — ${escape(subject.name)} — ${escape(subject.grade)}</option>`).join('')}</select></label><label>التعليمات<textarea id="mkAdminAssignmentDesc" rows="3" required></textarea></label><label>الأسئلة — سؤال في كل سطر<textarea id="mkAdminAssignmentQuestions" rows="6" required></textarea></label><div class="form-grid"><label>موعد التسليم<input id="mkAdminAssignmentDue" type="date" required></label><label>درجة السؤال<input id="mkAdminAssignmentPoints" type="number" min="1" max="1000" value="5" required></label></div><button class="btn primary">نشر الواجب</button></form>`);
  };
  window.mkAdminAssignmentSave = function (event) {
    event.preventDefault();
    if (!isAdmin()) return window.forbidden?.();
    const selected = window.mkAdminAssignmentSubjects?.[Number(document.getElementById('mkAdminAssignmentSubject')?.value)];
    const title = document.getElementById('mkAdminAssignmentTitle')?.value.trim();
    const lines = String(document.getElementById('mkAdminAssignmentQuestions')?.value || '').split(/\n+/).map(text => text.trim()).filter(Boolean);
    const points = Number(document.getElementById('mkAdminAssignmentPoints')?.value);
    const due = document.getElementById('mkAdminAssignmentDue')?.value;
    if (!selected || !title || !lines.length || !Number.isInteger(points) || points < 1 || !due) return window.toast?.('أكمل بيانات الواجب وحدد مدرسًا وموعدًا صحيحًا.');
    db.assignments.push({ id: uid('a'), teacher: String(selected.subject.teacher), teacherId: String(selected.subject.teacher), subject: selected.subject.name, grade: selected.subject.grade, title, desc: document.getElementById('mkAdminAssignmentDesc')?.value.trim() || '', due, points: points * lines.length, questionPoints: points, questions: lines.map((text, index) => ({ id: uid('aq'), text, number: index + 1 })) });
    save(); audit('admin_assignment_create', title); closeModal(); renderPage(); window.toast?.('تم نشر الواجب للمدرس والصف المحددين.');
  };

  window.pages.exams = function () {
    if (!isAdmin()) return baseExamsPage?.() || '<div class="card empty">قسم الاختبارات غير متاح.</div>';
    const exams = Array.isArray(db.exams) ? db.exams : [];
    return `<div class="card"><div class="section-head"><div><h3>🧪 إدارة الاختبارات</h3><span class="small muted">مشاهدة كل الاختبارات ونشر اختبار للمدرس والصف المحددين.</span></div><button class="btn primary" data-mk-click="mkAdminExamModal()">＋ إنشاء اختبار</button></div><div class="list">${exams.map(exam => { const teacher = (db.teachers || []).find(user => String(user.id) === String(exam.teacher)); return `<article class="list-item"><div class="section-head"><div><b>${escape(exam.title)}</b><div class="small muted">${escape(exam.subject)} • ${escape(exam.grade)} • ${escape(teacher?.name || 'مدرس غير محدد')} • ${Number(exam.questions?.length || 0)} سؤال • ${Number(exam.duration) || 0} دقيقة</div></div><button class="btn danger" data-mk-click="mkAdminExamDelete('${quote(exam.id)}')">حذف</button></div></article>`; }).join('') || '<div class="empty">لا توجد اختبارات.</div>'}</div></div>`;
  };
  window.mkAdminExamDelete = function (id) { if (!isAdmin()) return window.forbidden?.(); const exam = (db.exams || []).find(item => String(item.id) === String(id)); if (!exam || !confirm(`حذف الاختبار «${exam.title}»؟`)) return; db.exams = db.exams.filter(item => String(item.id) !== String(id)); save(); audit('admin_exam_delete', exam.title); renderPage(); };
  window.mkAdminExamModal = function () {
    if (!isAdmin()) return window.forbidden?.();
    const options = adminSubjectOptions();
    if (!options.length) return window.toast?.('أضف مدرسًا واربط به مادة وصفًا قبل إنشاء الاختبار.');
    window.mkAdminExamSubjects = options;
    const bank = options.flatMap(({ subject }) => (db.questionBank || []).filter(question => String(question.subject) === String(subject.name) && String(question.grade) === String(subject.grade)).map(question => ({ question, subject })));
    window.openModal(`<h3>إنشاء اختبار وتعيينه لمدرس</h3><form data-mk-submit="mkAdminExamSave(event)"><label>عنوان الاختبار<input id="mkAdminExamTitle" maxlength="180" required></label><label>المدرس والمادة والصف<select id="mkAdminExamSubject">${options.map(({ subject, teacher, index }) => `<option value="${index}">${escape(teacher.name || teacher.id)} — ${escape(subject.name)} — ${escape(subject.grade)}</option>`).join('')}</select></label><div class="form-grid"><label>المدة بالدقائق<input id="mkAdminExamDuration" type="number" min="1" max="180" value="30" required></label><label>درجة السؤال<input id="mkAdminExamPoints" type="number" min="1" max="100" value="1" required></label><label>درجة النجاح %<input id="mkAdminExamPass" type="number" min="0" max="100" value="50" required></label></div><div class="field"><b>أسئلة بنك الأسئلة</b><div class="list">${bank.map(({ question, subject }) => `<label class="list-item"><input type="checkbox" name="mkAdminExamQuestion" value="${escape(question.id)}"><span>${escape(question.text || 'سؤال مصور')} — ${escape(subject.name)} (${escape(subject.grade)})</span></label>`).join('') || '<div class="empty">لا توجد أسئلة بنك مطابقة للمواد الموزعة.</div>'}</div></div><label>أسئلة إضافية — السؤال | A | B | C | D | رقم الإجابة الصحيحة<textarea id="mkAdminExamManual" rows="5" placeholder="عاصمة مصر؟ | القاهرة | الإسكندرية | الجيزة | أسوان | 0"></textarea></label><button class="btn primary">نشر الاختبار</button></form>`);
  };
  window.mkAdminExamSave = function (event) {
    event.preventDefault();
    if (!isAdmin()) return window.forbidden?.();
    const selected = window.mkAdminExamSubjects?.[Number(document.getElementById('mkAdminExamSubject')?.value)];
    const title = document.getElementById('mkAdminExamTitle')?.value.trim();
    const points = Number(document.getElementById('mkAdminExamPoints')?.value);
    const questions = [...document.querySelectorAll('input[name="mkAdminExamQuestion"]:checked')].map(input => (db.questionBank || []).find(question => String(question.id) === String(input.value))).filter(question => question && String(question.subject) === String(selected?.subject.name) && String(question.grade) === String(selected?.subject.grade)).map(question => ({ text: question.text || '', imageFileId: question.imageFileId || '', options: (question.options || []).slice(0, 4), answer: Number(question.answer) || 0, points, source: 'bank', questionId: question.id }));
    const manual = String(document.getElementById('mkAdminExamManual')?.value || '').split(/\n+/).map(line => line.split('|').map(part => part.trim())).filter(parts => parts.length >= 6 && parts[0] && parts.slice(1, 5).every(Boolean)).map(parts => ({ text: parts[0], options: parts.slice(1, 5), answer: Math.max(0, Math.min(3, Number(parts[5]) || 0)), points, source: 'manual' }));
    questions.push(...manual);
    const duration = Number(document.getElementById('mkAdminExamDuration')?.value);
    const passPercent = Number(document.getElementById('mkAdminExamPass')?.value);
    if (!selected || !title || !questions.length || !Number.isInteger(points) || points < 1 || !Number.isInteger(duration) || duration < 1 || duration > 180 || !Number.isFinite(passPercent) || passPercent < 0 || passPercent > 100) return window.toast?.('أكمل بيانات الاختبار وأضف سؤالًا واحدًا على الأقل.');
    db.exams.push({ id: uid('e'), teacher: String(selected.subject.teacher), teacherId: String(selected.subject.teacher), subject: selected.subject.name, grade: selected.subject.grade, title, duration, passPercent, questionPoints: points, questions, active: true, createdAt: new Date().toISOString() });
    save(); audit('admin_exam_create', title); closeModal(); renderPage(); window.toast?.('تم نشر الاختبار للمدرس والصف المحددين.');
  };

  window.pages.questionBank = function () {
    if (!isAdmin()) return baseQuestionBankPage?.() || window.forbidden?.();
    const questions = Array.isArray(db.questionBank) ? db.questionBank : [];
    return `<div class="card"><div class="section-head"><div><h3>🧠 بنك الأسئلة — صلاحية الإدارة</h3><span class="small muted">عرض أسئلة جميع المدرسين والصفوف وإضافة سؤال باسم مدرس محدد.</span></div><button class="btn primary" data-mk-click="mkAdminQuestionModal()">＋ إضافة سؤال</button></div><input id="mkAdminQuestionSearch" type="search" placeholder="ابحث بالسؤال أو المادة أو المدرس" data-mk-input="mkAdminQuestionFilter(this.value)" style="width:100%;margin:10px 0"><div id="mkAdminQuestionList" class="quick-grid">${questions.map(question => { const teacher = (db.teachers || []).find(item => String(item.id) === String(question.teacher)); const haystack = `${question.text || ''} ${question.subject || ''} ${question.grade || ''} ${teacher?.name || ''}`.toLocaleLowerCase('ar'); return `<article class="quick mk-admin-question" data-search="${escape(haystack)}">${question.imageFileId ? `<img class="assignment-question-img" data-mk-file-ref="${escape(question.imageFileId)}" alt="صورة السؤال">` : ''}<b>${escape(question.text || 'سؤال مصور')}</b><span class="small muted">${escape(question.subject)} • ${escape(question.grade)} • ${escape(teacher?.name || 'مدرس غير محدد')}</span><div class="mcq-preview">${(question.options || []).slice(0, 4).map((option, index) => `<span><b>${String.fromCharCode(65 + index)}</b> ${escape(option)}</span>`).join('')}</div><button class="btn danger" data-mk-click="mkAdminQuestionDelete('${quote(question.id)}')">حذف السؤال</button></article>`; }).join('') || '<div class="empty">لا توجد أسئلة مسجلة.</div>'}</div></div>`;
  };
  window.mkAdminQuestionFilter = function (value) { const term = String(value || '').toLocaleLowerCase('ar'); document.querySelectorAll('.mk-admin-question').forEach(card => { card.hidden = !String(card.dataset.search || '').includes(term); }); };
  window.mkAdminQuestionDelete = function (id) { if (!isAdmin()) return window.forbidden?.(); const question = (db.questionBank || []).find(item => String(item.id) === String(id)); if (!question || !confirm('حذف هذا السؤال من بنك الأسئلة؟')) return; db.questionBank = db.questionBank.filter(item => String(item.id) !== String(id)); save(); audit('admin_question_delete', question.subject || question.id); renderPage(); };
  window.mkAdminQuestionModal = function () {
    if (!isAdmin()) return window.forbidden?.();
    const options = adminSubjectOptions();
    if (!options.length) return window.toast?.('أضف مدرسًا ومادة وصفًا أولًا.');
    window.mkAdminQuestionSubjects = options;
    window.openModal(`<h3>إضافة سؤال للمدرس</h3><form data-mk-submit="mkAdminQuestionSave(event)"><label>المادة والصف والمدرس<select id="mkAdminQuestionSubject">${options.map(({ subject, teacher, index }) => `<option value="${index}">${escape(teacher.name || teacher.id)} — ${escape(subject.name)} — ${escape(subject.grade)}</option>`).join('')}</select></label><label>نص السؤال أو اتركه فارغًا للصورة<textarea id="mkAdminQuestionText" rows="3"></textarea></label><label>صورة السؤال<input id="mkAdminQuestionImage" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label><div class="mcq-editor">${['A', 'B', 'C', 'D'].map((letter, index) => `<div class="mcq-row"><b>${letter}</b><input id="mkAdminQuestionOption${index}" required><input type="radio" name="mkAdminQuestionAnswer" value="${index}" ${index === 0 ? 'checked' : ''} aria-label="الإجابة الصحيحة"></div>`).join('')}</div><button class="btn primary">حفظ السؤال</button></form>`);
  };
  window.mkAdminQuestionSave = async function (event) {
    event.preventDefault();
    if (!isAdmin()) return window.forbidden?.();
    const selected = window.mkAdminQuestionSubjects?.[Number(document.getElementById('mkAdminQuestionSubject')?.value)];
    const text = document.getElementById('mkAdminQuestionText')?.value.trim() || '';
    const file = document.getElementById('mkAdminQuestionImage')?.files?.[0];
    const options = [0, 1, 2, 3].map(index => document.getElementById(`mkAdminQuestionOption${index}`)?.value.trim() || '');
    if (!selected || (!text && !file) || options.some(option => !option) || new Set(options).size !== 4) return window.toast?.('أدخل السؤال وأربع اختيارات مختلفة، أو أرفق صورة للسؤال.');
    if (file && (file.size > 5 * 1024 * 1024 || !/^image\/(jpeg|png|webp|gif)$/.test(file.type))) return window.toast?.('الصورة يجب أن تكون JPG أو PNG أو WebP أو GIF وبحجم لا يتجاوز 5MB.');
    let imageFileId = '';
    if (file) { try { imageFileId = (await window.mkUploadSchoolFile(file, 'exam-question')).id; } catch (error) { return window.toast?.(error.message || 'تعذر رفع صورة السؤال.'); } }
    db.questionBank.push({ id: uid('q'), teacher: String(selected.subject.teacher), subject: selected.subject.name, grade: selected.subject.grade, text, imageFileId, options, answer: Number(document.querySelector('input[name="mkAdminQuestionAnswer"]:checked')?.value || 0), type: 'اختيار من متعدد' });
    save(); audit('admin_question_create', `${selected.subject.name} — ${selected.subject.grade}`); closeModal(); renderPage(); window.toast?.('تم حفظ السؤال في بنك المدرس المحدد.');
  };

  window.pages.grades = function () {
    if (!isAdmin()) return baseGradesPage?.() || window.forbidden?.();
    const rows = Array.isArray(db.grades) ? db.grades : [];
    return `<div class="card"><div class="section-head"><div><h3>⭐ درجات وتقييمات المدرسة</h3><span class="small muted">عرض سجلات جميع الطلاب وإضافة تقييم إداري عند الحاجة.</span></div><button class="btn primary" data-mk-click="mkAdminGradeModal()">＋ إضافة تقييم</button></div><div class="table-wrap"><table class="table"><thead><tr><th>الطالب</th><th>المادة</th><th>التقييم</th><th>الدرجة</th><th>التاريخ</th></tr></thead><tbody>${rows.map(grade => { const student = (db.students || []).find(item => String(item.id) === String(grade.student)); return `<tr><td>${escape(student?.name || grade.student || '—')}</td><td>${escape(grade.subject || '—')}</td><td>${escape(grade.title || grade.type || 'تقييم')}</td><td>${escape(grade.score ?? 0)} / ${escape(grade.max ?? 0)}</td><td>${escape(grade.date || '—')}</td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">لا توجد تقييمات.</td></tr>'}</tbody></table></div></div>`;
  };
  window.mkAdminGradeModal = function () {
    if (!isAdmin()) return window.forbidden?.();
    const students = db.students || [], subjects = adminSubjectOptions();
    if (!students.length || !subjects.length) return window.toast?.('أضف طالبًا ومدرسًا واربط المادة أولًا.');
    window.mkAdminGradeSubjects = subjects;
    window.openModal(`<h3>إضافة تقييم إداري</h3><form data-mk-submit="mkAdminGradeSave(event)"><label>الطالب<select id="mkAdminGradeStudent">${students.map(student => `<option value="${escape(student.id)}">${escape(student.name)} — ${escape(student.grade)}</option>`).join('')}</select></label><label>المادة والمدرس والصف<select id="mkAdminGradeSubject">${subjects.map(({ subject, teacher, index }) => `<option value="${index}">${escape(teacher.name || teacher.id)} — ${escape(subject.name)} — ${escape(subject.grade)}</option>`).join('')}</select></label><label>عنوان التقييم<input id="mkAdminGradeTitle" maxlength="180" required></label><div class="form-grid"><label>الدرجة<input id="mkAdminGradeScore" type="number" min="0" step="0.25" required></label><label>من<input id="mkAdminGradeMax" type="number" min="0.25" step="0.25" value="10" required></label></div><label>ملاحظة<textarea id="mkAdminGradeComment" rows="2"></textarea></label><button class="btn primary">حفظ التقييم</button></form>`);
  };
  window.mkAdminGradeSave = function (event) {
    event.preventDefault(); if (!isAdmin()) return window.forbidden?.();
    const student = (db.students || []).find(item => String(item.id) === String(document.getElementById('mkAdminGradeStudent')?.value));
    const selected = window.mkAdminGradeSubjects?.[Number(document.getElementById('mkAdminGradeSubject')?.value)];
    const score = Number(document.getElementById('mkAdminGradeScore')?.value), max = Number(document.getElementById('mkAdminGradeMax')?.value), title = document.getElementById('mkAdminGradeTitle')?.value.trim();
    if (!student || !selected || String(student.grade) !== String(selected.subject.grade) || !title || !Number.isFinite(score) || !Number.isFinite(max) || max <= 0 || score < 0 || score > max) return window.toast?.('تأكد من تطابق صف الطالب مع المادة ومن صحة الدرجة.');
    db.grades.push({ id: uid('g'), student: String(student.id), teacher: String(selected.subject.teacher), subject: selected.subject.name, grade: selected.subject.grade, title, type: 'تقييم إداري', score, max, comment: document.getElementById('mkAdminGradeComment')?.value.trim() || '', date: new Date().toISOString().slice(0, 10) });
    save(); audit('admin_grade_create', `${student.name} — ${title}`); closeModal(); renderPage(); window.toast?.('تم حفظ التقييم للطالب.');
  };
})();
