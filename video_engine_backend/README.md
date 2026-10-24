# MK Platform Backend — TypeScript + Node.js (بدون Docker)

الخادم مبني باستخدام TypeScript وNode.js وExpress، ويقدّم الواجهة الحالية من `index.html` و`assets/`. لا يحتاج Docker؛ لكنه يحتاج PostgreSQL وRedis مثبتين محليًا أو على خوادم متاحة عبر الشبكة.

## المتطلبات
- Node.js 22 أو أحدث وnpm.
- PostgreSQL (قاعدة البيانات المعرّفة في `DATABASE_URL`).
- Redis (العنوان في `REDIS_URL`).
- FFmpeg متاحًا في `PATH` إذا كانت ميزة رفع الفيديو وتحويله إلى HLS مستخدمة.

## الإعداد والتشغيل
1. من مجلد المشروع الرئيسي شغّل `node video_engine_backend/scripts/init-env.cjs` لإنشاء ملف `.env` خاص في الجذر، أو عيّن متغيرات البيئة مباشرة في منصة الاستضافة.
2. عدّل `DATABASE_URL` و`REDIS_URL`، وضع `JWT_SECRET` عشوائيًا فريدًا بطول 44 حرفًا أو أكثر (أو استخدم سرًا مشفرًا عشوائيًا بقوة 256 بت). لا تستخدم قيمة القالب.
3. اضبط `VIDEO_BOOTSTRAP_ADMIN_EMAIL` و`VIDEO_BOOTSTRAP_ADMIN_PASSWORD` لإنشاء حساب المدير الأول عند بدء الخادم لأول مرة.
4. اضبط `FRONTEND_ORIGIN` على عنوان الموقع الفعلي، وأضف الأصول الإضافية الدقيقة في `FRONTEND_ORIGINS` مفصولة بفواصل. يتضمن القالب أصلَي Android/Capacitor المحليين. لا تستخدم wildcard في CORS.
5. ابنِ الخادم عبر `npm --prefix video_engine_backend install` ثم `npm --prefix video_engine_backend run build`، وبعدها شغّله من الجذر بـ `node --env-file=.env video_engine_backend/dist/main.js` (Node.js 22+).
6. افتح `http://localhost:8080` عند التشغيل المحلي. PostgreSQL وRedis لا يتم تثبيتهما أو تشغيلهما تلقائيًا.

### استعادة كلمة المرور بالبريد
على Render Free استخدم Resend عبر HTTPS بدل SMTP لأن الخطة المجانية تحجب منافذ SMTP. اضبط `RESEND_API_KEY` كمفتاح سري و`RESEND_FROM` كعنوان من نطاق موثّق في Resend. عند غياب `RESEND_API_KEY` يمكن للخادم استخدام SMTP التقليدي عبر `SMTP_HOST` و`SMTP_PORT` و`SMTP_USER` و`SMTP_PASSWORD` و`SMTP_FROM`.

يمكنك من داخل هذا المجلد تشغيل `npm install` ثم `npm run typecheck` ثم `npm run build`. لا ترفع `.env` أو كلمات المرور أو مفاتيح API إلى Git. في تطبيق Android افتح «إعداد اتصال الخادم» قبل تسجيل الدخول، وأدخل عنوان HTTPS الذي يستضيف الـAPI. عنوان الخادم إعداد غير سري، أما `GROQ_API_KEY` فيُضبط كسرّ في بيئة تشغيل الخادم فقط.

## مسارات API الرئيسية
- `GET /health`
- `POST /api/v1/auth/login` و`POST /api/v1/auth/register`
- `POST /api/v1/auth/sync-users` و`POST /api/v1/auth/sync-platform`
- `GET/POST /api/v1/platform/state`
- `POST /api/v1/parent-links/code` و`POST /api/v1/parent-links/redeem` (كود لمرة واحدة، صالح 15 دقيقة)
- واجهات الدورات والمكافآت والفيديو و`POST /api/v1/ai/deep-search`

## ملاحظات أمان وتشغيل
- محددات المحاولات تستخدم Redis مشتركًا بين نسخ Node بدل عداد ذاكرة محلية. عند تعطل Redis تُرفض الطلبات المحمية مؤقتًا بدل تجاوز الحماية. يمكن ضبط `LOGIN_IP_LIMIT` و`PG_POOL_MAX` بعد اختبار السعة.
- سياق الذكاء الاصطناعي يُقلّص إلى بيانات تعليمية مسموح بها، مع حذف معرفات الحسابات والأسماء وبيانات الاتصال وحقول الإجابات الصحيحة قبل الإرسال إلى مزود خارجي. الطالب لا يرسل للمساعد إلا محتوى الدروس المفتوحة ضمن الدورات المسجل فيها.
- ترقية دور الحساب تبطل JWT القديم عند أول طلب لاحق، واختبار الدرجة صفر لا يمنح نقاطًا.
- كلمات المرور تُخزّن باستخدام Argon2id، وتُقيّد خوارزمية JWT المقبولة إلى HS256.
- جلسة الحساب مرتبطة ببصمة جهاز؛ وتُفحص صلاحيات مشاهدة الفيديو في الخادم.
- لا تُرسل إجابات بنك الأسئلة أو سجلات التدقيق أو سجل محادثات الذكاء الاصطناعي إلى حسابات الطلاب وأولياء الأمور.
- اكتساب النقاط من `/api/v1/platform/points/earn` لا يقبل إلا اختبارًا محفوظًا على الخادم ذي نتيجة صحيحة أكبر من صفر، مع منع تكرار المكافأة لنفس الطالب والاختبار.
- `license_key` رمز تفويض مؤقت للفيديو، وليس نظام DRM معياريًا.
- لا يستخدم التطبيق تخزين المتصفح لحفظ بيانات المنصة أو الأسرار؛ قد يُحفظ عنوان الخادم غير السري على الجهاز لتسهيل الاتصال. تُحفظ الحالة كعناصر مستقلة في `platform_state_collections` و`platform_state_items` مع مقارنة revision ودمج التغييرات المتعارضة، وتُخزن المرفقات خارج JSONB في `school_files` بمفاتيح تخزين غير قابلة للتخمين. يجب مع ذلك إكمال اختبارات التكامل والضغط الفعلية قبل اعتماد الإنتاج واسع النطاق.


### Security hardening notes
- Run `node scripts/init-env.cjs` from the project root before first launch. It creates a private runtime `.env` with a cryptographically random JWT secret. Existing `.env` values, including the administrator bootstrap credentials, are preserved. Do not commit or serve `.env`.
- The default bind address is `127.0.0.1`; configure a trusted reverse proxy and HTTPS before external access. Set `TRUST_PROXY=true` only behind a correctly configured proxy.
- Login and registration IP limits are intentionally bounded to reduce brute-force and account-creation abuse.
- School-file uploads verify content signatures for supported formats. Course files are checked against course ownership and active enrollment before they are released. Classroom/section fields are removed by migration `0019_remove_classes.sql`; historical migrations retain their original schema for upgrade compatibility.
