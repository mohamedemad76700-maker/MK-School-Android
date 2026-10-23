-- Community posts may reference safe, moderated image/PDF attachments.
ALTER TABLE school_files DROP CONSTRAINT IF EXISTS school_files_purpose_check;
ALTER TABLE school_files ADD CONSTRAINT school_files_purpose_check
  CHECK (purpose IN ('student-file','course-cover','course-file','payment-receipt','exam-question','platform-library','community-attachment'));
