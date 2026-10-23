# منصة MK School

المشروع يجمع تطبيق Android داخل `android/`، ملفات الواجهة داخل `www/`، والباك إند داخل `video_engine_backend/`.

## فحص المشروع

من مجلد المشروع:

```powershell
npm test
cd video_engine_backend
npm ci
npm run typecheck
npm test
npm run build
```

لتشغيل الخادم محليًا، يلزم PostgreSQL وRedis وملف `.env` بإعداداتهما. أنشئ قالبًا محليًا عبر `node video_engine_backend/scripts/init-env.cjs` من مجلد المشروع، ثم ضع عناوين الخدمات الحقيقية في `.env`. هذا الملف مستثنى من Git.

## نشر الموقع والباك إند على Render

ارفع **مجلد المشروع كاملًا** إلى مستودع GitHub، ثم أنشئ Blueprint في Render واختر `render.yaml` من جذر المستودع. الإعداد يستخدم Node مباشرة؛ وبيئة Render الأصلية تتضمن FFmpeg اللازم لتحويل الفيديو.

أثناء الإعداد، أدخل بريد وكلمة مرور حساب المدير الأول ومفتاح Groq جديدًا. لا تضع كلمات المرور أو المفاتيح داخل ملفات المشروع. مفتاح Groq الذي أُرسل في المحادثة يجب إلغاؤه وإنشاء بديل قبل النشر.

الـBlueprint يجهّز خادم Node وقاعدة PostgreSQL وRedis وقرصًا دائمًا للفيديو. راجع تكلفة الموارد في Render قبل إنشائها. بعد نجاح النشر، يخدم عنوان الخادم نفسه الموقع ومسارات الـAPI؛ استخدم عنوان HTTPS الذي يعرضه Render عند تجهيز نسخة Android النهائية.
