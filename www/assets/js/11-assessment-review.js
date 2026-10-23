(() => {
  const isStudent = () => current?.role === 'student';
  const backendReady = () => !!(window.mkVideoEngineConfigured?.() && mkRuntimeGetItem('mk_video_jwt'));
  const byStudent = (id) => (db.submissions || []).find(item => String(item.assignment) === String(id) && String(item.student) === String(current?.id));
  const esc = value => window.esc(String(value ?? ''));

  const originalRenderPage = window.renderPage;
  window.renderPage = function () {
    const catalogSearch = document.querySelector('.mk-platform-top-search');
    if (catalogSearch) {
      catalogSearch.hidden = current?.role === 'parent';
      if (catalogSearch.hidden) catalogSearch.style.display = 'none';
      else catalogSearch.style.removeProperty('display');
    }
    return originalRenderPage?.();
  };

  window.submitAssignment = function (id) {
    if (!isStudent()) return window.forbidden?.();
    const assignment = (db.assignments || []).find(item => String(item.id) === String(id));
    if (!assignment) return window.toast?.('الواجب غير موجود');
    const prior = byStudent(id), retry = prior?.status === 'retry_required';
    if (prior && !retry) return window.viewSubmission(id);
    const questions = Array.isArray(assignment.questions) ? assignment.questions : [];
    const multipleChoice = assignment.answerType === 'multiple_choice' || assignment.answerType === 'mcq';
    if (!questions.length) return window.toast?.('هذا الواجب لا يحتوي أسئلة');
    if (retry && (!multipleChoice || !Array.isArray(prior.retryWrongIndexes) || !prior.retryWrongIndexes.length)) return window.toast?.('حالة إعادة المحاولة غير صالحة؛ تواصل مع إدارة المنصة.');
    if ((assignment.reviewWrongAnswers || retry) && !backendReady()) return window.toast?.('يلزم الاتصال بالخادم حتى تُحفظ إعادة المحاولة ونتيجتها بأمان.');
    if (assignment.courseId) {
      const course = (db.courses || []).find(item => String(item.id) === String(assignment.courseId));
      if (!course || !window.courseAccess?.(course, current.id)) return window.toast?.('يجب الاشتراك في الدورة المرتبطة أولًا');
      const watched = window.courseProgress?.(course, current.id) || [];
      const required = (course.lessons || []).map((lesson, index) => ({ lesson, index })).filter(item => !!String(item.lesson.videoRef || item.lesson.videoUrl || '').trim());
      if (required.some(item => !watched.includes(item.index))) return window.toast?.('أكمل مشاهدة فيديوهات الدورة المتاحة قبل فتح الواجب');
    }
    const wrongIndexes = new Set(retry ? prior.retryWrongIndexes.map(Number) : []);
    const paper = questions.map((question, index) => {
      const fixed = retry && !wrongIndexes.has(index);
      const oldAnswer = Number(prior?.answers?.[index]);
      const fixedAnswer = Number.isInteger(oldAnswer) ? question.options?.[oldAnswer] : '';
      const previousWrong = retry && wrongIndexes.has(index) ? `<div class="notice warn">إجابتك السابقة: ${esc(question.options?.[Number(prior.answers?.[index])] || 'لم تتم الإجابة')}</div>` : '';
      const answer = multipleChoice
        ? fixed
          ? `<div class="notice good">أجبت عن هذا السؤال صحيحًا في التسليم الأول: <b>${esc(fixedAnswer || 'إجابة محفوظة')}</b></div>`
          : `${previousWrong}<fieldset class="field"><legend>اختر الإجابة مرة أخرى</legend>${(question.options || []).map((option, optionIndex) => `<label class="list-item"><input type="radio" name="ans_${index}" value="${optionIndex}" required> ${esc(option)}</label>`).join('')}</fieldset>`
        : `<div class="field"><label for="ans_${index}">إجابتك</label><textarea id="ans_${index}" rows="4" required maxlength="20000" placeholder="اكتب إجابتك بالتفصيل..."></textarea></div>`;
      return `<article class="assignment-q"><b>${index + 1}. ${esc(question.text || '')}</b>${answer}</article>`;
    }).join('');
    const description = retry
      ? `<div class="notice info">أعد حل ${wrongIndexes.size} سؤالًا خاطئًا فقط. نتيجتك النهائية ستظهر بعد هذا التسليم.</div>`
      : `<p>${esc(assignment.desc || '')}</p>`;
    window.openModal(`<div class="section-head"><div><h3>${retry ? 'إعادة حل الأخطاء — ' : ''}${esc(assignment.title)}</h3><span class="small muted">${esc(assignment.subject)} • ${Number(assignment.points) || 0} درجة • آخر موعد ${esc(assignment.due || '—')}</span></div><span class="chip">${questions.length} أسئلة — ${multipleChoice ? 'اختيار من متعدد' : 'مقالي'}</span></div>${description}<form data-mk-submit="saveSubmission(event,'${esc(String(id))}')"><div class="assignment-paper">${paper}</div><button class="btn primary" style="width:100%;margin-top:14px">${retry ? 'تسليم الإجابات المعادة وإظهار النتيجة' : 'تسليم الواجب'}</button></form>`);
  };

  window.saveSubmission = async function (event, id) {
    event.preventDefault();
    if (!isStudent()) return window.forbidden?.();
    const assignment = (db.assignments || []).find(item => String(item.id) === String(id));
    if (!assignment) return window.toast?.('الواجب غير موجود');
    const questions = Array.isArray(assignment.questions) ? assignment.questions : [];
    const multipleChoice = assignment.answerType === 'multiple_choice' || assignment.answerType === 'mcq';
    const prior = byStudent(id), retry = prior?.status === 'retry_required';
    const wrongIndexes = new Set(retry && Array.isArray(prior.retryWrongIndexes) ? prior.retryWrongIndexes.map(Number) : []);
    if ((assignment.reviewWrongAnswers || retry) && !backendReady()) return window.toast?.('يلزم الاتصال بالخادم لتصحيح الواجب بأمان.');
    const answers = questions.map((question, index) => {
      if (multipleChoice) {
        if (retry && !wrongIndexes.has(index)) return Number(prior.answers?.[index]);
        const selected = document.querySelector(`input[name="ans_${index}"]:checked`)?.value;
        return selected === undefined ? null : Number(selected);
      }
      return String(document.getElementById('ans_' + index)?.value || '');
    });
    if (answers.some(answer => multipleChoice ? !Number.isInteger(answer) || answer < 0 : !String(answer).trim())) return window.toast?.('أكمل إجابات الأسئلة المطلوبة');
    if (retry && (wrongIndexes.size === 0 || answers.length !== questions.length)) return window.toast?.('تعذر تحميل الأسئلة المطلوب إعادتها');
    const old = db.submissions || [];
    const submission = {
      id: uid('sub'), assignment: String(id), student: String(current.id), answers,
      text: answers.map((answer, index) => `السؤال ${index + 1}: ${multipleChoice ? questions[index].options?.[answer] || '' : answer}`).join('\n\n'),
      submittedAt: new Date().toISOString(), status: 'submitted',
    };
    db.submissions = [...old, submission];
    save();
    const pushed = await window.mkBackendPushPlatform?.();
    if (!pushed) { db.submissions = old; save(); return window.toast?.(window.__mkBackendLastError || 'لم يؤكد الخادم حفظ التسليم.'); }
    await window.mkBackendPullPlatform?.(true);
    const accepted = byStudent(id);
    if (accepted?.status === 'retry_required') {
      window.closeModal?.(); window.renderPage?.();
      return window.toast?.(`أعد حل ${accepted.retryWrongIndexes?.length || 0} سؤالًا خاطئًا لعرض النتيجة النهائية.`);
    }
    if (accepted?.status === 'graded') return window.viewSubmission(id);
    window.closeModal?.(); window.renderPage?.();
    window.toast?.('تم تسليم الواجب بنجاح؛ ينتظر التصحيح.');
  };

  window.viewSubmission = function (id) {
    if (!isStudent()) return window.forbidden?.();
    const submission = byStudent(id), assignment = (db.assignments || []).find(item => String(item.id) === String(id));
    if (!submission || !assignment) return window.toast?.('التسليم غير موجود');
    const review = Array.isArray(submission.review) ? submission.review : [];
    const reviewHtml = review.length ? `<section class="mk-assignment-review"><h4>مراجعة الإجابات</h4>${review.map(item => `<article class="mk-exam-review-item ${item.correct ? 'correct' : 'incorrect'}"><b>السؤال ${Number(item.index) + 1}: ${esc(item.question || '')}</b><p>${item.retried ? 'كان ضمن الأسئلة المعادة • ' : ''}${item.correct ? 'أجبت عنه صحيحًا' : 'إجابتك'}: ${esc(item.answer || '—')}</p><p><b>الإجابة الصحيحة:</b> ${esc(item.correctAnswer || '—')}</p></article>`).join('')}</section>` : '';
    const status = submission.status === 'retry_required'
      ? `<div class="notice warn">لم تظهر النتيجة بعد. أعد حل ${submission.retryWrongIndexes?.length || 0} سؤالًا خاطئًا.</div>`
      : submission.status === 'graded'
        ? `<div class="notice good">النتيجة: <b>${Number(submission.score) || 0}/${Number(submission.max) || Number(assignment.points) || 0}</b><br>${esc(submission.feedback || 'تم التصحيح')}</div>`
        : `<div class="notice warn">تم التسليم وبانتظار التصحيح.</div>`;
    const solutionUrl = String(assignment.solutionVideoUrl || '');
    const solution = submission.status === 'graded' && /^https?:\/\//i.test(solutionUrl)
      ? `<div class="card" style="margin-top:12px"><h4>🎬 فيديو حل الواجب</h4><video controls playsinline preload="metadata" src="${esc(solutionUrl)}" style="width:100%;max-height:460px;background:#000;border-radius:12px"></video></div>` : '';
    window.openModal(`<div class="section-head"><h3>تسليم الواجب</h3><button class="btn" data-mk-click="closeModal()">إغلاق</button></div>${status}<div class="list-item" style="margin-top:12px;white-space:pre-wrap">${esc(submission.text || '')}</div>${reviewHtml}${solution}`);
  };

  const originalAssignmentCard = window.assignmentCard;
  window.assignmentCard = function (assignment) {
    if (!isStudent()) return originalAssignmentCard?.(assignment) || '';
    const submission = byStudent(assignment.id), retry = submission?.status === 'retry_required';
    const button = submission
      ? `<button class="btn ${retry ? 'primary' : ''}" data-mk-click="${retry ? `submitAssignment('${esc(assignment.id)}')` : `viewSubmission('${esc(assignment.id)}')`}">${retry ? 'أعد حل الأخطاء' : 'عرض التسليم'}</button>`
      : `<button class="btn primary" data-mk-click="submitAssignment('${esc(assignment.id)}')">حل الواجب</button>`;
    return `<div class="list-item"><div class="section-head"><div><b>${esc(assignment.title)}</b><div class="small muted">${esc(assignment.subject)} • ${esc(assignment.grade)} • ${Number(assignment.points) || 0} درجة • ${assignment.answerType === 'multiple_choice' ? 'اختيار من متعدد' : 'مقالي'} • آخر موعد ${esc(assignment.due || '—')}</div></div>${button}</div><p>${esc(assignment.desc || '')}</p></div>`;
  };

  window.mkShowExamResult = function (examId) {
    if (!isStudent()) return window.forbidden?.();
    const studentId = String(current.id);
    const exam = (db.exams || []).find(item => String(item.id) === String(examId));
    const result = (db.examResults || []).find(item => String(item.exam ?? item.examId) === String(examId) && String(item.student ?? item.studentId) === studentId);
    if (!exam || !result) return window.toast?.('النتيجة غير متاحة بعد');
    const review = Array.isArray(result.review) ? result.review : [];
    const reviewHtml = review.length ? `<section class="mk-exam-review"><h4>مراجعة الإجابات</h4>${review.map(item => `<article class="mk-exam-review-item ${item.correct ? 'correct' : 'incorrect'}"><b>السؤال ${Number(item.index) + 1}: ${esc(item.question || '')}</b><p>${item.retried ? 'كان ضمن الأسئلة المعادة • ' : ''}${item.correct ? 'إجابتك صحيحة' : 'إجابتك'}: ${esc(item.answer || '—')}</p><p><b>الإجابة الصحيحة:</b> ${esc(item.correctAnswer || '—')}</p></article>`).join('')}</section>` : '<div class="notice info">لا توجد أخطاء مسجلة للمراجعة.</div>';
    const status = result.forfeited
      ? '<div class="notice danger">تم إغلاق الاختبار عند مغادرة التطبيق قبل التسليم، وسُجلت المحاولة دون درجة.</div>'
      : `<div class="notice good">النتيجة: <b>${Number(result.score) || 0}/${Number(result.max) || 0}</b> • ${Number(result.percentage) || 0}%</div>`;
    window.openModal(`<div class="section-head"><h3>${esc(exam.title)}</h3><button class="btn" data-mk-click="closeModal()">إغلاق</button></div>${status}${result.forfeited ? '' : reviewHtml}`);
  };

  const originalStudentExamsPage = pages.exams;
  pages.exams = function () {
    if (!isStudent()) return originalStudentExamsPage?.() || '<div class="card empty">الاختبارات غير متاحة.</div>';
    const exams = (db.exams || []).filter(item => String(item.grade) === String(me()?.grade || ''));
    return `<div class="grid"><div class="card"><div class="section-head"><div><h3>اختباراتي</h3><span class="small muted">وقت كل اختبار يبدأ من أول دخول ويستمر على الخادم.</span></div></div><div class="list">${exams.map(exam => {
      const result = (db.examResults || []).find(item => String(item.exam ?? item.examId) === String(exam.id) && String(item.student ?? item.studentId) === String(current.id));
      const action = result
        ? `<button class="btn" data-mk-click="mkShowExamResult('${esc(exam.id)}')">عرض النتيجة</button>`
        : `<button class="btn primary" data-mk-click="startExam('${esc(exam.id)}')">ابدأ الاختبار</button>`;
      return `<article class="list-item"><div class="section-head"><div><b>${esc(exam.title)}</b><div class="small muted">${esc(exam.subject)} • ${Number(exam.questions?.length || 0)} سؤال • ${Number(exam.duration) || 30} دقيقة</div></div>${action}</div>${result ? `<div class="small muted">${result.forfeited ? 'أُغلقت المحاولة دون تسليم' : `الدرجة ${Number(result.score) || 0}/${Number(result.max) || 0}`}</div>` : ''}</article>`;
    }).join('') || '<div class="empty">لا توجد اختبارات متاحة لك الآن.</div>'}</div></div></div>`;
  };

  const originalStartExam = window.startExam;
  window.startExam = function (examId) {
    const result = (db.examResults || []).find(item => String(item.exam ?? item.examId) === String(examId) && String(item.student ?? item.studentId) === String(current?.id));
    if (result) return window.mkShowExamResult(examId);
    return originalStartExam?.(examId);
  };
})();
