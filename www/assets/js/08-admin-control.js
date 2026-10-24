/* School content is managed by the administration; no teacher account role is used. */
(function () {
  const isAdmin = () => String(current?.role || '').toLowerCase() === 'admin';
  const baseAssignmentsPage = window.pages.assignments;
  const baseExamsPage = window.pages.exams;
  const baseQuestionBankPage = window.pages.questionBank;
  const baseSubjectsPage = window.pages.subjects;
  const baseGradesPage = window.pages.grades;
  const schoolGrades = ['KG1','KG2','أولى ابتدائي','ثانية ابتدائي','ثالثة ابتدائي','رابعة ابتدائي','خامسة ابتدائي','سادسة ابتدائي','أولى إعدادي','ثانية إعدادي','ثالثة إعدادي','أولى ثانوي','ثانية ثانوي','ثالثة ثانوي'];
  const escape = value => window.esc(String(value ?? ''));
  const quote = value => String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n]/g, ' ');

  window.navItems = function () { return [['courses','المنصة التعليمية','🎓']]; };

  function adminSubjectOptions() {
    return (db.subjects || []).map((subject, index) => ({ subject, teacher: { id: 'admin', name: 'إدارة المنصة' }, index }));
  }

  window.pages.subjects = function () {
    if (!isAdmin()) return baseSubjectsPage?.() || window.forbidden?.();
    const rows = adminSubjectOptions();
    return `<div class="card"><div class="section-head"><div><h3>📚 المواد الدراسية</h3><span class="small muted">تدير الإدارة مواد كل سنة دراسية.</span></div><button class="btn primary" data-mk-click="mkAdminSubjectModal()">＋ إضافة مادة</button></div><div class="table-wrap"><table class="table"><thead><tr><th>المادة</th><th>الصف</th></tr></thead><tbody>${rows.map(({ subject }) => `<tr><td>${escape(subject.name)}</td><td>${escape(subject.grade)}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">لا توجد مواد مضافة بعد.</td></tr>'}</tbody></table></div></div>`;
  };
  window.mkAdminSubjectModal = function () {
    if (!isAdmin()) return window.forbidden?.();
    window.openModal(`<h3>إضافة مادة دراسية</h3><form data-mk-submit="mkAdminSubjectSave(event)"><label>اسم المادة<input id="mkAdminSubjectName" maxlength="100" required></label><label>السنة الدراسية<select id="mkAdminSubjectGrade" required>${schoolGrades.map(grade => `<option value="${escape(grade)}">${escape(grade)}</option>`).join('')}</select></label><button class="btn primary">حفظ المادة</button></form>`);
  };
  window.mkAdminSubjectSave = function (event) {
    event.preventDefault();
    if (!isAdmin()) return window.forbidden?.();
    const name = document.getElementById('mkAdminSubjectName')?.value.trim();
    const grade = document.getElementById('mkAdminSubjectGrade')?.value;
    const teacher = 'admin';
    if (!name || !grade) return window.toast?.('راجع اسم المادة والسنة الدراسية.');
    if ((db.subjects || []).some(item => String(item.grade) === String(grade) && String(item.name).toLowerCase() === name.toLowerCase())) return window.toast?.('هذه المادة مضافة بالفعل لهذه السنة الدراسية.');
    db.subjects.push({ id: uid('sub'), teacher, name, grade });
    save(); audit('admin_subject_create', `${name} — ${grade}`); closeModal(); renderPage(); window.toast?.('تمت إضافة المادة.');
  };

  window.pages.assignments = function () {
    if (!isAdmin()) return baseAssignmentsPage?.() || '<div class="card empty">قسم الواجبات غير متاح.</div>';
    const assignments = Array.isArray(db.assignments) ? db.assignments : [];
    return `<div class="card"><div class="section-head"><div><h3>📝 إدارة الواجبات</h3><span class="small muted">تنشئ الإدارة الواجبات وتتابع تسليمات الطلاب.</span></div><button class="btn primary" data-mk-click="mkAdminAssignmentModal()">＋ إنشاء واجب</button></div><div class="list">${assignments.map(item => { const submissions = (db.submissions || []).filter(submission => String(submission.assignment) === String(item.id)); return `<article class="list-item"><div class="section-head"><div><b>${escape(item.title)}</b><div class="small muted">${escape(item.subject)} • ${escape(item.grade)} • التسليم ${escape(item.due || '—')}</div></div><div class="row"><span class="chip">${submissions.length} تسليم</span><button class="btn" data-mk-click="submissions('${quote(item.id)}')">عرض التسليمات</button><button class="btn danger" data-mk-click="mkAdminAssignmentDelete('${quote(item.id)}')">حذف</button></div></div><p class="small muted">${escape(item.desc || '')}</p></article>`; }).join('') || '<div class="empty">لا توجد واجبات.</div>'}</div></div>`;
  };
  window.mkAdminAssignmentDelete = function (id) { if (!isAdmin()) return window.forbidden?.(); const assignment = (db.assignments || []).find(item => String(item.id) === String(id)); if (!assignment || !confirm(`حذف الواجب «${assignment.title}» وتسليماته؟`)) return; db.assignments = db.assignments.filter(item => String(item.id) !== String(id)); db.submissions = (db.submissions || []).filter(item => String(item.assignment) !== String(id)); save(); audit('admin_assignment_delete', assignment.title); renderPage(); };
  window.mkAdminAssignmentModal = function () {
    if (!isAdmin()) return window.forbidden?.();
    const options = adminSubjectOptions();
    if (!options.length) return window.toast?.('أضف مادة دراسية للصف المطلوب أولًا.');
    window.mkAdminAssignmentSubjects = options;
    window.openModal(`<h3>إنشاء واجب للطلاب</h3><form data-mk-submit="mkAdminAssignmentSave(event)"><label>عنوان الواجب<input id="mkAdminAssignmentTitle" maxlength="180" required></label><label>المادة والسنة الدراسية<select id="mkAdminAssignmentSubject">${options.map(({ subject, index }) => `<option value="${index}">${escape(subject.name)} — ${escape(subject.grade)}</option>`).join('')}</select></label><label>التعليمات<textarea id="mkAdminAssignmentDesc" rows="3" required></textarea></label><label>نوع الأسئلة<select id="mkAdminAssignmentType" data-mk-change="mkAdminAssignmentHint()"><option value="essay">مقالي</option><option value="multiple_choice">اختيار من متعدد</option></select></label><label>الأسئلة<textarea id="mkAdminAssignmentQuestions" rows="6" required></textarea><span id="mkAdminAssignmentQuestionHint" class="small muted">اكتب سؤالًا واحدًا في كل سطر للتصحيح اليدوي.</span></label><label id="mkAdminAssignmentRetryOption" class="list-item"><input id="mkAdminAssignmentRetry" type="checkbox" disabled> إعادة الأسئلة الخاطئة مرة واحدة ثم إظهار النتيجة والتصحيح</label><div class="form-grid"><label>موعد التسليم<input id="mkAdminAssignmentDue" type="date" required></label><label>درجة السؤال<input id="mkAdminAssignmentPoints" type="number" min="1" max="1000" value="5" required></label></div><button class="btn primary">نشر الواجب</button></form>`);
  };
  window.mkAdminAssignmentHint = function () {
    const multiple = document.getElementById('mkAdminAssignmentType')?.value === 'multiple_choice';
    const hint = document.getElementById('mkAdminAssignmentQuestionHint');
    const retry = document.getElementById('mkAdminAssignmentRetry');
    if (hint) hint.textContent = multiple ? 'كل سطر: السؤال | اختيار A | اختيار B | اختيار C | اختيار D | رقم الإجابة الصحيحة (1 إلى 4).' : 'اكتب سؤالًا واحدًا في كل سطر للتصحيح اليدوي.';
    if (retry) { retry.disabled = !multiple; if (!multiple) retry.checked = false; }
  };
  window.mkAdminAssignmentSave = function (event) {
    event.preventDefault();
    if (!isAdmin()) return window.forbidden?.();
    const selected = window.mkAdminAssignmentSubjects?.[Number(document.getElementById('mkAdminAssignmentSubject')?.value)];
    const title = document.getElementById('mkAdminAssignmentTitle')?.value.trim();
    const lines = String(document.getElementById('mkAdminAssignmentQuestions')?.value || '').split(/\n+/).map(text => text.trim()).filter(Boolean);
    const points = Number(document.getElementById('mkAdminAssignmentPoints')?.value);
    const due = document.getElementById('mkAdminAssignmentDue')?.value;
    const answerType = document.getElementById('mkAdminAssignmentType')?.value === 'multiple_choice' ? 'multiple_choice' : 'essay';
    const reviewWrongAnswers = answerType === 'multiple_choice' && !!document.getElementById('mkAdminAssignmentRetry')?.checked;
    if (!selected || !title || !lines.length || !Number.isInteger(points) || points < 1 || !due) return window.toast?.('أكمل بيانات الواجب وموعد التسليم.');
    let questions;
    if (answerType === 'multiple_choice') {
      questions = [];
      for (const [index, line] of lines.entries()) {
        const parts = line.split('|').map(value => value.trim()), rawAnswer = String(parts[5] || '').toUpperCase();
        const answerIndex = 'ABCD'.indexOf(rawAnswer) >= 0 ? 'ABCD'.indexOf(rawAnswer) : Number(rawAnswer) - 1;
        if (parts.length !== 6 || !parts[0] || parts.slice(1, 5).some(value => !value) || new Set(parts.slice(1, 5)).size !== 4 || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return window.toast?.(`راجع السؤال ${index + 1}: اكتب السؤال وأربع اختيارات ورقم الإجابة من 1 إلى 4.`);
        questions.push({ id: uid('aq'), type: 'multiple_choice', text: parts[0], options: parts.slice(1, 5), answerIndex, points, number: index + 1 });
      }
    } else questions = lines.map((text, index) => ({ id: uid('aq'), type: 'essay', text, number: index + 1, points }));
    db.assignments.push({ id: uid('a'), teacher: 'admin', teacherId: 'admin', subject: selected.subject.name, grade: selected.subject.grade, title, desc: document.getElementById('mkAdminAssignmentDesc')?.value.trim() || '', due, answerType, reviewWrongAnswers, points: points * lines.length, questionPoints: points, questions });
    save(); audit('admin_assignment_create', title); closeModal(); renderPage(); window.toast?.('تم نشر الواجب للصف المحدد.');
  };

  window.pages.exams = function () {
    if (!isAdmin()) return baseExamsPage?.() || '<div class="card empty">قسم الاختبارات غير متاح.</div>';
    const exams = Array.isArray(db.exams) ? db.exams : [];
    return `<div class="card"><div class="section-head"><div><h3>🧪 إدارة الاختبارات</h3><span class="small muted">تنشئ الإدارة الاختبارات وتحدد المادة والصف.</span></div><button class="btn primary" data-mk-click="mkAdminExamModal()">＋ إنشاء اختبار</button></div><div class="list">${exams.map(exam => { return `<article class="list-item"><div class="section-head"><div><b>${escape(exam.title)}</b><div class="small muted">${escape(exam.subject)} • ${escape(exam.grade)} • ${Number(exam.questions?.length || 0)} سؤال • ${Number(exam.duration) || 0} دقيقة</div></div><button class="btn danger" data-mk-click="mkAdminExamDelete('${quote(exam.id)}')">حذف</button></div></article>`; }).join('') || '<div class="empty">لا توجد اختبارات.</div>'}</div></div>`;
  };
  window.mkAdminExamDelete = function (id) { if (!isAdmin()) return window.forbidden?.(); const exam = (db.exams || []).find(item => String(item.id) === String(id)); if (!exam || !confirm(`حذف الاختبار «${exam.title}»؟`)) return; db.exams = db.exams.filter(item => String(item.id) !== String(id)); save(); audit('admin_exam_delete', exam.title); renderPage(); };
  window.mkAdminExamModal = function () {
    if (!isAdmin()) return window.forbidden?.();
    const options = adminSubjectOptions();
    if (!options.length) return window.toast?.('أضف مادة دراسية للصف المطلوب أولًا.');
    window.mkAdminExamSubjects = options;
    const bank = options.flatMap(({ subject }) => (db.questionBank || []).filter(question => String(question.subject) === String(subject.name) && String(question.grade) === String(subject.grade)).map(question => ({ question, subject })));
    window.openModal(`<h3>إنشاء اختبار للطلاب</h3><form data-mk-submit="mkAdminExamSave(event)"><label>عنوان الاختبار<input id="mkAdminExamTitle" maxlength="180" required></label><label>المادة والسنة الدراسية<select id="mkAdminExamSubject">${options.map(({ subject, teacher, index }) => `<option value="${index}">${escape(subject.name)} — ${escape(subject.grade)}</option>`).join('')}</select></label><div class="form-grid"><label>المدة بالدقائق<input id="mkAdminExamDuration" type="number" min="1" max="180" value="30" required></label><label>درجة السؤال<input id="mkAdminExamPoints" type="number" min="1" max="100" value="1" required></label><label>درجة النجاح %<input id="mkAdminExamPass" type="number" min="0" max="100" value="50" required></label><label>حد أسئلة تحدي الضعف<input id="mkAdminExamChallengeLimit" type="number" min="0" max="10" value="2" required><span class="small muted">عدد الأسئلة المؤهلة التي يمكن للطالب حلها دون اختيارات مقابل ضعف الدرجة.</span></label></div><label class="list-item"><input id="mkAdminExamRetry" type="checkbox"> بعد التسليم، أعد الأسئلة الخاطئة مرة واحدة ثم اعرض النتيجة والتصحيح</label><div class="field"><b>أسئلة بنك الأسئلة</b><div class="list">${bank.map(({ question, subject }) => `<label class="list-item"><input type="checkbox" name="mkAdminExamQuestion" value="${escape(question.id)}"><span>${escape(question.text || 'سؤال مصور')} — ${escape(subject.name)} (${escape(subject.grade)})${question.challengeKeywords?.length ? ' • تحدي ×2' : ''}</span></label>`).join('') || '<div class="empty">لا توجد أسئلة بنك مطابقة للمواد الموزعة.</div>'}</div></div><label>أسئلة إضافية — السؤال | A | B | C | D | رقم الإجابة (0=A إلى 3=D) | كلمات التحدي مفصولة بفاصلة<textarea id="mkAdminExamManual" rows="5" placeholder="عاصمة مصر؟ | القاهرة | الإسكندرية | الجيزة | أسوان | 0 | القاهرة، عاصمة مصر"></textarea></label><button class="btn primary">نشر الاختبار</button></form>`);
  };
  window.mkAdminExamSave = function (event) {
    event.preventDefault();
    if (!isAdmin()) return window.forbidden?.();
    const selected = window.mkAdminExamSubjects?.[Number(document.getElementById('mkAdminExamSubject')?.value)];
    const title = document.getElementById('mkAdminExamTitle')?.value.trim();
    const points = Number(document.getElementById('mkAdminExamPoints')?.value);
    const challengeLimit = Number(document.getElementById('mkAdminExamChallengeLimit')?.value);
    const questions = [...document.querySelectorAll('input[name="mkAdminExamQuestion"]:checked')].map(input => (db.questionBank || []).find(question => String(question.id) === String(input.value))).filter(question => question && String(question.subject) === String(selected?.subject.name) && String(question.grade) === String(selected?.subject.grade)).map(question => ({ text: question.text || '', imageFileId: question.imageFileId || '', options: (question.options || []).slice(0, 4), answer: Number(question.answer) || 0, points, ...(Array.isArray(question.challengeKeywords) && question.challengeKeywords.length ? { challengeKeywords: question.challengeKeywords } : {}), source: 'bank', questionId: question.id }));
    const manualLines = String(document.getElementById('mkAdminExamManual')?.value || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean), manual = [];
    for (const [index, line] of manualLines.entries()) {
      const parts = line.split('|').map(part => part.trim()), rawAnswer = String(parts[5] || '').toUpperCase();
      const answer = /^[0-3]$/.test(rawAnswer) ? Number(rawAnswer) : 'ABCD'.indexOf(rawAnswer);
      const challengeKeywords = [...new Set((parts[6] || '').split(/[،,;؛]+/).map(value => value.trim()).filter(Boolean))];
      if ((parts.length !== 6 && parts.length !== 7) || !parts[0] || parts.slice(1, 5).some(value => !value) || !Number.isInteger(answer) || answer < 0 || answer > 3 || challengeKeywords.length > 20 || challengeKeywords.some(keyword => keyword.length > 120)) return window.toast?.(`راجع السؤال اليدوي ${index + 1}: الإجابة من 0 إلى 3 أو A إلى D، وحد أقصى 20 كلمة مفتاحية.`);
      manual.push({ text: parts[0], options: parts.slice(1, 5), answer, points, ...(challengeKeywords.length ? { challengeKeywords } : {}), source: 'manual' });
    }
    questions.push(...manual);
    const duration = Number(document.getElementById('mkAdminExamDuration')?.value);
    const passPercent = Number(document.getElementById('mkAdminExamPass')?.value);
    if (!selected || !title || !questions.length || questions.length > 250 || !Number.isInteger(points) || points < 1 || !Number.isInteger(duration) || duration < 1 || duration > 180 || !Number.isFinite(passPercent) || passPercent < 0 || passPercent > 100 || !Number.isInteger(challengeLimit) || challengeLimit < 0 || challengeLimit > 10 || questions.some(question => question.challengeKeywords?.length > 20 || question.challengeKeywords?.some(keyword => keyword.length > 120))) return window.toast?.('أكمل بيانات الاختبار والأسئلة، وتأكد أن عدد الأسئلة لا يتجاوز 250 وحد تحدي الضعف من 0 إلى 10.');
    db.exams.push({ id: uid('e'), teacher: 'admin', teacherId: 'admin', subject: selected.subject.name, grade: selected.subject.grade, title, duration, passPercent, questionPoints: points, challengeLimit, reviewWrongAnswers: !!document.getElementById('mkAdminExamRetry')?.checked, questions, active: true, createdAt: new Date().toISOString() });
    save(); audit('admin_exam_create', title); closeModal(); renderPage(); window.toast?.('تم نشر الاختبار للسنة والصف المحددين.');
  };

  window.pages.questionBank = function () {
    if (!isAdmin()) return baseQuestionBankPage?.() || window.forbidden?.();
    const questions = Array.isArray(db.questionBank) ? db.questionBank : [];
    return `<div class="card"><div class="section-head"><div><h3>🧠 بنك الأسئلة — صلاحية الإدارة</h3><span class="small muted">إدارة أسئلة المنصة حسب المادة والسنة الدراسية.</span></div><button class="btn primary" data-mk-click="mkAdminQuestionModal()">＋ إضافة سؤال</button></div><input id="mkAdminQuestionSearch" type="search" placeholder="ابحث بالسؤال أو المادة أو السنة الدراسية" data-mk-input="mkAdminQuestionFilter(this.value)" style="width:100%;margin:10px 0"><div id="mkAdminQuestionList" class="quick-grid">${questions.map(question => { const haystack = `${question.text || ''} ${question.subject || ''} ${question.grade || ''}`.toLocaleLowerCase('ar'); return `<article class="quick mk-admin-question" data-search="${escape(haystack)}">${question.imageFileId ? `<img class="assignment-question-img" data-mk-file-ref="${escape(question.imageFileId)}" alt="صورة السؤال">` : ''}<b>${escape(question.text || 'سؤال مصور')}</b><span class="small muted">${escape(question.subject)} • ${escape(question.grade)}</span><div class="mcq-preview">${(question.options || []).slice(0, 4).map((option, index) => `<span><b>${String.fromCharCode(65 + index)}</b> ${escape(option)}</span>`).join('')}</div><button class="btn danger" data-mk-click="mkAdminQuestionDelete('${quote(question.id)}')">حذف السؤال</button></article>`; }).join('') || '<div class="empty">لا توجد أسئلة مسجلة.</div>'}</div></div>`;
  };
  window.mkAdminQuestionFilter = function (value) { const term = String(value || '').toLocaleLowerCase('ar'); document.querySelectorAll('.mk-admin-question').forEach(card => { card.hidden = !String(card.dataset.search || '').includes(term); }); };
  window.mkAdminQuestionDelete = function (id) { if (!isAdmin()) return window.forbidden?.(); const question = (db.questionBank || []).find(item => String(item.id) === String(id)); if (!question || !confirm('حذف هذا السؤال من بنك الأسئلة؟')) return; db.questionBank = db.questionBank.filter(item => String(item.id) !== String(id)); save(); audit('admin_question_delete', question.subject || question.id); renderPage(); };
  window.mkAdminQuestionModal = function () {
    if (!isAdmin()) return window.forbidden?.();
    const options = adminSubjectOptions();
    if (!options.length) return window.toast?.('أضف مادة دراسية أولًا.');
    window.mkAdminQuestionSubjects = options;
    window.openModal(`<h3>إضافة سؤال للمادة</h3><form data-mk-submit="mkAdminQuestionSave(event)"><label>المادة والسنة الدراسية<select id="mkAdminQuestionSubject">${options.map(({ subject, teacher, index }) => `<option value="${index}">${escape(subject.name)} — ${escape(subject.grade)}</option>`).join('')}</select></label><label>نص السؤال أو اتركه فارغًا للصورة<textarea id="mkAdminQuestionText" rows="3"></textarea></label><label>صورة السؤال<input id="mkAdminQuestionImage" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label><div class="mcq-editor">${['A', 'B', 'C', 'D'].map((letter, index) => `<div class="mcq-row"><b>${letter}</b><input id="mkAdminQuestionOption${index}" required><input type="radio" name="mkAdminQuestionAnswer" value="${index}" ${index === 0 ? 'checked' : ''} aria-label="الإجابة الصحيحة"></div>`).join('')}</div><label>كلمات مفتاحية لإجابة تحدي الضعف (اختياري)<textarea id="mkAdminQuestionKeywords" rows="2" maxlength="1000" placeholder="مثال: القاهرة، عاصمة مصر"></textarea><span class="small muted">لو أضفتها، يقدر الطالب يخفي الاختيارات ويكتب إجابته. اكتب المرادفات مفصولة بفاصلة.</span></label><button class="btn primary">حفظ السؤال</button></form>`);
  };
  window.mkAdminQuestionSave = async function (event) {
    event.preventDefault();
    if (!isAdmin()) return window.forbidden?.();
    const selected = window.mkAdminQuestionSubjects?.[Number(document.getElementById('mkAdminQuestionSubject')?.value)];
    const text = document.getElementById('mkAdminQuestionText')?.value.trim() || '';
    const file = document.getElementById('mkAdminQuestionImage')?.files?.[0];
    const options = [0, 1, 2, 3].map(index => document.getElementById(`mkAdminQuestionOption${index}`)?.value.trim() || '');
    const challengeKeywords = [...new Set((document.getElementById('mkAdminQuestionKeywords')?.value || '').split(/[\n,،;؛|]+/).map(value => value.trim()).filter(Boolean))];
    if (!selected || (!text && !file) || options.some(option => !option) || new Set(options).size !== 4) return window.toast?.('أدخل السؤال وأربع اختيارات مختلفة، أو أرفق صورة للسؤال.');
    if (challengeKeywords.length > 20 || challengeKeywords.some(keyword => keyword.length > 120)) return window.toast?.('أدخل حتى 20 كلمة أو عبارة مفتاحية، بحد أقصى 120 حرفًا لكل واحدة.');
    if (file && (file.size > 5 * 1024 * 1024 || !/^image\/(jpeg|png|webp|gif)$/.test(file.type))) return window.toast?.('الصورة يجب أن تكون JPG أو PNG أو WebP أو GIF وبحجم لا يتجاوز 5MB.');
    let imageFileId = '';
    if (file) { try { imageFileId = (await window.mkUploadSchoolFile(file, 'exam-question')).id; } catch (error) { return window.toast?.(error.message || 'تعذر رفع صورة السؤال.'); } }
    db.questionBank.push({ id: uid('q'), teacher: 'admin', subject: selected.subject.name, grade: selected.subject.grade, text, imageFileId, options, answer: Number(document.querySelector('input[name="mkAdminQuestionAnswer"]:checked')?.value || 0), ...(challengeKeywords.length ? { challengeKeywords } : {}), type: 'اختيار من متعدد' });
    save(); audit('admin_question_create', `${selected.subject.name} — ${selected.subject.grade}`); closeModal(); renderPage(); window.toast?.('تم حفظ السؤال في بنك الأسئلة.');
  };

  window.pages.grades = function () {
    if (!isAdmin()) return baseGradesPage?.() || window.forbidden?.();
    const rows = Array.isArray(db.grades) ? db.grades : [];
    return `<div class="card"><div class="section-head"><div><h3>⭐ درجات وتقييمات المنصة</h3><span class="small muted">عرض سجلات جميع الطلاب وإضافة تقييم تعليمي عند الحاجة.</span></div><button class="btn primary" data-mk-click="mkAdminGradeModal()">＋ إضافة تقييم</button></div><div class="table-wrap"><table class="table"><thead><tr><th>الطالب</th><th>المادة</th><th>التقييم</th><th>الدرجة</th><th>التاريخ</th></tr></thead><tbody>${rows.map(grade => { const student = (db.students || []).find(item => String(item.id) === String(grade.student)); return `<tr><td>${escape(student?.name || grade.student || '—')}</td><td>${escape(grade.subject || '—')}</td><td>${escape(grade.title || grade.type || 'تقييم')}</td><td>${escape(grade.score ?? 0)} / ${escape(grade.max ?? 0)}</td><td>${escape(grade.date || '—')}</td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">لا توجد تقييمات.</td></tr>'}</tbody></table></div></div>`;
  };
  window.mkAdminGradeModal = function () {
    if (!isAdmin()) return window.forbidden?.();
    const students = db.students || [], subjects = adminSubjectOptions();
    if (!students.length || !subjects.length) return window.toast?.('أضف طالبًا ومادة دراسية أولًا.');
    window.mkAdminGradeSubjects = subjects;
    window.openModal(`<h3>إضافة تقييم تعليمي</h3><form data-mk-submit="mkAdminGradeSave(event)"><label>الطالب<select id="mkAdminGradeStudent">${students.map(student => `<option value="${escape(student.id)}">${escape(student.name)} — ${escape(student.grade)}</option>`).join('')}</select></label><label>المادة والسنة الدراسية<select id="mkAdminGradeSubject">${subjects.map(({ subject, teacher, index }) => `<option value="${index}">${escape(subject.name)} — ${escape(subject.grade)}</option>`).join('')}</select></label><label>عنوان التقييم<input id="mkAdminGradeTitle" maxlength="180" required></label><div class="form-grid"><label>الدرجة<input id="mkAdminGradeScore" type="number" min="0" step="0.25" required></label><label>من<input id="mkAdminGradeMax" type="number" min="0.25" step="0.25" value="10" required></label></div><label>ملاحظة<textarea id="mkAdminGradeComment" rows="2"></textarea></label><button class="btn primary">حفظ التقييم</button></form>`);
  };
  window.mkAdminGradeSave = function (event) {
    event.preventDefault(); if (!isAdmin()) return window.forbidden?.();
    const student = (db.students || []).find(item => String(item.id) === String(document.getElementById('mkAdminGradeStudent')?.value));
    const selected = window.mkAdminGradeSubjects?.[Number(document.getElementById('mkAdminGradeSubject')?.value)];
    const score = Number(document.getElementById('mkAdminGradeScore')?.value), max = Number(document.getElementById('mkAdminGradeMax')?.value), title = document.getElementById('mkAdminGradeTitle')?.value.trim();
    if (!student || !selected || String(student.grade) !== String(selected.subject.grade) || !title || !Number.isFinite(score) || !Number.isFinite(max) || max <= 0 || score < 0 || score > max) return window.toast?.('تأكد من تطابق صف الطالب مع المادة ومن صحة الدرجة.');
    db.grades.push({ id: uid('g'), student: String(student.id), teacher: 'admin', subject: selected.subject.name, grade: selected.subject.grade, title, type: 'تقييم تعليمي', score, max, comment: document.getElementById('mkAdminGradeComment')?.value.trim() || '', date: new Date().toISOString().slice(0, 10) });
    save(); audit('admin_grade_create', `${student.name} — ${title}`); closeModal(); renderPage(); window.toast?.('تم حفظ التقييم للطالب.');
  };

  function adminStudents() {
    return (Array.isArray(db.students) ? db.students : []).filter(student => student && String(student.id || '').trim());
  }
  function adminVideoOptions() {
    const videos = new Map();
    for (const course of Array.isArray(db.courses) ? db.courses : []) {
      for (const [index, lesson] of (Array.isArray(course.lessons) ? course.lessons : []).entries()) {
        const ref = String(lesson?.videoRef || lesson?.videoUrl || '').trim();
        let id = '';
        if (ref.startsWith('hls:video-engine:')) id = ref.slice('hls:video-engine:'.length).split('|')[0].replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 255);
        else if (/^https?:\/\//i.test(ref)) id = `external_${String(lesson?.id || `${course.id}_${index}`).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 240)}`;
        if (id) videos.set(id, `${course.title || 'دورة'} — ${lesson.title || `الدرس ${index + 1}`}`);
      }
    }
    return [...videos.entries()];
  }
  async function adminApi(path, body) {
    const base = window.mkVideoEngineUrl?.('') || '';
    const token = typeof mkRuntimeGetItem === 'function' ? mkRuntimeGetItem('mk_video_jwt') : '';
    if (!isAdmin() || !base || !token) throw new Error('سجّل دخول الإدارة وتأكد من اتصال خادم المنصة.');
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body), cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || 'تعذر تنفيذ العملية على الخادم.');
    return data;
  }

  window.mkAdminCourseEnrollmentDialog = function () {
    if (!isAdmin()) return window.forbidden?.();
    const students = adminStudents(), courses = (Array.isArray(db.courses) ? db.courses : []).filter(course => course.active !== false);
    if (!students.length || !courses.length) return window.toast?.('أضف طالبًا ودورة منشورة أولًا.');
    window.openModal(`<div class="section-head"><div><h3>إدارة التحاق الطلاب</h3><span class="small muted">فتح الدورة يتجاوز طلب الدفع لهذا الطالب فقط. إلغاء الدورة يوقف وصوله للمحتوى والاختبارات.</span></div><button class="btn" type="button" data-mk-click="closeModal()">إغلاق</button></div><form data-mk-submit="mkAdminCourseEnrollmentSave(event)"><label>الطالب<select id="mkAdminEnrollStudent" required>${students.map(student => `<option value="${escape(student.id)}">${escape(student.name || student.id)} — ${escape(student.grade || 'طالب')}</option>`).join('')}</select></label><label>الدورة<select id="mkAdminEnrollCourse" required>${courses.map(course => `<option value="${escape(course.id)}">${escape(course.title || course.id)}${course.type === 'paid' ? ' — مدفوعة' : ' — مجانية'}</option>`).join('')}</select></label><label>الإجراء<select id="mkAdminEnrollAction"><option value="grant">فتح الدورة للطالب</option><option value="revoke">إلغاء وصول الطالب للدورة</option></select></label><button class="btn primary" style="width:100%;margin-top:12px">تأكيد وتطبيق</button></form><div class="notice warn" style="margin-top:12px">كل تغيير يُسجّل في سجل الإدارة ويطبّقه الخادم على فيديوهات الدورة.</div>`);
  };
  window.mkAdminCourseEnrollmentSave = async function (event) {
    event.preventDefault(); if (!isAdmin()) return window.forbidden?.();
    const studentId = document.getElementById('mkAdminEnrollStudent')?.value || '', courseId = document.getElementById('mkAdminEnrollCourse')?.value || '', action = document.getElementById('mkAdminEnrollAction')?.value || '';
    const student = adminStudents().find(item => String(item.id) === String(studentId)), course = (db.courses || []).find(item => String(item.id) === String(courseId));
    if (!student || !course || !['grant','revoke'].includes(action)) return window.toast?.('اختر طالبًا ودورة صالحين.');
    if (action === 'revoke' && !window.confirm(`إلغاء وصول ${student.name || student.id} إلى «${course.title}»؟`)) return;
    try {
      const result = await adminApi('/api/v1/admin/courses/enrollment', { student_id: studentId, course_id: courseId, action });
      await window.mkBackendPullPlatform?.(true);
      window.closeModal(); window.renderPage();
      window.toast?.(action === 'grant' ? 'تم فتح الدورة للطالب.' : 'تم إلغاء وصول الطالب للدورة.');
      return result;
    } catch (error) { window.toast?.(error.message || 'تعذر تحديث صلاحية الدورة.'); }
  };

  window.mkAdminVideoViewsDialog = function () {
    if (!isAdmin()) return window.forbidden?.();
    const students = adminStudents(), videos = adminVideoOptions();
    if (!students.length || !videos.length) return window.toast?.('لا توجد فيديوهات دورات صالحة لإضافة مشاهدات لها.');
    window.openModal(`<div class="section-head"><div><h3>إضافة مشاهدات لطالب</h3><span class="small muted">تُضاف المشاهدات إلى حد الطالب لهذا الفيديو فقط ولا تفتح الدورة تلقائيًا.</span></div><button class="btn" type="button" data-mk-click="closeModal()">إغلاق</button></div><form data-mk-submit="mkAdminGrantVideoViews(event)"><label>الطالب<select id="mkAdminViewStudent" required>${students.map(student => `<option value="${escape(student.id)}">${escape(student.name || student.id)} — ${escape(student.grade || 'طالب')}</option>`).join('')}</select></label><label>الفيديو<select id="mkAdminViewVideo" required>${videos.map(([id, title]) => `<option value="${escape(id)}">${escape(title)}</option>`).join('')}</select></label><label>عدد المشاهدات الإضافية<input id="mkAdminExtraViews" type="number" min="1" max="50" value="1" required></label><button class="btn primary" style="width:100%;margin-top:12px">إضافة المشاهدات</button></form><div class="small muted" style="margin-top:10px">الحد الإداري لكل عملية 50 مشاهدة، وبحد أقصى تراكمي 500 مشاهدة إضافية لكل طالب وفيديو.</div>`);
  };
  window.mkAdminGrantVideoViews = async function (event) {
    event.preventDefault(); if (!isAdmin()) return window.forbidden?.();
    const studentId = document.getElementById('mkAdminViewStudent')?.value || '', videoId = document.getElementById('mkAdminViewVideo')?.value || '', additionalViews = Number(document.getElementById('mkAdminExtraViews')?.value);
    if (!adminStudents().some(item => String(item.id) === String(studentId)) || !adminVideoOptions().some(([id]) => id === videoId) || !Number.isSafeInteger(additionalViews) || additionalViews < 1 || additionalViews > 50) return window.toast?.('راجع بيانات الطالب والفيديو وعدد المشاهدات.');
    try {
      const data = await adminApi('/api/v1/admin/video/grant-views', { student_id: studentId, video_id: videoId, additional_views: additionalViews });
      window.closeModal(); window.toast?.(`تمت إضافة ${data.additional_views} مشاهدة لهذا الطالب والفيديو.`);
    } catch (error) { window.toast?.(error.message || 'تعذر إضافة المشاهدات.'); }
  };

  window.mkAdminReprocessVideoDialog = function () {
    if (!isAdmin()) return window.forbidden?.();
    const courses = (Array.isArray(db.courses) ? db.courses : []).filter(course => Array.isArray(course.videoJobs) && course.videoJobs.length);
    window.openModal(`<div class="section-head"><div><h3>إعادة معالجة الفيديو</h3><span class="small muted">إعادة محاولة الفيديوهات التي فشلت وما زال ملفها الأصلي محفوظًا على الخادم.</span></div><button class="btn" type="button" data-mk-click="closeModal()">إغلاق</button></div><div class="list">${courses.map(course => `<article class="list-item"><div><b>${escape(course.title || 'دورة')}</b><div class="small muted">${escape(course.videoError || course.videoProcessingMessage || 'تجهيز الفيديو قيد المتابعة')}</div></div><button class="btn primary" data-mk-click="mkAdminReprocessVideo('${quote(course.id)}')">إعادة المعالجة</button></article>`).join('') || '<div class="empty">لا توجد عمليات فاشلة قابلة لإعادة المحاولة. إذا اكتملت المعالجة وحُذف الملف الأصلي، ارفع نسخة الفيديو من جديد.</div>'}</div>`);
  };
  window.mkAdminReprocessVideo = async function (courseId) {
    if (!isAdmin()) return window.forbidden?.();
    const course = (Array.isArray(db.courses) ? db.courses : []).find(item => String(item.id) === String(courseId));
    if (!course || !Array.isArray(course.videoJobs) || !course.videoJobs.length) return window.toast?.('لا توجد مهمة معالجة مرتبطة بهذه الدورة.');
    window.closeModal();
    await window.mkRetryCourseProcessing?.(course);
  };
})();
