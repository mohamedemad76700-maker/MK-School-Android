(function installSecureEvents(root, factory) {
  const api = factory([
  "__examFinish",
  "__examGo",
  "__examMark",
  "__examNext",
  "__examPick",
  "__examPrev",
  "__examSetMode",
  "__examTextAnswer",
  "addAssignment",
  "addCertificate",
  "addComplaint",
  "addCourse",
  "addExam",
  "addGrade",
  "addQuestion",
  "addStudent",
  "addStudentFile",
  "addSubject",
  "aiNewChat",
  "aiQuick",
  "applyBackupImport",
  "approveCourseRequest",
  "askAI",
  "assignmentModal",
  "certificateModal",
  "closeModal",
  "complaintModal",
  "completePasswordReset",
  "courseDetails",
  "courseModal",
  "cycleFontSize",
  "deleteCourse",
  "deleteStudentFile",
  "examModal",
  "exportData",
  "gradeModal",
  "gradeSubmission",
  "importModal",
  "loadExamBank",
  "logout",
  "markAllPresent",
  "mkAddCourse",
  "mkAddCourseExamQuestionRow",
  "mkAddLessonRow",
  "mkAddLessonToCourse",
  "mkAddReward",
  "mkAdminAssignmentDelete",
  "mkAdminAssignmentModal",
  "mkAdminAssignmentHint",
  "mkAdminAssignmentSave",
  "mkAdminExamDelete",
  "mkAdminExamModal",
  "mkAdminExamSave",
  "mkAdminGradeModal",
  "mkAdminGradeSave",
  "mkAdminCourseEnrollmentDialog",
  "mkAdminCourseEnrollmentSave",
  "mkAdminGrantVideoViews",
  "mkAdminReprocessVideo",
  "mkAdminReprocessVideoDialog",
  "mkAdminVideoViewsDialog",
  "mkAdminQuestionDelete",
  "mkAdminQuestionFilter",
  "mkAdminQuestionModal",
  "mkAdminQuestionSave",
  "mkAdminResetAccountPassword",
  "mkAdminResetAllViews",
  "mkAdminResetViews",
  "mkAdminSubjectModal",
  "mkAdminSubjectSave",
  "mkAdminVideoControls",
  "mkApplyQuestionBankFilter",
  "mkAssignmentQuestionHint",
  "mkBack",
  "mkCertificateDetails",
  "mkCheckVideoEngine",
  "mkCommunityCompose",
  "mkCommunityModerate",
  "mkCommunityRecipientChanged",
  "mkCommunitySetView",
  "mkCommunitySubmit",
  "mkCompleteLessonAndRefresh",
  "mkCopyVodafoneCashNumber",
  "mkCourseExamModal",
  "mkCreateParentLinkCode",
  "mkDeleteCertificate",
  "mkDeleteReward",
  "mkEditCourseAccess",
  "mkEditCoursePoints",
  "mkEditLessonDuration",
  "mkFilterCourses",
  "mkFilterStudentClassOptions",
  "mkFreeEnroll",
  "mkFull",
  "mkLibraryApprovePayment",
  "mkLibraryBuy",
  "mkLibraryDelete",
  "mkLibraryEdit",
  "mkLibraryOpenForm",
  "mkLibrarySave",
  "mkLibrarySubmitPayment",
  "mkLibraryTogglePrice",
  "mkLoadAccountActivity",
  "mkLoadDeviceStatusFromForm",
  "mkLookupRewardCode",
  "mkMarkAllNotifications",
  "mkOpenNotifications",
  "mkMoveLessonRow",
  "mkMute",
  "mkNotificationModal",
  "mkOpenNotification",
  "mkPaidRequest",
  "mkPause",
  "mkPlatformAddContent",
  "mkPlatformAddExam",
  "mkPlatformBack",
  "mkPlatformDeleteContent",
  "mkPlatformOpen",
  "mkRefreshLearningStreak",
  "mkPlatformOpenVideo",
  "mkPlatformSaveContent",
  "mkPlatformSaveExam",
  "mkPlatformSearch",
  "mkPlatformSelectGrade",
  "mkPlatformSelectLevel",
  "mkPlatformSelectSubject",
  "mkPlay",
  "mkPreviewCourseExamQuestionImage",
  "mkPrintCourseInvoice",
  "mkRedeemParentLink",
  "mkRedeemReward",
  "mkRefreshActivityLog",
  "mkRemoveCourseExamQuestionRow",
  "mkRemoveExistingCourseExamQuestionImage",
  "mkRemoveLessonRow",
  "mkResetDevice",
  "mkRetryCourseProcessingById",
  "mkSaveCourseAccess",
  "mkSaveCourseExam",
  "mkSaveCoursePoints",
  "mkSaveLessonDuration",
  "mkSaveNewLesson",
  "mkSavePaymentSettings",
  "mkSaveReward",
  "mkSaveStudentAffairs",
  "mkSaveStudentStatus",
  "mkSaveExamGameSettings",
  "mkSaveVodafoneCashSettings",
  "mkScrollToCourseCatalog",
  "mkSeek",
  "mkSelectCourseLesson",
  "mkSendDirectNotification",
  "mkSetProfileTab",
  "mkSetQuestionBankSubject",
  "mkSpeed",
  "mkTogglePassword",
  "mkVideoQuality",
  "mkStudentFullProfile",
  "mkStudentStatusModal",
  "mkSubmitVodafonePayment",
  "mkSyncUsersAndNotify",
  "mkToggleCoursePackageFields",
  "mkTogglePlatformMenu",
  "mkToggleSuspendFields",
  "mkVideoEngineSettings",
  "mkVodafoneSettings",
  "openLesson",
  "openLibraryResource",
  "openRegister",
  "openStudentAffairs",
  "previewQuestionImage",
  "print",
  "printCertificate",
  "questionModal",
  "readBackupFile",
  "registerParent",
  "registerStudent",
  "rejectCourseRequest",
  "renderPage",
  "requestCourse",
  "requestPasswordReset",
  "resetData",
  "resolveComplaint",
  "saveGradeSubmission",
  "saveStudentAffairs",
  "saveSubmission",
  "submitAssignment",
  "setAttendance",
  "showAccountRecoveryHelp",
  "showPage",
  "startExam",
  "studentDetails",
  "studentModal",
  "subjectModal",
  "submissions",
  "toggleCourseExam",
  "toggleCourseLesson",
  "toggleCoursePrice",
  "toggleSide",
  "toggleStudentActive",
  "toggleTheme",
  "updateExamBankCount",
  "updateRegisterTrack",
  "v32ApprovePayment",
  "v32ExportAttendance",
  "v32PaymentSettings",
  "v32RejectPayment",
  "v32SubmitPayment",
  "viewStudentFile",
  "viewSubmission",
  "mkShowExamResult"
]);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) api.install(root);
})(typeof globalThis === 'object' ? globalThis : this, function createSecureEvents(allowedActionNames) {
  'use strict';
  const allowed = new Set(allowedActionNames);
  const eventTypes = ['click', 'submit', 'change', 'input'];

  function splitTopLevel(value, separator) {
    const parts = []; let start = 0, depth = 0, quote = '', escaped = false;
    for (let index = 0; index < value.length; index++) {
      const char = value[index];
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (quote) { if (char === quote) quote = ''; continue; }
      if (char === '\'' || char === '"') { quote = char; continue; }
      if ('([{'.includes(char)) depth++;
      else if (')]}'.includes(char)) depth--;
      else if (char === separator && depth === 0) { parts.push(value.slice(start, index).trim()); start = index + 1; }
    }
    parts.push(value.slice(start).trim());
    if (quote || depth !== 0 || escaped) throw new Error('Malformed action arguments');
    return parts.filter(Boolean);
  }

  function parseString(raw) {
    const quote = raw[0]; let output = '';
    for (let index = 1; index < raw.length - 1; index++) {
      const char = raw[index];
      if (char !== '\\') { output += char; continue; }
      const next = raw[++index];
      const escapes = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0', '\\': '\\', '\'': '\'', '"': '"' };
      if (next === undefined) throw new Error('Malformed string argument');
      output += Object.prototype.hasOwnProperty.call(escapes, next) ? escapes[next] : next;
    }
    if (raw[raw.length - 1] !== quote) throw new Error('Malformed string argument');
    return output;
  }

  function readArgument(raw, element, event) {
    if ((raw[0] === '\'' || raw[0] === '"') && raw[raw.length - 1] === raw[0]) return parseString(raw);
    if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(raw)) return Number(raw);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw === 'null') return null;
    if (raw === 'undefined') return undefined;
    if (raw === 'event') return event;
    if (raw === 'this') return element;
    if (raw === 'this.value') return element.value;
    if (raw === 'this.checked') return Boolean(element.checked);
    if (raw === 'this.files[0]') return element.files?.[0] || null;
    if (raw === 'this.id') return element.id;
    throw new Error('Unsupported action argument');
  }

  function parseCall(command) {
    const match = /^(?:window\.)?([A-Za-z_$][\w$]*)\(([\s\S]*)\)$/.exec(command.trim());
    if (!match) throw new Error('Unsupported action syntax');
    const name = match[1];
    if (!allowed.has(name)) throw new Error('Action is not allowlisted');
    const argsSource = match[2].trim();
    return { name, args: argsSource ? splitTopLevel(argsSource, ',') : [] };
  }

  function runCommands(source, element, event, target) {
    if (typeof source !== 'string' || source.length > 1200) throw new Error('Action is too long');
    const commands = splitTopLevel(source, ';');
    let preventDefault = false;
    for (const commandText of commands) {
      const command = commandText.trim();
      if (!command) continue;
      if (command === 'return false') { preventDefault = true; break; }
      if (command === 'event.preventDefault()') { preventDefault = true; continue; }
      const parsed = parseCall(command);
      if (parsed.args.length > 8) throw new Error('Too many action arguments');
      const action = target[parsed.name];
      if (typeof action !== 'function') throw new Error('Action is unavailable');
      const result = action.apply(target, parsed.args.map(value => readArgument(value, element, event)));
      if (result === false) { preventDefault = true; break; }
    }
    return preventDefault;
  }

  function install(root) {
    const doc = root.document;
    if (doc.__mkSecureEventsInstalled) return;
    doc.__mkSecureEventsInstalled = true;
    for (const type of eventTypes) {
      doc.addEventListener(type, event => {
        if (type === 'submit') event.preventDefault();
        const attribute = 'data-mk-' + type;
        const path = [];
        for (let node = event.target; node && node !== doc; node = node.parentElement) path.push(node);
        for (const element of path) {
          if (element.hasAttribute?.(attribute)) {
            try {
              if (runCommands(element.getAttribute(attribute), element, event, root)) {
                event.preventDefault(); event.stopPropagation(); return;
              }
            } catch (error) {
              console.error('[secure-ui-action]', error);
              if (typeof root.toast === 'function') root.toast('تعذر تنفيذ الإجراء. حدّث الصفحة وحاول مرة أخرى.');
              event.preventDefault(); event.stopPropagation(); return;
            }
          }
          if (type === 'click' && element.hasAttribute?.('data-mk-close-on-backdrop') && event.target === element) {
            root.closeModal?.(); return;
          }
        }
      }, true);
    }
  }

  return { install, runCommands, allowedActionNames: [...allowed] };
});
