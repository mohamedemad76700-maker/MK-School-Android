import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import argon2 from 'argon2';
import multer from 'multer';
import nodemailer from 'nodemailer';
import pg, { type PoolClient } from 'pg';
import { createClient } from 'redis';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, realpath, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeExamQuestion, gradeExamAnswers, isCourseExamEnrolled } from './exam-utils.js';
import { nextVideoViewCount } from './video-view-utils.js';
import { exceedsAiDailyLimit, filterAiCoursesForEnrolledStudents, minimizeAiContext } from './ai-context-utils.js';
import { applyPlatformStateChanges } from './platform-state-utils.js';
import { canReadPublishedLibraryFile, canRegisterDeviceSession, requiresDeviceRegistration, teacherOwnsCourse } from './library-access-utils.js';
import { isSessionVersionCurrent } from './auth-utils.js';
import { advanceWatchProgress, courseLessonsComplete, lessonReleaseIsOpen, watchedEnough } from './course-release-utils.js';
import { canReadSchoolFile, canUploadSchoolFile, isSafeSchoolStorageKey, safeSchoolOriginalFilename, schoolFileMimeForExtension } from './school-files-utils.js';
import { validateProductionConfiguration } from './production-config-utils.js';
import { isSafePasswordResetBase } from './password-reset-utils.js';
import { buildHlsTranscodeArgs, hlsSegmentNames, hlsVariantNames, rewriteHlsManifest, selectVideoRenditions } from './hls-transcode-utils.js';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8080);
const DB_POOL_MAX = Math.max(5, Math.min(100, Number.parseInt(process.env.PG_POOL_MAX || '20', 10) || 20));
const MEDIA_ROOT = path.resolve(process.env.MEDIA_ROOT || path.join(ROOT, 'media'));
const FFMPEG_CONFIGURED_PATH = process.env.FFMPEG_PATH?.trim() || 'ffmpeg';
const JWT_SECRET = process.env.JWT_SECRET || '';
const GROQ_MODEL = process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b';
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL?.trim();
const DEFAULT_PUBLIC_ORIGIN = RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN?.trim() || DEFAULT_PUBLIC_ORIGIN;
const CORS_ALLOWED_ORIGINS = new Set([
  FRONTEND_ORIGIN,
  ...(process.env.FRONTEND_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean),
  'https://localhost', 'capacitor://localhost', 'http://localhost',
  'https://127.0.0.1', 'http://127.0.0.1',
  ...(process.env.FRONTEND_ORIGIN ? [] : [`http://127.0.0.1:${PORT}`, `https://localhost:${PORT}`, `https://127.0.0.1:${PORT}`]),
]);
const MAX_VIEWS = 3;
const MAX_UPLOAD = 1024 * 1024 * 1024;
const ALLOWED_ROLES = new Set(['student', 'teacher', 'admin', 'parent']);

if (JWT_SECRET.length < 32 || /^(CHANGE|SET_|REPLACE|YOUR_)/i.test(JWT_SECRET)) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters.');
}
if (!process.env.DATABASE_URL || !process.env.REDIS_URL) {
  throw new Error('DATABASE_URL and REDIS_URL are required. Install PostgreSQL and Redis locally, then configure .env.');
}
const productionConfigErrors = validateProductionConfiguration({
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: JWT_SECRET,
  frontendOrigin: FRONTEND_ORIGIN,
  appBaseUrl: process.env.APP_BASE_URL?.trim() || DEFAULT_PUBLIC_ORIGIN,
  host: process.env.HOST?.trim() || '127.0.0.1',
  trustProxy: process.env.TRUST_PROXY === 'true',
  allowPrivateDatastoreTransport: process.env.RENDER === 'true' && process.env.ALLOW_PRIVATE_DATASTORE_TRANSPORT === 'true',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
});
if (productionConfigErrors.length) {
  throw new Error(`Unsafe production configuration: ${productionConfigErrors.join('; ')}`);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: DB_POOL_MAX, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000, statement_timeout: 30000 });
const redis = createClient({ url: process.env.REDIS_URL, socket: { reconnectStrategy: retries => Math.min(retries * 250, 3000) } });
redis.on('error', err => console.error('[redis]', err.message));
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], baseUri: ["'self'"], objectSrc: ["'none'"],
    frameAncestors: ["'none'"], formAction: ["'self'"],
    // All executable scripts are external same-origin files. Inline event handlers below
    // remain temporarily enabled for the legacy UI, but inline <script> injection is blocked.
    scriptSrc: ["'self'", 'https://cdnjs.cloudflare.com'],
    // The legacy interface uses inline onclick/onsubmit handlers throughout; Helmet's
    // default script-src-attr 'none' silently disables login, registration, and navigation.
    scriptSrcAttr: ["'unsafe-inline'"],
    workerSrc: ["'self'", 'blob:', 'https://cdnjs.cloudflare.com'], styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
    imgSrc: ["'self'", 'data:', 'blob:', 'https:'], mediaSrc: ["'self'", 'blob:', 'https:'], fontSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'", 'https://api.groq.com'], upgradeInsecureRequests: null,
  } }, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const corsMiddleware = cors({ origin(origin, callback) {
  if (!origin) return callback(null, false);
  if (CORS_ALLOWED_ORIGINS.has(origin)) return callback(null, true);
  return callback(new HttpError(403, 'Origin is not allowed by CORS'));
}, methods: ['GET', 'POST', 'DELETE', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type'], credentials: true, maxAge: 600 });
app.use((req, res, next) => {
  // The site and API share a host by default. Allow same-origin requests on the actual
  // Host/IP (not only localhost), while applying the explicit allow-list to cross-origin calls.
  const origin = req.header('Origin');
  const host = req.header('host');
  const sameOrigin = Boolean(origin && host && origin === `${req.protocol}://${host}`);
  if (sameOrigin) return next();
  return corsMiddleware(req, res, next);
});
app.use(express.json({ limit: '16mb', strict: true }));
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

interface Claims extends JwtPayload { sub: string; role: string; device?: string; session_version?: number; video_id?: string; video_preview?: boolean; file_id?: string; file_purpose?: string }
type AuthedRequest = Request & { claims?: Claims };
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const fail = (status: number, message: string): never => { throw new HttpError(status, message); };
const safeId = (value: unknown): string => String(value ?? '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 255);
const str = (value: unknown): string => typeof value === 'string' ? value : '';
function normalizeEgyptianPhone(value: string): string {
  const phone = value.replace(/[\s()-]/g, '');
  if (/^01[0125]\d{8}$/.test(phone)) return `+20${phone.slice(1)}`;
  if (/^\+?20[0-9]{10}$/.test(phone) && /^\+?201[0125]/.test(phone)) return phone.startsWith('+') ? phone : `+${phone}`;
  return '';
}
const bool = (value: unknown, fallback = true): boolean => typeof value === 'boolean' ? value : fallback;
const hashDevice = (device: string): string => createHash('sha256').update(device).digest('hex');
const tokenFor = (claims: object, expiresIn: number): string => jwt.sign(claims, JWT_SECRET, { algorithm: 'HS256', expiresIn });
const AUTH_COOKIE = 'mk_school_session';
const readAuthCookie = (req: Request): string => {
  const entry = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${AUTH_COOKIE}=`));
  if (!entry) return '';
  try { return decodeURIComponent(entry.slice(AUTH_COOKIE.length + 1)); } catch { return ''; }
};
const setAuthCookie = (res: Response, token: string, persistent: boolean): void => {
  const maxAge = persistent ? '; Max-Age=2592000' : '';
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${maxAge}${secure}`);
};
const clearAuthCookie = (res: Response): void => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
};
const verifyToken = (token: string): Claims => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (!decoded || typeof decoded === 'string' || typeof decoded.sub !== 'string' || typeof decoded.role !== 'string') fail(401, 'invalid or expired token');
    return decoded as Claims;
  } catch { return fail(401, 'invalid or expired token'); }
};
const bearer = (req: Request): Claims => {
  const value = req.header('authorization') || '';
  if (value.startsWith('Bearer ')) return verifyToken(value.slice(7));
  const cookie = readAuthCookie(req);
  if (!cookie) fail(401, 'bearer token required');
  return verifyToken(cookie);
};
const admin = async (req: Request): Promise<Claims> => {
  const claims = bearer(req);
  if (claims.role !== 'admin') fail(403, 'admin role required');
  await requireDeviceSession(claims);
  const { rows } = await pool.query('SELECT active FROM video_users WHERE id=$1 AND role=$2', [claims.sub, 'admin']);
  if (rows[0]?.active !== true) fail(403, 'admin account is inactive');
  return claims;
};
const audit = async (actor: string, action: string, details = ''): Promise<void> => {
  try { await pool.query('INSERT INTO audit_logs(actor_id,action,details) VALUES($1,$2,$3)', [actor, action, details]); }
  catch (error) { console.error('[audit]', error instanceof Error ? error.message : 'unknown error'); }
};
async function requireDeviceSession(claims: Claims): Promise<void> {
  const user = await pool.query('SELECT active,role,session_version FROM video_users WHERE id=$1', [claims.sub]);
  if (user.rows[0]?.active !== true) fail(403, 'account is inactive');
  // Role changes must invalidate old JWTs immediately; otherwise a former teacher/admin token
  // could retain the old role until expiry even after an administrator demotes the account.
  if (String(user.rows[0]?.role || '') !== claims.role) fail(401, 'account role changed; sign in again');
  // Password resets increment this value so every previously issued login, refresh,
  // school-file, and media token stops working on its next request.
  if (!isSessionVersionCurrent(claims.session_version, user.rows[0]?.session_version)) fail(401, 'session was revoked; sign in again');
  // Administrator accounts are not paired with or registered to any device.
  if (!requiresDeviceRegistration(claims.role)) return;
  const row = await pool.query('SELECT device_hash,active FROM account_devices WHERE user_id=$1 AND device_hash=$2', [claims.sub, claims.device]);
  if (!row.rows[0]) fail(409, 'لا يوجد جهاز مسجل لهذا الحساب');
  if (row.rows[0].active !== true) fail(409, 'تم إلغاء جلسة هذا الجهاز');
  await pool.query('UPDATE account_devices SET last_seen_at=now() WHERE user_id=$1 AND device_hash=$2', [claims.sub, claims.device]);
}
async function requireVideoAccess(studentId: string, videoId: string): Promise<void> {
  const user = await pool.query("SELECT active FROM video_users WHERE id=$1 AND role='student'", [studentId]);
  if (user.rows[0]?.active !== true) fail(403, 'student account is inactive');
  const access = await pool.query('SELECT EXISTS(SELECT 1 FROM video_access WHERE student_id=$1 AND video_id=$2 AND active=TRUE) AS allowed', [studentId, videoId]);
  if (access.rows[0]?.allowed !== true) fail(403, 'student is not enrolled in the course containing this video');
}
const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (err instanceof HttpError) { res.status(err.status).json({ error: err.message, message: err.message }); return; }
  if (err instanceof multer.MulterError) { res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.message, message: err.message }); return; }
  console.error('[request-error]', err instanceof Error ? err.stack : err);
  res.status(500).json({ error: 'internal server error', message: 'internal server error' });
};
type RateLimitKey = (req: Request) => string;
function redisRateLimit(name: string, windowMs: number, limit: number, keyFor: RateLimitKey, message: string) {
  // Redis-backed counters are shared across Node instances and survive process restarts.
  // If the protection service is down, fail closed instead of silently dropping rate limits.
  return (req: Request, res: Response, next: NextFunction): void => {
    void (async () => {
      try {
        const digest = createHash('sha256').update(keyFor(req) || `missing:${req.ip}`).digest('hex');
        const key = `mk-school:rate:${name}:${digest}`;
        const result = await redis.eval(
          "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]); end; return {n,redis.call('PTTL',KEYS[1])}",
          { keys: [key], arguments: [String(windowMs)] },
        );
        const values = Array.isArray(result) ? result : [result, windowMs];
        const count = Number(values[0]);
        const ttlSeconds = Math.max(1, Math.ceil(Number(values[1]) / 1000) || Math.ceil(windowMs / 1000));
        res.setHeader('RateLimit-Limit', String(limit));
        res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - count)));
        res.setHeader('RateLimit-Reset', String(ttlSeconds));
        if (count > limit) {
          res.setHeader('Retry-After', String(ttlSeconds));
          res.status(429).json({ error: message, message });
          return;
        }
        next();
      } catch (error) {
        console.error('[rate-limit]', error instanceof Error ? error.message : 'unknown error');
        res.status(503).json({ error: 'request protection service unavailable', message: 'خدمة حماية الطلبات غير متاحة مؤقتًا؛ حاول لاحقًا' });
      }
    })();
  };
}
const loginIpLimit = Math.max(10, Math.min(500, Number.parseInt(process.env.LOGIN_IP_LIMIT || '30', 10) || 30));
const loginIpLimiter = redisRateLimit('login-ip', 60 * 60 * 1000, loginIpLimit, req => req.ip || req.socket.remoteAddress || 'unknown', 'too many login attempts from this network');
const loginIdentityLimiter = redisRateLimit('login-identity', 15 * 60 * 1000, 10, req => str((req.body as any)?.identifier).trim().toLowerCase() || `missing:${req.ip}`, 'too many login attempts for this account');
const registerIpLimit = Math.max(5, Math.min(200, Number.parseInt(process.env.REGISTER_IP_LIMIT || '20', 10) || 20));
const registerIpLimiter = redisRateLimit('register-ip', 60 * 60 * 1000, registerIpLimit, req => req.ip || req.socket.remoteAddress || 'unknown', 'too many account creation attempts from this network');
const registerEmailLimiter = redisRateLimit('register-email', 60 * 60 * 1000, 5, req => str((req.body as any)?.email).trim().toLowerCase() || `missing:${req.ip}`, 'too many account creation attempts for this email');
const aiLimiter = redisRateLimit('ai', 60 * 1000, 12, req => str(req.header('authorization')) || req.ip || 'unknown', 'too many AI requests');
const AI_DAILY_LIMIT = Math.max(1, Math.min(500, Number.parseInt(process.env.AI_DAILY_LIMIT || '60', 10) || 60));
const parentLinkLimiter = redisRateLimit('parent-link', 15 * 60 * 1000, 10, req => str(req.header('authorization')) || req.ip || 'unknown', 'محاولات الربط كثيرة، حاول بعد 15 دقيقة');
const passwordResetRequestIpLimiter = redisRateLimit('password-reset-ip', 60 * 60 * 1000, 10, req => req.ip || req.socket.remoteAddress || 'unknown', 'محاولات استعادة كثيرة؛ حاول لاحقًا');
const passwordResetRequestEmailLimiter = redisRateLimit('password-reset-email', 60 * 60 * 1000, 3, req => str((req.body as any)?.email).trim().toLowerCase() || `missing:${req.ip}`, 'تم طلب استعادة كلمة المرور عدة مرات؛ تحقق من بريدك أو حاول لاحقًا');
const passwordResetCompleteLimiter = redisRateLimit('password-reset-complete', 60 * 60 * 1000, 10, req => req.ip || req.socket.remoteAddress || 'unknown', 'محاولات تغيير كلمة المرور كثيرة؛ حاول لاحقًا');

function createSmtpTransport() {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  const port = Number.parseInt(process.env.SMTP_PORT || '587', 10);
  if (!host || !from || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;
  if (Boolean(user) !== Boolean(pass)) return null;
  return {
    from,
    transport: nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      ...(user && pass ? { auth: { user, pass } } : {}),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    }),
  };
}

function passwordResetUrl(token: string): string {
  const base = process.env.APP_BASE_URL?.trim() || FRONTEND_ORIGIN;
  if (!isSafePasswordResetBase(base, {
    nodeEnv: process.env.NODE_ENV || 'development',
    frontendOrigin: FRONTEND_ORIGIN,
    host: process.env.HOST?.trim() || '127.0.0.1',
    trustProxy: process.env.TRUST_PROXY === 'true',
  })) {
    fail(503, 'خدمة الاستعادة غير مهيأة؛ يرجى التواصل مع إدارة المدرسة');
  }
  const url = new URL(base);
  url.pathname = '/';
  url.searchParams.set('reset_token', token);
  return url.toString();
}

const blockedStateKeys = new Set(['pass','password','passhash','passwordhash','salt','apikey','token','accesstoken','refreshtoken','licensekey','secret','secretkey','authorization','devicehash','devicefingerprint','data','blob','base64','filedata']);
function isSensitiveStateKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return blockedStateKeys.has(normalized) || /password|passwd|passhash|token|secret|credential|authorization|cookie|devicehash|devicefingerprint|privatekey|licensekey/.test(normalized);
}
function sanitizeState(input: unknown): any {
  // Inline file payloads are never valid durable school data. Remove legacy data URLs
  // so a stale client cannot re-inject base64 attachments into PostgreSQL.
  if (typeof input === 'string' && /^(?:data:|blob:|idb:)/i.test(input.trim())) return '';
  if (Array.isArray(input)) return input.map(sanitizeState);
  if (input && typeof input === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (!isSensitiveStateKey(key) && !['classes', 'classid', 'class_id'].includes(key.toLowerCase())) output[key] = sanitizeState(value);
    }
    return output;
  }
  return input;
}
function filterState(raw: any, claims: Claims, parentIds: string[] | null = null): any {
  if (claims.role === 'admin') return sanitizeState(raw);
  const state = raw && typeof raw === 'object' && !Array.isArray(raw) ? structuredClone(raw) : {};
  const id = claims.sub;
  const linkedIds: string[] = claims.role === 'parent' ? (parentIds || []) : claims.role === 'student' ? [id] : [];
  const sourceStudents: any[] = Array.isArray(state.students) ? state.students : [];
  const allTeachers: any[] = Array.isArray(state.teachers) ? state.teachers : [];
  const teacher = allTeachers.find(t => String(t?.id) === id);
  const teacherGrades: string[] = claims.role === 'teacher' && Array.isArray(teacher?.grades) ? teacher.grades.map(String) : [];
  const selfGrade = sourceStudents.find(s => String(s?.id) === id)?.grade;
  const parentGrades = sourceStudents.filter(s => linkedIds.includes(String(s?.id))).map(s => s?.grade).filter(Boolean).map(String);
  const allowedGrades: string[] = claims.role === 'teacher' ? teacherGrades : claims.role === 'parent' ? parentGrades : selfGrade ? [String(selfGrade)] : [];
  state.students = sourceStudents.filter(s => claims.role === 'teacher' ? teacherGrades.includes(String(s?.grade || '')) : linkedIds.includes(String(s?.id))).map((student: any) => {
    const safe = { ...student };
    for (const privateField of ['adminNote','internalNotes','privateNotes','disciplinaryNotes','healthNotes','medicalNotes','parentNotes']) delete safe[privateField];
    if (claims.role === 'teacher') {
      for (const privateField of ['email','birthDate','phone','parentPhone','parent_phone','address','guardianName','guardianPhone','emergencyContact','files','documents']) delete safe[privateField];
    }
    return safe;
  });
  // Never broadcast the parent directory or private contact information to every authenticated user.
  // A parent receives only their own record with relations resolved from the link table.
  if (Array.isArray(state.parents)) {
    state.parents = claims.role === 'parent'
      ? state.parents.filter((p: any) => String(p?.id) === id).map((p: any) => ({ ...p, studentIds: [...linkedIds] }))
      : [];
  }
  // Teacher names/subjects are usable as public school directory data; contact details remain private.
  if (Array.isArray(state.teachers)) {
    state.teachers = state.teachers.map((t: any) => {
      const copy = { ...t };
      if (!(claims.role === 'teacher' && String(t?.id) === id)) {
        for (const field of ['email','phone','address','birthDate','files','documents','adminNote','internalNotes','privateNotes','password','passHash']) delete copy[field];
      }
      return copy;
    });
  }
  const scopedStudentIds: string[] = claims.role === 'teacher' ? state.students.map((s: any) => String(s.id)) : linkedIds;

  const belongsToStudent = (x: any, ids: string[]) => ids.includes(String(x?.student ?? x?.studentId ?? x?.student_id ?? x?.ownerId ?? ''));
  const belongsToTeacherScope = (x: any) => String(x?.teacher ?? x?.teacherId ?? '') === id || allowedGrades.includes(String(x?.grade || '')) || (x?.student != null && scopedStudentIds.includes(String(x.student))) || (x?.studentId != null && scopedStudentIds.includes(String(x.studentId)));
  if (Array.isArray(state.grades)) state.grades = state.grades.filter((x: any) => claims.role === 'teacher' ? belongsToTeacherScope(x) : belongsToStudent(x, linkedIds));
  for (const key of ['achievements','submissions','certificates','projects','payments','ministryAttempts','ministryEvaluations','examResults','platformRedemptions']) {
    if (Array.isArray(state[key])) state[key] = state[key].filter((x: any) => claims.role === 'teacher' ? (key === 'submissions' || key === 'examResults' || key === 'ministryAttempts' ? belongsToTeacherScope(x) : false) : belongsToStudent(x, linkedIds));
  }
  if (state.attendance && typeof state.attendance === 'object') for (const key of Object.keys(state.attendance)) if (!scopedStudentIds.includes(key)) delete state.attendance[key];
  if (Array.isArray(state.attendanceSessions)) delete state.attendanceSessions;
  for (const key of ['assignments','exams','subjects','lessonLinks','library','mkLibrary','courses','schedule']) {
    if (!Array.isArray(state[key])) continue;
    state[key] = state[key].filter((x: any) => {
      if (key === 'exams' && claims.role === 'teacher') return String(x?.teacher ?? x?.teacherId ?? '') === id;
      if (claims.role === 'teacher') {
        if (key === 'courses') {
          return teacherOwnsCourse(id, x);
        }
        return belongsToTeacherScope(x);
      }
      const itemGrade = String(x?.grade ?? x?.gradeId ?? '').trim();
      if (itemGrade && !allowedGrades.includes(itemGrade)) return false;
      if ((claims.role === 'student' || claims.role === 'parent') && key === 'exams') {
        // Draft/unpublished exams must never be exposed; the submit route also re-checks eligibility.
        if (x?.active === false || x?.published === false || x?.disabled === true) return false;
        if (!itemGrade || !allowedGrades.includes(itemGrade)) return false;
        if (x?.courseId) {
          const course = (Array.isArray(state.courses) ? state.courses : []).find((item: any) => String(item?.id) === String(x.courseId));
          const eligibleIds = claims.role === 'student' ? [id] : linkedIds;
          if (!course || !eligibleIds.some(studentId => isCourseExamEnrolled(course, studentId))) return false;
        }
      }
      if ((claims.role === 'student' || claims.role === 'parent') && key === 'assignments') {
        if (x?.active === false || x?.published === false || x?.draft === true) return false;
        const explicitTargets = [x?.student, x?.studentId, x?.student_id, ...(Array.isArray(x?.studentIds) ? x.studentIds : [])]
          .map((value: any) => String(typeof value === 'object' ? value?.id : value ?? '')).filter(Boolean);
        if (!itemGrade && !explicitTargets.some((target: string) => linkedIds.includes(target))) return false;
      }
      return true;
    });
    state[key] = state[key].map((x: any) => {
      if (!x || typeof x !== 'object') return x;
      const copy = { ...x };
      for (const listKey of ['enrollments','pending','studentIds','students']) if (Array.isArray(copy[listKey])) copy[listKey] = copy[listKey].filter((sid: any) => scopedStudentIds.includes(String(typeof sid === 'object' ? sid?.id : sid)));
      if (key === 'courses' && (claims.role === 'student' || claims.role === 'parent') && Array.isArray(copy.lessons)) {
        const dates = copy.enrolledAtByStudent && typeof copy.enrolledAtByStudent === 'object' ? copy.enrolledAtByStudent : {};
        const eligibleIds = claims.role === 'student' ? [id] : linkedIds;
        copy.lessons = copy.lessons.map((lesson: any, index: number) => {
          const open = eligibleIds.some(studentId => {
            if (!Array.isArray(x?.enrollments) || !x.enrollments.map(String).includes(studentId)) return false;
            return lessonReleaseIsOpen(lesson, x, dates[studentId]);
          });
          const releaseAt = typeof lesson?.releaseAt === 'string' ? lesson.releaseAt : '';
          const label = releaseAt ? `محتوى متاح في ${new Date(releaseAt).toLocaleString('ar-EG')}` : `محتوى الأسبوع ${Number(lesson?.releaseWeek ?? lesson?.week ?? index + 1)} متاح لاحقًا`;
          return open ? lesson : { id: lesson?.id || `locked_${index}`, title: label, releaseAt, releaseWeek: lesson?.releaseWeek ?? lesson?.week ?? 1, videoRef: '', videoUrl: '', description: '', duration: '', locked: true };
        });
        delete copy.enrolledAtByStudent;
      }
      if (key === 'exams' && (claims.role === 'student' || claims.role === 'parent') && Array.isArray(copy.questions)) {
        // Correct-answer keys must remain server-side, including nested option flags and legacy tuples.
        const stripAnswerMaterial = (value: any): any => {
          if (Array.isArray(value)) return value.map(stripAnswerMaterial);
          if (!value || typeof value !== 'object') return value;
          const clean: Record<string, unknown> = {};
          for (const [field, fieldValue] of Object.entries(value)) {
            const normalized = field.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normalized.includes('answer') || normalized.includes('correct') || normalized.includes('solution') || normalized.includes('explanation')) continue;
            clean[field] = stripAnswerMaterial(fieldValue);
          }
          return clean;
        };
        copy.questions = copy.questions.map((question: any) => Array.isArray(question)
          ? [question[0], stripAnswerMaterial(question[1])]
          : stripAnswerMaterial(question));
      }
      if (key === 'assignments' && (claims.role === 'student' || claims.role === 'parent')) {
        const eligibleStudentIds = claims.role === 'student' ? [id] : linkedIds;
        const submitted = (Array.isArray(state.submissions) ? state.submissions : []).some((submission: any) =>
          eligibleStudentIds.includes(String(submission?.student ?? submission?.studentId ?? '')) && String(submission?.assignment ?? submission?.assignmentId ?? '') === String(copy.id));
        if (!submitted) delete copy.solutionVideoUrl;
        if (Array.isArray(copy.questions)) {
          copy.questions = copy.questions.map((question: any) => {
            if (!question || typeof question !== 'object') return question;
            const safeQuestion = { ...question };
            for (const field of ['answer','answerIndex','correct','correctAnswer','solution','explanation']) delete safeQuestion[field];
            return safeQuestion;
          });
        }
      }
      return copy;
    });
  }
  if (Array.isArray(state.notifications)) state.notifications = state.notifications.filter((x: any) => String(x?.to || '') === id || String(x?.to || '') === 'all');
  if (Array.isArray(state.messages)) state.messages = state.messages.filter((x: any) => String(x?.to || '') === id || String(x?.from || '') === id);
  if (Array.isArray(state.complaints)) state.complaints = state.complaints.filter((x: any) => claims.role === 'teacher' ? belongsToTeacherScope(x) : [x?.studentId,x?.student,x?.from,x?.userId].some(v => v != null && (String(v) === id || linkedIds.includes(String(v)))));
  if (Array.isArray(state.communityTopics)) state.communityTopics = state.communityTopics.filter((x: any) => x?.status === 'approved' || String(x?.authorId ?? x?.userId ?? '') === id);
  if (state.platformPoints && typeof state.platformPoints === 'object') for (const key of Object.keys(state.platformPoints)) if (!scopedStudentIds.includes(key)) delete state.platformPoints[key];
  if (Array.isArray(state.mkLibrary)) state.mkLibrary = state.mkLibrary.filter((x: any) => !x?.private && !x?.teacherOnly || (claims.role === 'teacher' && String(x?.teacher ?? x?.teacherId ?? '') === id));
  if (claims.role === 'teacher') {
    // Teachers can open only their assigned courses, not the school-wide reading libraries.
    delete state.library;
    delete state.mkLibrary;
    delete state.platformLibrary;
  } else if (Array.isArray(state.platformLibrary)) state.platformLibrary = state.platformLibrary.filter((x: any) => {
    if (!x || x.active === false) return false;
    const grade = String(x.grade ?? '').trim();
    return !grade || allowedGrades.includes(grade);
  });
  // Keep only a teacher's own questions; answer keys are never returned to students or parents.
  if (claims.role === 'teacher' && Array.isArray(state.questionBank)) state.questionBank = state.questionBank.filter((q: any) => String(q?.teacher ?? q?.teacherId ?? '') === id); else delete state.questionBank;
  // Audit logs, user directory, and private AI conversation history are never broadcast to non-admins.
  delete state.audit; delete state.auditLogs; delete state.users; delete state.apiKeys; delete state.aiHistory; delete state.aiConversations;
  if (state.courseProgress && typeof state.courseProgress === 'object') state.courseProgress = Object.fromEntries(Object.entries(state.courseProgress).filter(([key]) => scopedStudentIds.some(sid => key.endsWith(`::${sid}`))));
  if (state.videoViews && typeof state.videoViews === 'object') state.videoViews = Object.fromEntries(Object.entries(state.videoViews).filter(([key]) => scopedStudentIds.some(sid => key.endsWith(`::${sid}`))));
  // Include the empty collection so first-time students can submit payment requests
  // through the record-level sync API without granting access to other students' rows.
  if (claims.role === 'student' && !Array.isArray(state.payments)) state.payments = [];
  state.teachers = allTeachers.filter((t: any) => claims.role === 'teacher' ? String(t?.id) === id : true).map((t: any) => ({ id: String(t?.id || ''), name: String(t?.name || ''), subject: String(t?.subject || ''), grades: Array.isArray(t?.grades) ? t.grades.map(String) : [], active: t?.active !== false }));
  if (claims.role === 'parent') state.parents = [{ id, studentIds: [...(parentIds || [])] }];
  else delete state.parents;
  return sanitizeState(state);
}
function mergeArrayById(base: any[], incoming: any[], allowed: (item: any) => boolean): any[] {
  const accepted = incoming.filter(allowed).filter((item:any) => typeof item?.id === 'string');
  const acceptedIds = new Set(accepted.map((item:any) => String(item.id)));
  // Deletions are honored only for records the authenticated role owns; all other records survive.
  const output = base.filter((item:any) => !allowed(item) || acceptedIds.has(String(item?.id ?? '')));
  for (const item of accepted) {
    const index = output.findIndex((x:any) => String(x?.id) === String(item.id));
    if (index >= 0) { if (allowed(output[index])) output[index] = item; }
    else output.push(item);
  }
  return output;
}
function mergeState(baseInput: any, incomingInput: any, claims: Claims): any {
  const incoming = sanitizeState(incomingInput);
  if (claims.role === 'admin') return incoming;
  const base = baseInput && typeof baseInput === 'object' && !Array.isArray(baseInput) ? structuredClone(baseInput) : {};
  const incomingObj = incoming && typeof incoming === 'object' && !Array.isArray(incoming) ? incoming : {};
  const id = claims.sub;
  const sourceStudents = Array.isArray(base.students) ? base.students : [];
  const teacherGrades: string[] = (base.teachers || []).find((x: any) => String(x?.id) === id)?.grades || [];
  const ownStudent = (x: any) => String(x?.student ?? x?.studentId ?? '') === id;
  const teacherScope = (x: any) => String(x?.teacher ?? x?.teacherId ?? '') === id || teacherGrades.includes(String(x?.grade || ''));
  const mergeKey = (key: string, allow: (x: any) => boolean) => { base[key] = mergeArrayById(Array.isArray(base[key]) ? base[key] : [], Array.isArray(incomingObj[key]) ? incomingObj[key] : [], allow); };
  if (claims.role === 'teacher') {
    const teacherOwns = (x: any) => String(x?.teacher ?? x?.teacherId ?? '') === id;
    const ownAssignmentIds = new Set((Array.isArray(base.assignments) ? base.assignments : []).filter(teacherOwns).map((x: any) => String(x.id)));
    // Assignment content and the essay/choice format are administrator-controlled.
    // Teachers receive assigned submissions for grading but cannot create or rewrite assignments.
    // Course-linked exams and their links are administrator-controlled. Teachers may
    // still create and edit their independent exams.
    mergeKey('exams', (x: any) => teacherOwns(x) && !String(x?.courseId ?? '').trim());
    mergeKey('grades', teacherOwns);
    mergeKey('teacherNotes', teacherOwns);
    mergeKey('schedule', teacherOwns);
    // A teacher may review submissions only for their own assignments or records explicitly assigned to them.
    mergeKey('submissions', (x: any) => teacherOwns(x) || ownAssignmentIds.has(String(x?.assignment ?? x?.assignmentId ?? '')));
    if (base.attendance && incomingObj.attendance) for (const [sid, val] of Object.entries(incomingObj.attendance)) if (sourceStudents.some((s: any) => String(s?.id) === sid && teacherGrades.includes(String(s?.grade || '')))) base.attendance[sid] = val;
  } else if (claims.role === 'student') {
    for (const key of ['submissions','complaints','achievements']) mergeKey(key, ownStudent);
    // Student payment requests are append-only. Approval, rejection, and deletion are
    // administrator actions; never trust a student's status/amount edits from the client.
    const existingPayments = Array.isArray(base.payments) ? base.payments : [];
    const submittedPayments = (Array.isArray(incomingObj.payments) ? incomingObj.payments : [])
      .filter((x:any) => String(x?.studentId ?? '') === id && x?.status === 'pending' && x?.provider === 'vodafone_cash');
    const paymentIds = new Set(existingPayments.map((x:any) => String(x?.id ?? '')));
    base.payments = [...existingPayments, ...submittedPayments.filter((x:any) => !paymentIds.has(String(x?.id ?? '')))];
    const existingNotifications = Array.isArray(base.notifications) ? base.notifications : [];
    const knownNotificationIds = new Set(existingNotifications.map((x:any) => String(x?.id ?? '')));
    const studentName = (Array.isArray(base.students) ? base.students : []).find((x:any) => String(x?.id) === id)?.name || id;
    const paymentItemName = (p:any) => p?.kind === 'library'
      ? (Array.isArray(base.platformLibrary) ? base.platformLibrary : []).find((x:any) => String(x?.id) === String(p?.resourceId))?.title || p?.resourceTitle || 'مورد من المكتبة'
      : (Array.isArray(base.courses) ? base.courses : []).find((x:any) => String(x?.id) === String(p?.courseId))?.title || p?.courseId;
    base.notifications = [...existingNotifications, ...submittedPayments.filter((p:any) => !knownNotificationIds.has(`payment_${p.id}`)).map((p:any) => ({
      id: `payment_${p.id}`, to: 'admin', title: 'طلب مراجعة دفع جديد',
      body: `${studentName} أرسل طلب دفع Vodafone Cash لـ${p?.kind === 'library' ? 'مورد المكتبة' : 'دورة'} ${paymentItemName(p)}`,
      date: p.createdAt, read: false, paymentId: p.id,
    }))];
    mergeKey('messages', x => String(x?.from || '') === id);
    for (const key of ['courseProgress','videoViews']) if (incomingObj[key] && typeof incomingObj[key] === 'object') base[key] = Object.fromEntries(Object.entries(incomingObj[key]).filter(([k]) => k.endsWith(`::${id}`)));
  } else if (claims.role === 'parent') {
    const ids = (base.parents || []).find((p: any) => String(p?.id) === id)?.studentIds || [];
    mergeKey('complaints', x => ids.includes(String(x?.studentId || '')));
    mergeKey('messages', x => String(x?.from || '') === id);
  }
  // Community posts are member-created, but moderation fields and author identity are server-owned.
  if (claims.role !== 'admin') {
    const existingTopics = Array.isArray(base.communityTopics) ? base.communityTopics : [];
    const incomingTopics = Array.isArray(incomingObj.communityTopics) ? incomingObj.communityTopics : [];
    const existingById = new Map(existingTopics.map((topic:any) => [String(topic?.id ?? ''), topic]));
    const actorProfile = [...(Array.isArray(base.students)?base.students:[]), ...(Array.isArray(base.teachers)?base.teachers:[]), ...(Array.isArray(base.parents)?base.parents:[])].find((item:any) => String(item?.id) === id);
    const actorName = String(actorProfile?.name || actorProfile?.fullName || id).slice(0,120);
    const accepted = incomingTopics.filter((topic:any) => topic && typeof topic.id === 'string' && String(topic.authorId ?? '') === id && String(topic.authorRole ?? '') === claims.role && ['scientific','support'].includes(String(topic.category)) && String(topic.title ?? '').trim().length > 0 && String(topic.body ?? '').trim().length > 0).map((topic:any) => {
      const old:any = existingById.get(String(topic.id));
      if (old) {
        if (String(old.authorId) !== id || old.status !== 'pending') return old;
        return { ...old, title: String(topic.title).slice(0,160), body: String(topic.body).slice(0,6000), category: topic.category, attachment: topic.attachment || null };
      }
      return { id: String(topic.id), authorId: id, authorRole: claims.role, authorName: actorName, category: topic.category, title: String(topic.title).slice(0,160), body: String(topic.body).slice(0,6000), attachment: topic.attachment || null, status: 'pending', createdAt: new Date().toISOString(), comments: [] };
    });
    const incomingIds = new Set(accepted.map((topic:any) => String(topic.id)));
    base.communityTopics = [...existingTopics.filter((topic:any) => String(topic.authorId ?? '') !== id || topic.status !== 'pending' || incomingIds.has(String(topic.id))), ...accepted.filter((topic:any) => !existingById.has(String(topic.id)))];
  }
  delete base.users;
  return base;
}

type StateQueryable = { query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }> };
const stateKind = (value: any): 'array' | 'object' | 'scalar' => Array.isArray(value) ? 'array' : value !== null && typeof value === 'object' ? 'object' : 'scalar';
const stateItemKey = (value: any, index: number): string => String(value && typeof value === 'object' && value.id != null && String(value.id) ? value.id : `@${index}`).slice(0,255);
async function readPlatformState(db: StateQueryable): Promise<Record<string, any>> {
  const rows = await db.query(`SELECT c.collection_key,c.collection_kind,c.scalar_value,i.item_key,i.item_value,i.ordinal
    FROM platform_state_collections c LEFT JOIN platform_state_items i ON i.collection_key=c.collection_key
    ORDER BY c.collection_key,i.ordinal,i.item_key`);
  const state: Record<string, any> = {};
  for (const row of rows.rows) {
    const key = String(row.collection_key);
    if (!(key in state)) state[key] = row.collection_kind === 'array' ? [] : row.collection_kind === 'object' ? {} : row.scalar_value;
    if (row.item_key == null) continue;
    if (row.collection_kind === 'array') state[key].push(row.item_value);
    else if (row.collection_kind === 'object') state[key][String(row.item_key)] = row.item_value;
  }
  return state;
}
async function getCourseEnrollment(db: StateQueryable, studentId: string, courseId: string, state?: Record<string, any>): Promise<{ course: any; enrolledAt: Date }> {
  const platformState = state || await readPlatformState(db);
  const course = (Array.isArray(platformState.courses) ? platformState.courses : []).find((item: any) => String(item?.id) === courseId);
  if (!course || course.active === false) fail(404, 'الدورة غير متاحة');
  const enrollment = (await db.query('SELECT enrolled_at FROM course_enrollments WHERE course_id=$1 AND student_id=$2 AND active=TRUE', [courseId, studentId])).rows[0];
  const listed = Array.isArray(course.enrollments) && course.enrollments.map(String).includes(studentId);
  if (!enrollment || !listed) fail(403, 'يجب الاشتراك في الدورة أولًا');
  return { course, enrolledAt: enrollment.enrolled_at instanceof Date ? enrollment.enrolled_at : new Date(enrollment.enrolled_at) };
}
async function requireReleasedCourseLesson(db: StateQueryable, studentId: string, courseId: string, lessonIndex: number, state?: Record<string, any>): Promise<{ course: any; lesson: any; enrolledAt: Date }> {
  const enrollment = await getCourseEnrollment(db, studentId, courseId, state);
  const lessons = Array.isArray(enrollment.course.lessons) ? enrollment.course.lessons : [];
  const lesson = lessons[lessonIndex];
  if (!lesson) fail(404, 'الدرس غير موجود في الدورة');
  if (!lessonReleaseIsOpen(lesson, enrollment.course, enrollment.enrolledAt)) {
    fail(403, 'لم يحن موعد إتاحة هذا المحتوى بعد');
  }
  return { ...enrollment, lesson };
}
async function requireCourseVideosComplete(db: StateQueryable, studentId: string, courseId: string, state?: Record<string, any>): Promise<void> {
  const enrollment = await getCourseEnrollment(db, studentId, courseId, state);
  const lessons = Array.isArray(enrollment.course.lessons) ? enrollment.course.lessons : [];
  for (let index = 0; index < lessons.length; index++) {
    const lesson = lessons[index], ref = str(lesson?.videoRef || lesson?.videoUrl).trim();
    if (!ref) continue;
    if (!lessonReleaseIsOpen(lesson, enrollment.course, enrollment.enrolledAt)) continue;
    const watched = (await db.query('SELECT watched_seconds,duration_seconds,completed_at FROM course_lesson_watch_progress WHERE course_id=$1 AND student_id=$2 AND lesson_index=$3', [courseId, studentId, index])).rows[0];
    if (!watched?.completed_at || !watchedEnough(watched.watched_seconds, watched.duration_seconds)) fail(403, 'شاهد كل فيديو في الدورة حتى نهايته قبل فتح الاختبار أو تسليم الواجب');
  }
}
function courseVideoAccessId(course: any, lesson: any, index: number): string {
  const ref = str(lesson?.videoRef || lesson?.videoUrl).trim();
  if (ref.startsWith('hls:video-engine:')) return safeId(ref.slice('hls:video-engine:'.length).split('|')[0]);
  if (/^https?:\/\//i.test(ref)) return safeId(`external_${String(lesson?.id || `${course?.id}_${index}`).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 240)}`);
  return '';
}
function parseCourseDuration(value: unknown): number | null {
  const raw = str(value).trim();
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const seconds = Math.round(Number(raw));
    return Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 86400 ? seconds : null;
  }
  const parts = raw.split(':');
  if ((parts.length !== 2 && parts.length !== 3) || parts.some(part => !/^\d{1,2}$/.test(part))) return null;
  const numbers = parts.map(Number);
  const [first, second, third] = numbers;
  if (first == null || second == null || (parts.length === 3 && third == null)) return null;
  if (numbers.slice(1).some(part => part >= 60)) return null;
  const seconds = parts.length === 2 ? first * 60 + second : first * 3600 + second * 60 + (third || 0);
  return Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 86400 ? seconds : null;
}
async function trustedCourseDuration(lesson: any): Promise<number | null> {
  const ref = str(lesson?.videoRef || lesson?.videoUrl).trim();
  if (ref.startsWith('hls:video-engine:')) {
    const videoId = safeId(ref.slice('hls:video-engine:'.length).split('|')[0]);
    const playlist = await readFile(path.join(MEDIA_ROOT, 'hls', videoId, 'playlist.m3u8'), 'utf8').catch(() => '');
    const segments = [...playlist.matchAll(/^#EXTINF:([\d.]+)/gm)].map(match => Number(match[1])).filter(value => Number.isFinite(value) && value > 0);
    const total = segments.reduce((sum, value) => sum + value, 0);
    if (total > 0 && total <= 86400) return Math.round(total);
  }
  return parseCourseDuration(lesson?.duration);
}
async function requireReleasedCourseVideo(db: StateQueryable, studentId: string, videoId: string): Promise<void> {
  const relations = await db.query('SELECT course_id FROM course_videos WHERE video_id=$1', [videoId]);
  if (!relations.rowCount) return;
  const state = await readPlatformState(db);
  for (const relation of relations.rows) {
    const courseId = String(relation.course_id);
    const course = (Array.isArray(state.courses) ? state.courses : []).find((item: any) => String(item?.id) === courseId);
    if (!course) continue;
    const lessons = Array.isArray(course.lessons) ? course.lessons : [];
    const index = lessons.findIndex((lesson: any, i: number) => courseVideoAccessId(course, lesson, i) === videoId);
    if (index >= 0) await requireReleasedCourseLesson(db, studentId, courseId, index, state);
  }
}
function recordEntries(key: string, value: any): Array<{key:string;value:any;ordinal:number}> {
  if (Array.isArray(value)) return value.map((item:any,index:number)=>({key:stateItemKey(item,index),value:item,ordinal:index}));
  if (value && typeof value === 'object') return Object.entries(value).map(([k,v])=>({key:String(k).slice(0,255),value:v,ordinal:0}));
  return [];
}
async function persistPlatformState(db: StateQueryable, current: Record<string, any>, target: Record<string, any>, actor: string): Promise<void> {
  const keys = new Set([...Object.keys(current), ...Object.keys(target)]);
  for (const key of keys) {
    if (key.length > 255) fail(400, 'platform state collection key is too long');
    if (!(key in target)) { await db.query('DELETE FROM platform_state_collections WHERE collection_key=$1',[key]); continue; }
    const value = target[key];
    const kind = stateKind(value);
    const previousKind = key in current ? stateKind(current[key]) : null;
    if (kind === 'scalar') {
      await db.query(`INSERT INTO platform_state_collections(collection_key,collection_kind,scalar_value,updated_by)
        VALUES($1,'scalar',$2::jsonb,$3) ON CONFLICT(collection_key) DO UPDATE SET collection_kind='scalar',scalar_value=EXCLUDED.scalar_value,updated_at=now(),updated_by=EXCLUDED.updated_by
        WHERE platform_state_collections.collection_kind IS DISTINCT FROM 'scalar' OR platform_state_collections.scalar_value IS DISTINCT FROM EXCLUDED.scalar_value`, [key, JSON.stringify(value), actor]);
      if (previousKind && previousKind !== 'scalar') await db.query('DELETE FROM platform_state_items WHERE collection_key=$1',[key]);
      continue;
    }
    if (previousKind && previousKind !== kind) await db.query('DELETE FROM platform_state_items WHERE collection_key=$1',[key]);
    await db.query(`INSERT INTO platform_state_collections(collection_key,collection_kind,scalar_value,updated_by)
      VALUES($1,$2,NULL,$3) ON CONFLICT(collection_key) DO UPDATE SET collection_kind=EXCLUDED.collection_kind,scalar_value=NULL,updated_at=now(),updated_by=EXCLUDED.updated_by
      WHERE platform_state_collections.collection_kind IS DISTINCT FROM EXCLUDED.collection_kind OR platform_state_collections.scalar_value IS NOT NULL`, [key,kind,actor]);
    const existingEntries = recordEntries(key, current[key]);
    const existing = new Map(existingEntries.map(row=>[row.key,row]));
    const desired = recordEntries(key, value);
    const desiredKeys = new Set<string>();
    for (const row of desired) {
      if (!row.key) fail(400, 'platform state record key is empty');
      desiredKeys.add(row.key);
      const before = existing.get(row.key);
      if (!before || JSON.stringify(before.value) !== JSON.stringify(row.value) || before.ordinal !== row.ordinal || previousKind !== kind) {
        await db.query(`INSERT INTO platform_state_items(collection_key,item_key,item_value,ordinal,updated_by)
          VALUES($1,$2,$3::jsonb,$4,$5) ON CONFLICT(collection_key,item_key) DO UPDATE SET item_value=EXCLUDED.item_value,ordinal=EXCLUDED.ordinal,updated_at=now(),updated_by=EXCLUDED.updated_by
          WHERE platform_state_items.item_value IS DISTINCT FROM EXCLUDED.item_value OR platform_state_items.ordinal IS DISTINCT FROM EXCLUDED.ordinal`, [key,row.key,JSON.stringify(row.value),row.ordinal,actor]);
      }
    }
    for (const row of existingEntries) if (!desiredKeys.has(row.key)) await db.query('DELETE FROM platform_state_items WHERE collection_key=$1 AND item_key=$2',[key,row.key]);
  }
}

async function initDatabase(): Promise<void> {
  await mkdir(MEDIA_ROOT, { recursive: true });
  await mkdir(path.join(MEDIA_ROOT, 'uploads'), { recursive: true });
  await mkdir(path.join(MEDIA_ROOT, 'hls'), { recursive: true });
  await pool.query('SELECT 1');
  const migrationsDir = path.join(ROOT, 'migrations');
  const files = (await readdir(migrationsDir)).filter(f => /^\d+.*\.sql$/.test(f)).sort();
  for (const file of files) await pool.query(await readFile(path.join(migrationsDir, file), 'utf8'));
  await resumeInterruptedVideoJobs();
  const email = process.env.VIDEO_BOOTSTRAP_ADMIN_EMAIL?.trim();
  const password = process.env.VIDEO_BOOTSTRAP_ADMIN_PASSWORD;
  const existing = await pool.query("SELECT id,role FROM video_users WHERE id='admin' LIMIT 1");
  if (existing.rowCount) {
    if (existing.rows[0]?.role !== 'admin') throw new Error('The account ID \"admin\" exists but is not an administrator; resolve the account conflict before startup.');
    console.info('[startup] bootstrap admin already exists; existing password retained');
  } else {
    const placeholder = (value: string | undefined) => !value || /^(CHANGE|SET_|REPLACE|YOUR_)/i.test(value.trim());
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320 || placeholder(email) || placeholder(password) || String(password).length < 12) {
      throw new Error('No admin account exists. Configure VIDEO_BOOTSTRAP_ADMIN_EMAIL and a unique VIDEO_BOOTSTRAP_ADMIN_PASSWORD (at least 12 characters; never leave example placeholders) in the root .env file.');
    }
    const hash = await argon2.hash(password!, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    await pool.query("INSERT INTO video_users(id,role,email,password,active) VALUES('admin','admin',$1,$2,TRUE)", [email, hash]);
    console.info('[startup] bootstrap admin created');
  }
}

app.get('/health/live', (_req, res) => res.status(200).json({ status: 'ok' }));
const readinessHandler = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await pool.query('SELECT 1');
    if (!redis.isReady) fail(503, 'service dependencies are not ready');
    await redis.ping();
    res.status(200).json({ status: 'ok' });
  } catch (error) { next(error); }
};
app.get('/health/ready', readinessHandler);
// Keep the original health endpoint for existing local launchers and reverse proxies.
app.get('/health', readinessHandler);
app.post('/api/v1/auth/password-reset/request', passwordResetRequestIpLimiter, passwordResetRequestEmailLimiter, async (req, res, next) => {
  try {
    const email = str(req.body?.email).trim().toLowerCase();
    if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'أدخل بريدًا إلكترونيًا صحيحًا');
    const smtp = createSmtpTransport();
    if (!smtp) return fail(503, 'خدمة استعادة كلمة المرور غير مهيأة بعد؛ يرجى التواصل مع إدارة المدرسة');
    const smtpTransport = smtp.transport;
    const smtpFrom = smtp.from;

    const account = (await pool.query("SELECT id,email FROM video_users WHERE lower(email)=lower($1) AND active=TRUE LIMIT 1", [email])).rows[0];
    if (account) {
      const token = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const link = passwordResetUrl(token);
      await pool.query('UPDATE password_reset_tokens SET used_at=COALESCE(used_at,now()) WHERE user_id=$1 AND used_at IS NULL', [account.id]);
      await pool.query('INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval \'20 minutes\')', [tokenHash, account.id]);
      try {
        await smtpTransport.sendMail({
          from: smtpFrom,
          to: String(account.email),
          subject: 'إعادة تعيين كلمة مرور MK School',
          text: `وصلنا طلب لإعادة تعيين كلمة مرور حسابك في MK School. افتح الرابط التالي خلال 20 دقيقة لاختيار كلمة مرور جديدة:\n\n${link}\n\nإذا لم تطلب ذلك، تجاهل هذه الرسالة.`,
          html: `<div dir="rtl" lang="ar" style="font-family:Arial,sans-serif;line-height:1.8;color:#172554"><h2>إعادة تعيين كلمة المرور</h2><p>وصلنا طلب لإعادة تعيين كلمة مرور حسابك في MK School.</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#315efb;color:#fff;text-decoration:none">اختيار كلمة مرور جديدة</a></p><p>الرابط صالح لمدة 20 دقيقة ويُستخدم مرة واحدة.</p><p>إذا لم تطلب ذلك، تجاهل هذه الرسالة.</p></div>`,
        });
      } catch (error) {
        await pool.query('UPDATE password_reset_tokens SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL', [tokenHash]).catch(() => {});
        console.error('[password-reset-email] delivery failed:', error instanceof Error ? error.name : 'unknown error');
        fail(503, 'تعذر إرسال رسالة الاستعادة الآن؛ حاول لاحقًا أو تواصل مع إدارة المدرسة');
      }
    }
    // Use the same successful response for known and unknown accounts to prevent account discovery.
    res.status(202).json({ message: 'إذا كان البريد مرتبطًا بحساب نشط، ستصلك رسالة برابط استعادة صالح لمدة 20 دقيقة.' });
  } catch (e) { next(e); }
});

app.post('/api/v1/auth/password-reset/complete', passwordResetCompleteLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const token = str(req.body?.token).trim();
    const password = str(req.body?.password);
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) fail(400, 'رابط الاستعادة غير صالح أو منتهي؛ اطلب رابطًا جديدًا');
    if (password.length < 8 || password.length > 1024) fail(400, 'كلمة المرور يجب أن تكون بين 8 و1024 حرفًا');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    await client.query('BEGIN');
    const row = (await client.query(
      `SELECT t.user_id FROM password_reset_tokens t
       JOIN video_users u ON u.id=t.user_id
       WHERE t.token_hash=$1 AND t.used_at IS NULL AND t.expires_at>now() AND u.active=TRUE
       FOR UPDATE OF t,u`, [tokenHash],
    )).rows[0];
    if (!row) fail(400, 'رابط الاستعادة غير صالح أو منتهي؛ اطلب رابطًا جديدًا');
    const userId = String(row.user_id);
    await client.query('UPDATE video_users SET password=$2,session_version=session_version+1 WHERE id=$1 AND active=TRUE', [userId, hash]);
    await client.query('UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL', [userId]);
    await client.query('COMMIT');
    await audit(userId, 'self_service_password_reset', 'password reset token consumed; prior sessions revoked');
    clearAuthCookie(res);
    res.json({ status: 'ok', message: 'تم تغيير كلمة المرور. سجّل الدخول الآن بكلمة المرور الجديدة.' });
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e); }
  finally { client.release(); }
});

app.post('/api/v1/auth/login', loginIpLimiter, loginIdentityLimiter, async (req, res, next) => {
  try {
    const identifier = str(req.body?.identifier).trim(), password = str(req.body?.password), device = str(req.body?.device_fingerprint).trim();
    if (!identifier || !password) fail(400, 'identifier and password are required');
    const result = await pool.query('SELECT id,role,password,active,session_version,parent_phone FROM video_users WHERE lower(email)=lower($1) OR lower(id)=lower($1) LIMIT 1', [identifier]);
    const user = result.rows[0];
    if (!user || user.active !== true || !ALLOWED_ROLES.has(user.role)) fail(401, 'invalid credentials or inactive account');
    let valid = false; try { valid = await argon2.verify(user.password, password); } catch { valid = false; }
    if (!valid) fail(401, 'invalid credentials');
    if (user.role === 'parent' || user.role === 'student') {
      const suppliedPhone = normalizeEgyptianPhone(str(req.body?.parent_phone));
      const accountPhone = normalizeEgyptianPhone(str(user.parent_phone));
      if (!suppliedPhone || !accountPhone || suppliedPhone !== accountPhone) fail(401, 'رقم ولي الأمر غير صحيح؛ أدخل الرقم المسجل بالحساب');
    }
    const deviceRequired = requiresDeviceRegistration(String(user.role));
    if (deviceRequired && (device.length < 16 || device.length > 256)) fail(400, 'valid device fingerprint is required');
    // Admin JWTs carry a per-login nonce only for token compatibility; it is never stored
    // or checked as a device binding. Every admin device gets an independent session.
    const hashed = hashDevice(deviceRequired ? device : `admin-session:${randomUUID()}`);
    if (deviceRequired) {
      const deviceClient = await pool.connect();
      try {
        await deviceClient.query('BEGIN');
        await deviceClient.query('SELECT pg_advisory_xact_lock(hashtext($1))', [String(user.id)]);
        const prior = await deviceClient.query('SELECT device_hash FROM account_devices WHERE user_id=$1 ORDER BY active DESC,last_seen_at DESC LIMIT 1', [user.id]);
        const boundDeviceHash = prior.rows[0] ? String(prior.rows[0].device_hash) : null;
        if (!canRegisterDeviceSession(String(user.role), boundDeviceHash, hashed)) fail(409, 'هذا الحساب مربوط بجهاز آخر. اطلب من الإدارة فك ارتباط الجهاز قبل استخدام هاتف جديد.');
        await deviceClient.query('UPDATE account_devices SET active=FALSE WHERE user_id=$1 AND device_hash<>$2', [user.id, hashed]);
        await deviceClient.query('INSERT INTO account_devices(user_id,device_hash,active,last_seen_at) VALUES($1,$2,TRUE,now()) ON CONFLICT(user_id,device_hash) DO UPDATE SET active=TRUE,last_seen_at=now()', [user.id, hashed]);
        await deviceClient.query('COMMIT');
      } catch (error) { await deviceClient.query('ROLLBACK').catch(() => {}); throw error; }
      finally { deviceClient.release(); }
    }
    const ttl = user.role === 'admin' ? 2 * 60 * 60 : 8 * 60 * 60;
    const sessionVersion = Number(user.session_version || 1);
    const token = tokenFor({ sub: user.id, role: user.role, device: hashed, session_version: sessionVersion }, ttl);
    const persistentToken = tokenFor({ sub: user.id, role: user.role, device: hashed, session_version: sessionVersion }, 30 * 24 * 60 * 60);
    setAuthCookie(res, persistentToken, req.body?.remember !== false);
    await audit(String(user.id), 'login', `role=${user.role};device session started`);
    res.json({ token, device_locked: user.role !== 'admin', max_devices: user.role === 'admin' ? null : 1, expires_in: ttl, role: user.role, user_id: user.id });
  } catch (e) { next(e); }
});

app.get('/api/v1/auth/session', async (req, res, next) => {
  try {
    const token = readAuthCookie(req);
    if (!token) fail(401, 'no saved session');
    const claims = verifyToken(token);
    await requireDeviceSession(claims);
    const user = (await pool.query('SELECT active,role FROM video_users WHERE id=$1', [claims.sub])).rows[0];
    if (user?.active !== true || String(user.role) !== claims.role) fail(401, 'saved session is no longer active');
    const ttl = claims.role === 'admin' ? 2 * 60 * 60 : 8 * 60 * 60;
    const accessToken = tokenFor({ sub: claims.sub, role: claims.role, device: claims.device, session_version: claims.session_version ?? 1 }, ttl);
    res.json({ token: accessToken, role: claims.role, user_id: claims.sub, expires_in: ttl });
  } catch (e) { clearAuthCookie(res); next(e); }
});

app.post('/api/v1/auth/logout', async (req, res, next) => {
  try {
    const claims = bearer(req); await requireDeviceSession(claims);
    if (requiresDeviceRegistration(claims.role)) await pool.query('UPDATE account_devices SET active=FALSE,last_seen_at=now() WHERE user_id=$1 AND device_hash=$2',[claims.sub,claims.device]);
    await audit(claims.sub,'logout','device session ended');
    clearAuthCookie(res);
    res.json({status:'OK'});
  } catch (e) { clearAuthCookie(res); next(e); }
});

app.get('/api/v1/account/activity', async (req, res, next) => {
  try {
    const claims = bearer(req); await requireDeviceSession(claims);
    const [devices, events, counts] = await Promise.all([
      pool.query('SELECT active,last_seen_at,device_hash FROM account_devices WHERE user_id=$1 ORDER BY active DESC,last_seen_at DESC LIMIT 20', [claims.sub]),
      pool.query("SELECT action,details,created_at FROM audit_logs WHERE actor_id=$1 AND action IN ('login','logout','self_service_password_reset','account_password_reset') ORDER BY created_at DESC,id DESC LIMIT 100", [claims.sub]),
      pool.query("SELECT count(*) FILTER (WHERE action='login' AND created_at>=CURRENT_DATE)::int AS logins_today,count(*) FILTER (WHERE action='logout' AND created_at>=CURRENT_DATE)::int AS logouts_today,count(*) FILTER (WHERE action='login' AND created_at>=CURRENT_DATE-INTERVAL '7 days')::int AS logins_week,count(*) FILTER (WHERE action='logout' AND created_at>=CURRENT_DATE-INTERVAL '7 days')::int AS logouts_week FROM audit_logs WHERE actor_id=$1 AND action IN ('login','logout')", [claims.sub]),
    ]);
    res.json({ status:'OK', devices:devices.rows.map((row:any)=>({active:row.active===true,last_seen_at:row.last_seen_at,is_current:claims.device===String(row.device_hash)})), events:events.rows, counts:counts.rows[0]||{} });
  } catch (e) { next(e); }
});

app.get('/api/v1/admin/audit-logs', async (req, res, next) => {
  try {
    await admin(req);
    const requested = Number.parseInt(str(req.query.limit), 10) || 200;
    const limit = Math.max(1, Math.min(500, requested));
    const result = await pool.query(`SELECT l.id,l.actor_id,l.action,l.details,l.created_at,u.role,u.email,
      COALESCE(NULLIF(p.profile_data->>'name',''),NULLIF(u.email,''),l.actor_id,'غير معروف') AS actor_name
      FROM audit_logs l LEFT JOIN video_users u ON u.id=l.actor_id
      LEFT JOIN video_user_profiles p ON p.user_id=u.id ORDER BY l.created_at DESC,l.id DESC LIMIT $1`, [limit]);
    res.json({ status:'OK', entries: result.rows });
  } catch (e) { next(e); }
});

app.post('/api/v1/auth/register', registerIpLimiter, registerEmailLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const id = str(req.body?.id).trim(), role = str(req.body?.role).trim(), email = str(req.body?.email).trim().toLowerCase(), password = str(req.body?.password);
    const parentPhone = ['parent','student'].includes(role) ? normalizeEgyptianPhone(str(req.body?.parent_phone)) : '';
    if (!['student','parent'].includes(role)) fail(403, 'self registration is limited to student and parent accounts');
    if (!/^[A-Za-z0-9_-]{2,128}$/.test(id) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320 || password.length < 8 || password.length > 1024) fail(400, 'valid id, email and password (at least 8 characters) are required');
    if (['parent','student'].includes(role) && !parentPhone) fail(400, 'أدخل رقم هاتف ولي الأمر المصري الصحيح');
    if (role === 'student' && str(req.body?.profile?.grade).trim() === 'ثانية ثانوي' && !['medicine-life-sciences','engineering-computing','business','literature-arts'].includes(str(req.body?.profile?.track))) fail(400, 'اختر المسار الدراسي للصف الثاني الثانوي');
    // Serialize account creation on both normalized identifiers, then check duplicates within the transaction.
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`email:${email}`]);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`id:${id.toLowerCase()}`]);
    const exists = await client.query('SELECT id FROM video_users WHERE lower(email)=lower($1) OR lower(id)=lower($2) LIMIT 1', [email, id]);
    if (exists.rowCount) fail(409, 'account already exists');
    const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    // Public student signups are untrusted: do not grant access to grade-scoped exams
    // until the school reviews the student's identity and enrollment. Parent accounts
    // may activate immediately but reveal no student data until a one-time link is redeemed.
    const active = role === 'parent';
    await client.query('INSERT INTO video_users(id,role,email,password,active,parent_phone) VALUES($1,$2,$3,$4,$5,$6)', [id, role, email, hash, active, parentPhone]);
    const profile = cleanProfile(req.body?.profile, { name: str(req.body?.name) });
    await client.query('INSERT INTO video_user_profiles(user_id,profile_data) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET profile_data=EXCLUDED.profile_data,updated_at=now()', [id, JSON.stringify(profile)]);
    await client.query('COMMIT');
    await audit(id, 'self_register', `role=${role};active=${active}`);
    res.status(201).json({ status: 'OK', id, role, active, approval_required: role === 'student' });
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e); } finally { client.release(); }
});

function cleanProfile(input: any, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const output: Record<string, unknown> = {};
  const stringFields = ['name','studentCode','grade','birthDate','joined','subject','track'];
  for (const key of stringFields) {
    const value = raw[key] ?? fallback[key];
    if (typeof value === 'string') output[key] = value.slice(0, key === 'name' ? 200 : 255);
  }
  if (Array.isArray(raw.grades)) output.grades = raw.grades.filter((v: unknown): v is string => typeof v === 'string').slice(0, 100).map((v: string) => v.slice(0, 100));
  if (typeof raw.active === 'boolean') output.active = raw.active;
  return output;
}
async function hydrateAccountProfiles(rawState: any): Promise<any> {
  const state = rawState && typeof rawState === 'object' && !Array.isArray(rawState) ? structuredClone(rawState) : {};
  for (const key of ['students','teachers','parents']) if (!Array.isArray(state[key])) state[key] = [];
  const rows = await pool.query(`SELECT u.id,u.role,u.email,u.active,COALESCE(p.profile_data,'{}'::jsonb) AS profile_data FROM video_users u LEFT JOIN video_user_profiles p ON p.user_id=u.id WHERE u.role IN ('student','teacher','parent') ORDER BY u.id`);
  const relationRows = await pool.query(`SELECT parent_id, array_agg(student_id ORDER BY student_id) AS student_ids FROM parent_student_links WHERE active=TRUE GROUP BY parent_id`);
  const parentLinks = new Map<string, string[]>();
  for (const item of relationRows.rows) parentLinks.set(String(item.parent_id), Array.isArray(item.student_ids) ? item.student_ids.map(String) : []);
  const targetByRole: Record<string, string> = { student: 'students', teacher: 'teachers', parent: 'parents' };
  for (const row of rows.rows) {
    const listKey = targetByRole[String(row.role)]; if (!listKey) continue;
    const target: any[] = state[listKey];
    const idx = target.findIndex((item: any) => String(item?.id) === String(row.id));
    const existing = idx >= 0 ? target[idx] : {};
    const profile = cleanProfile(row.profile_data);
    const merged: any = { ...existing, ...profile, id: String(row.id), role: String(row.role), email: row.email || profile.email || existing.email || '', active: row.active === true };
    // Never trust profile data to restore a secret or relation; relationships come from the parent_link tables.
    delete merged.pass; delete merged.password; delete merged.passHash; delete merged.passwordHash;
    if (String(row.role) === 'parent') merged.studentIds = parentLinks.get(String(row.id)) || []; else delete merged.studentIds;
    if (idx >= 0) target[idx] = merged; else target.push(merged);
  }
  return state;
}

async function syncUsers(users: any[], client: PoolClient): Promise<void> {
  if (users.length > 10000) fail(413, 'too many users');
  for (const u of users) {
    const id = str(u?.id).trim(), role = str(u?.role).trim(), password = str(u?.password);
    if (!id) continue;
    if (!ALLOWED_ROLES.has(role)) fail(400, 'unsupported account role');
    const email = u.email ? str(u.email).trim().toLowerCase() : null;
    const parentPhone = ['student','parent'].includes(role) ? normalizeEgyptianPhone(str(u.profile?.parentPhone || u.parent_phone)) : '';
    if (password) {
      const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
      await client.query('INSERT INTO video_users(id,role,email,password,active,parent_phone) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,email=COALESCE(EXCLUDED.email,video_users.email),password=EXCLUDED.password,active=EXCLUDED.active,parent_phone=COALESCE(EXCLUDED.parent_phone,video_users.parent_phone),session_version=video_users.session_version+1', [id, role, email, hash, bool(u.active), parentPhone || null]);
    } else {
      // Admin sync can safely update metadata/status for an existing account without needing its plaintext password again.
      // New accounts still require a password and are never created through this branch.
      const existing = await client.query('SELECT id FROM video_users WHERE id=$1', [id]);
      if (!existing.rowCount) continue;
      await client.query('UPDATE video_users SET role=$2,email=COALESCE($3,email),active=$4,parent_phone=COALESCE($5,parent_phone) WHERE id=$1', [id, role, email, bool(u.active), parentPhone || null]);
    }
    const profile = cleanProfile(u.profile, { name: str(u.name) });
    await client.query('INSERT INTO video_user_profiles(user_id,profile_data) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET profile_data=video_user_profiles.profile_data || EXCLUDED.profile_data,updated_at=now()', [id, JSON.stringify(profile)]);
  }
}
app.post('/api/v1/auth/sync-users', async (req, res, next) => {
  const client = await pool.connect();
  try { await admin(req); const users = Array.isArray(req.body?.users) ? req.body.users : []; await client.query('BEGIN'); await syncUsers(users, client); await client.query('COMMIT'); res.json({ status: 'OK' }); }
  catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e); } finally { client.release(); }
});
app.post('/api/v1/auth/sync-platform', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const claims = await admin(req); const body = req.body || {};
    const users = Array.isArray(body.users) ? body.users : [], access = Array.isArray(body.access) ? body.access : [], courses = Array.isArray(body.courses) ? body.courses : [], enrollments = Array.isArray(body.enrollments) ? body.enrollments : [];
    if (users.length > 10000 || access.length > 100000 || courses.length > 10000 || enrollments.length > 100000) fail(413, 'platform sync payload too large');
    await client.query('BEGIN'); await syncUsers(users, client);
    await client.query('UPDATE video_access SET active=FALSE'); await client.query('UPDATE course_catalog SET active=FALSE'); await client.query('UPDATE course_enrollments SET active=FALSE');
    for (const c of courses) {
      const id = str(c?.id).trim(); if (!id) continue;
      await client.query('INSERT INTO course_catalog(course_id,kind,active) VALUES($1,$2,$3) ON CONFLICT(course_id) DO UPDATE SET kind=EXCLUDED.kind,active=EXCLUDED.active,updated_at=now()', [id, str(c.kind).trim() || 'free', bool(c.active)]);
      await client.query('DELETE FROM course_videos WHERE course_id=$1', [id]);
      for (const vid of (Array.isArray(c.video_ids) ? c.video_ids : []).map(safeId).filter(Boolean)) await client.query('INSERT INTO course_videos(course_id,video_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [id, vid]);
    }
    for (const e of enrollments) if (str(e.course_id).trim() && str(e.student_id).trim()) {
      const requestedAt = new Date(str(e.enrolled_at));
      const enrolledAt = Number.isFinite(requestedAt.getTime()) ? requestedAt : new Date();
      await client.query('INSERT INTO course_enrollments(course_id,student_id,active,enrolled_at) VALUES($1,$2,$3,$4) ON CONFLICT(course_id,student_id) DO UPDATE SET active=EXCLUDED.active,enrolled_at=CASE WHEN course_enrollments.active THEN course_enrollments.enrolled_at ELSE EXCLUDED.enrolled_at END,updated_at=now()', [str(e.course_id).trim(), str(e.student_id).trim(), bool(e.active), enrolledAt]);
    }
    for (const a of access) if (str(a.student_id).trim() && str(a.video_id).trim()) await client.query('INSERT INTO video_access(student_id,video_id,active) VALUES($1,$2,$3) ON CONFLICT(student_id,video_id) DO UPDATE SET active=EXCLUDED.active,updated_at=now()', [str(a.student_id).trim(), safeId(a.video_id), bool(a.active)]);
    await client.query('COMMIT'); await audit(claims.sub, 'platform_sync', 'users and video access synchronized'); res.json({ status: 'OK', users: 'synced', access: 'synced' });
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e); } finally { client.release(); }
});

// Student-created parent link code: cryptographically random, one use, expires in 15 minutes.
app.post('/api/v1/parent-links/code', parentLinkLimiter, async (req, res, next) => {
  try {
    const claims = bearer(req); await requireDeviceSession(claims);
    if (claims.role !== 'student') fail(403, 'إنشاء كود الربط متاح للطالب فقط');
    const code = randomBytes(16).toString('hex').toUpperCase();
    const codeHash = createHash('sha256').update(code).digest('hex');
    await pool.query('DELETE FROM parent_link_codes WHERE expires_at <= now() OR used_at IS NOT NULL');
    await pool.query('INSERT INTO parent_link_codes(code_hash,student_id,expires_at) VALUES($1,$2,now() + interval \'15 minutes\')', [codeHash, claims.sub]);
    await audit(claims.sub, 'parent_link_code_created', 'expires in 15 minutes');
    res.status(201).json({ status: 'OK', code, expires_in: 900, expires_at: new Date(Date.now() + 900000).toISOString(), message: 'الكود صالح للاستخدام مرة واحدة ولمدة 15 دقيقة' });
  } catch (e) { next(e); }
});
app.post('/api/v1/parent-links/redeem', parentLinkLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const claims = bearer(req); await requireDeviceSession(claims);
    if (claims.role !== 'parent') fail(403, 'ربط الأبناء متاح لحساب ولي الأمر فقط');
    const code = str(req.body?.code).trim().toUpperCase();
    if (!/^[A-F0-9]{32}$/.test(code)) fail(400, 'كود الربط غير صحيح');
    const codeHash = createHash('sha256').update(code).digest('hex');
    await client.query('BEGIN');
    const found = await client.query('SELECT student_id FROM parent_link_codes WHERE code_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE', [codeHash]);
    if (!found.rowCount) fail(400, 'الكود غير صحيح أو انتهت صلاحيته أو تم استخدامه من قبل');
    const studentId = String(found.rows[0].student_id);
    const student = await client.query("SELECT id FROM video_users WHERE id=$1 AND role='student' AND active=TRUE", [studentId]);
    if (!student.rowCount) fail(404, 'حساب الطالب غير نشط');
    await client.query('UPDATE parent_link_codes SET used_at=now() WHERE code_hash=$1 AND used_at IS NULL', [codeHash]);
    await client.query('INSERT INTO parent_student_links(parent_id,student_id,active) VALUES($1,$2,TRUE) ON CONFLICT(parent_id,student_id) DO UPDATE SET active=TRUE', [claims.sub, studentId]);
    await client.query('COMMIT');
    await audit(claims.sub, 'parent_student_linked', `student=${studentId}`);
    res.json({ status: 'OK', student_id: studentId, message: 'تم ربط حساب ولي الأمر بالطالب بنجاح' });
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e); } finally { client.release(); }
});

async function hydrateExamSubmissions(stateInput: any, claims: Claims, parentIds: string[] | null): Promise<any> {
  const state = stateInput && typeof stateInput === 'object' && !Array.isArray(stateInput) ? stateInput : {};
  let result;
  if (claims.role === 'admin') {
    result = await pool.query('SELECT submission_id,student_id,exam_id,teacher_id,grade,subject,title,score,max_score,percentage,submitted_at FROM exam_submissions ORDER BY submitted_at DESC LIMIT 10000');
  } else if (claims.role === 'student') {
    result = await pool.query('SELECT submission_id,student_id,exam_id,teacher_id,grade,subject,title,score,max_score,percentage,submitted_at FROM exam_submissions WHERE student_id=$1 ORDER BY submitted_at DESC LIMIT 1000', [claims.sub]);
  } else if (claims.role === 'parent') {
    result = parentIds?.length
      ? await pool.query('SELECT submission_id,student_id,exam_id,teacher_id,grade,subject,title,score,max_score,percentage,submitted_at FROM exam_submissions WHERE student_id=ANY($1::varchar[]) ORDER BY submitted_at DESC LIMIT 5000', [parentIds])
      : { rows: [] } as any;
  } else if (claims.role === 'teacher') {
    result = await pool.query('SELECT submission_id,student_id,exam_id,teacher_id,grade,subject,title,score,max_score,percentage,submitted_at FROM exam_submissions WHERE teacher_id=$1 ORDER BY submitted_at DESC LIMIT 5000', [claims.sub]);
  } else {
    result = { rows: [] } as any;
  }
  state.examResults = Array.isArray(state.examResults) ? state.examResults : [];
  state.grades = Array.isArray(state.grades) ? state.grades : [];
  for (const row of result.rows) {
    const submissionId = String(row.submission_id);
    const examId = String(row.exam_id);
    const studentId = String(row.student_id);
    const date = row.submitted_at instanceof Date ? row.submitted_at.toISOString().slice(0, 10) : String(row.submitted_at || '').slice(0, 10);
    const score = Number(row.score);
    const max = Number(row.max_score);
    const percentage = Number(row.percentage);
    const base = { exam: examId, examId, student: studentId, teacher: String(row.teacher_id || ''), grade: String(row.grade || ''), subject: String(row.subject || ''), title: String(row.title || ''), score, max, percentage, date };
    const resultId = `examresult_${submissionId}`;
    const gradeId = `examgrade_${submissionId}`;
    const examResult = { id: resultId, ...base };
    const grade = { id: gradeId, ...base, type: 'اختبار', comment: `نتيجة محفوظة على الخادم: ${score}/${max}` };
    state.examResults = state.examResults.filter((item: any) => String(item?.id) !== resultId && !(String(item?.exam ?? item?.examId) === examId && String(item?.student ?? item?.studentId) === studentId));
    state.grades = state.grades.filter((item: any) => String(item?.id) !== gradeId && !(String(item?.type) === 'اختبار' && String(item?.examId ?? item?.exam) === examId && String(item?.student ?? item?.studentId) === studentId));
    state.examResults.push(examResult);
    state.grades.push(grade);
  }
  return state;
}

app.get('/api/v1/platform/state', async (req, res, next) => {
  try {
    const claims = bearer(req); await requireDeviceSession(claims);
    const meta = await pool.query('SELECT updated_at::text AS updated_at,revision FROM platform_state WHERE id=1');
    const raw = await readPlatformState(pool);
    const parentIds = claims.role === 'parent' ? (await pool.query('SELECT student_id FROM parent_student_links WHERE parent_id=$1 AND active=TRUE ORDER BY student_id', [claims.sub])).rows.map(r => r.student_id) : null;
    const hydrated = await hydrateAccountProfiles(raw);
    const withSubmissions = await hydrateExamSubmissions(hydrated, claims, parentIds);
    if (claims.role === 'student' || claims.role === 'parent') {
      const visibleStudentIds = claims.role === 'student' ? [claims.sub] : (parentIds || []);
      const watched = visibleStudentIds.length
        ? await pool.query('SELECT course_id,student_id,lesson_index FROM course_lesson_watch_progress WHERE completed_at IS NOT NULL AND student_id=ANY($1::varchar[]) ORDER BY course_id,student_id,lesson_index', [visibleStudentIds])
        : { rows: [] as any[] };
      withSubmissions.courseProgress = withSubmissions.courseProgress && typeof withSubmissions.courseProgress === 'object' ? withSubmissions.courseProgress : {};
      for (const row of watched.rows) {
        const key = `${String(row.course_id)}::${String(row.student_id)}`;
        const indexes = Array.isArray(withSubmissions.courseProgress[key]) ? withSubmissions.courseProgress[key].map(Number) : [];
        if (!indexes.includes(Number(row.lesson_index))) indexes.push(Number(row.lesson_index));
        withSubmissions.courseProgress[key] = indexes;
      }
    }
    const hasAccounts = ['students','teachers','parents'].some(key => Array.isArray(withSubmissions[key]) && withSubmissions[key].length > 0);
    const revision = Number(meta.rows[0]?.revision ?? 0);
    if (Object.keys(raw).length === 0 && !hasAccounts && !withSubmissions.examResults.length) { res.json({ status: 'EMPTY', state: {}, revision, updated_at: meta.rows[0]?.updated_at || null }); return; }
    res.json({ status: 'OK', state: filterState(withSubmissions, claims, parentIds), revision, updated_at: meta.rows[0]?.updated_at || null });
  } catch (e) { next(e); }
});
app.post('/api/v1/platform/state', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const claims = bearer(req); if (!['admin','teacher','student','parent'].includes(claims.role)) fail(403, 'platform access denied'); await requireDeviceSession(claims);
    const changes = req.body?.changes;
    const legacyState = req.body?.state;
    if (changes == null && (!legacyState || typeof legacyState !== 'object')) fail(400, 'state changes are required');
    const payloadSize = Buffer.byteLength(JSON.stringify(changes ?? legacyState));
    if (payloadSize > 12 * 1024 * 1024) fail(413, 'state change payload exceeds 12MB');
    const expectedRevision = Number(req.body?.expected_revision);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) fail(400, 'expected_revision is required');
    await client.query('BEGIN');
    await client.query("INSERT INTO platform_state(id,state,updated_at,revision,updated_by) VALUES(1,'{}'::jsonb,now(),0,$1) ON CONFLICT(id) DO NOTHING", [claims.sub]);
    const meta = (await client.query('SELECT revision FROM platform_state WHERE id=1 FOR UPDATE')).rows[0];
    const revision = Number(meta?.revision ?? 0);
    if (revision !== expectedRevision) {
      await client.query('ROLLBACK');
      res.status(409).json({ status:'CONFLICT', error:'school data changed on the server; merge and retry', message:'تغيرت البيانات على الخادم؛ حدّث البيانات ثم أعد الحفظ', revision });
      return;
    }
    const current = await readPlatformState(client);
    let candidate: Record<string, any> = {};
    try { candidate = changes != null ? applyPlatformStateChanges(current, changes) : sanitizeState(legacyState); }
    catch (error) { fail(400, error instanceof Error ? error.message : 'invalid state changes'); }
    if (claims.role === 'student' && Array.isArray(candidate.payments)) {
      const currentPayments = Array.isArray(current.payments) ? current.payments : [];
      const knownIds = new Set(currentPayments.map((p:any) => String(p?.id ?? '')));
      const newRequests = candidate.payments.filter((p:any) => p && !knownIds.has(String(p.id ?? '')));
      const cleanRequests:any[] = [];
      for (const p of newRequests) {
        if (!/^[A-Za-z0-9_-]{8,128}$/.test(str(p.id)) || String(p.studentId ?? '') !== claims.sub) fail(400, 'invalid payment request identity');
        if (p.kind != null && !['course','library'].includes(String(p.kind))) fail(400, 'invalid payment item type');
        const isLibraryPayment = p.kind === 'library';
        const item = isLibraryPayment
          ? (Array.isArray(current.platformLibrary) ? current.platformLibrary : []).find((x:any) => String(x?.id) === String(p.resourceId))
          : (Array.isArray(current.courses) ? current.courses : []).find((c:any) => String(c?.id) === String(p.courseId));
        if (!item || item.active === false || item.type !== 'paid' || !(Number(item.price) > 0) || (isLibraryPayment && !str(item.fileId))) fail(400, isLibraryPayment ? 'library item is not available for payment' : 'course is not available for payment');
        const itemId = String(item.id);
        const alreadyOpen = currentPayments.some((old:any) => String(old?.studentId) === claims.sub && (isLibraryPayment ? old?.kind === 'library' && String(old?.resourceId) === itemId : old?.kind !== 'library' && String(old?.courseId) === itemId) && ['pending','paid'].includes(String(old?.status)));
        if (alreadyOpen) fail(409, isLibraryPayment ? 'an active payment request already exists for this library item' : 'an active payment request already exists for this course');
        const senderPhone = str(p.senderPhone).replace(/[\s()-]/g, '');
        if (!/^(?:01[0125]\d{8}|(?:\+?20)1[0125]\d{8})$/.test(senderPhone)) fail(400, 'enter a valid Egyptian mobile number used for the transfer');
        const reference = str(p.reference).trim();
        if (reference.length < 4 || reference.length > 80) fail(400, 'enter a valid transfer reference');
        if (currentPayments.some((old:any) => String(old?.reference || '').trim().toLowerCase() === reference.toLowerCase() && old?.status !== 'rejected')) fail(409, 'this transfer reference has already been submitted');
        const receiptId = str(p.receipt?.fileId);
        const receipt = (await client.query("SELECT original_name,media_type,size_bytes FROM school_files WHERE file_id=$1 AND owner_id=$2 AND uploaded_by=$2 AND purpose='payment-receipt' AND deleted_at IS NULL", [receiptId, claims.sub])).rows[0];
        if (!receipt || !['image/jpeg','image/png','image/webp','image/gif'].includes(String(receipt.media_type)) || Number(receipt.size_bytes) > 3 * 1024 * 1024) fail(400, 'a valid payment receipt image up to 3 MB is required');
        cleanRequests.push({
          id: str(p.id), ...(isLibraryPayment ? { kind:'library', resourceId:itemId, resourceTitle:str(item.title).slice(0,255) } : { courseId:itemId }), studentId: claims.sub,
          amount: Number(item.price), currency: 'EGP', provider: 'vodafone_cash',
          senderPhone, reference, note: str(p.note).slice(0,1000),
          receipt: { fileId: receiptId, name: String(receipt.original_name), type: String(receipt.media_type), size: Number(receipt.size_bytes) },
          status: 'pending', createdAt: new Date().toISOString(),
        });
      }
      // mergeState treats these as append-only, administrator-reviewed requests.
      candidate.payments = cleanRequests;
    }
    if (claims.role === 'student' && Array.isArray(candidate.submissions)) {
      const oldSubmissions = Array.isArray(current.submissions) ? current.submissions : [];
      const oldIds = new Set(oldSubmissions.map((submission: any) => String(submission?.id ?? '')));
      const newSubmissions = candidate.submissions.filter((submission: any) => submission && !oldIds.has(String(submission.id ?? '')));
      const accepted: any[] = [];
      for (const submission of newSubmissions) {
        const submissionId = str(submission.id).trim();
        const assignmentId = str(submission.assignment ?? submission.assignmentId).trim();
        if (!/^[A-Za-z0-9_-]{8,128}$/.test(submissionId) || !assignmentId || String(submission.student ?? submission.studentId ?? '') !== claims.sub) fail(400, 'invalid assignment submission');
        const assignment = (Array.isArray(current.assignments) ? current.assignments : []).find((item: any) => String(item?.id) === assignmentId);
        if (!assignment || assignment.active === false || assignment.published === false || assignment.draft === true) fail(404, 'الواجب غير متاح للتسليم');
        if (oldSubmissions.some((old: any) => String(old?.assignment ?? old?.assignmentId ?? '') === assignmentId && String(old?.student ?? old?.studentId ?? '') === claims.sub)) fail(409, 'سبق تسليم هذا الواجب؛ راجع التسليم الحالي');
        const profileRow = await client.query('SELECT profile_data FROM video_user_profiles WHERE user_id=$1', [claims.sub]);
        const student = (Array.isArray(current.students) ? current.students : []).find((item: any) => String(item?.id) === claims.sub) || profileRow.rows[0]?.profile_data || {};
        if (str(assignment.grade) && str(assignment.grade) !== str(student.grade)) fail(403, 'الواجب غير مخصص لصفك');
        if (str(assignment.courseId).trim()) await requireCourseVideosComplete(client, claims.sub, str(assignment.courseId).trim(), current);
        const answers = Array.isArray(submission.answers) ? submission.answers : [];
        const questions = Array.isArray(assignment.questions) ? assignment.questions : [];
        if (!questions.length || answers.length !== questions.length || answers.length > 250) fail(400, 'عدد إجابات الواجب غير صالح');
        const multipleChoice = assignment.answerType === 'multiple_choice' || assignment.answerType === 'mcq';
        let gradeResult: { score: number; max: number } | null = null;
        if (multipleChoice) {
          let score = 0, max = 0;
          for (let i = 0; i < questions.length; i++) {
            const question = questions[i], points = Math.max(1, Math.min(100, Number(question?.points || assignment.questionPoints || 1)));
            const correct = Number(question?.answerIndex ?? question?.answer);
            const selected = Number(answers[i]);
            if (!Array.isArray(question?.options) || question.options.length < 2 || !Number.isInteger(correct) || correct < 0 || correct >= question.options.length || !Number.isInteger(selected) || selected < 0 || selected >= question.options.length) fail(400, 'إجابة اختيار من متعدد غير صالحة');
            max += points;
            if (selected === correct) score += points;
          }
          gradeResult = { score, max };
        } else if (answers.some((answer: any) => typeof answer !== 'string' || answer.trim().length < 1 || answer.length > 20000)) fail(400, 'اكتب إجابة نصية صالحة لكل سؤال');
        accepted.push({
          id: submissionId, assignment: assignmentId, student: claims.sub,
          text: str(submission.text).slice(0, 100000), answers,
          submittedAt: new Date().toISOString(), status: gradeResult ? 'graded' : 'submitted',
          ...(gradeResult ? { score: gradeResult.score, max: gradeResult.max, feedback: 'تم التصحيح تلقائيًا' } : {}),
        });
      }
      candidate.submissions = [...oldSubmissions, ...accepted];
    }
    if (claims.role === 'parent') {
      const linked = (await client.query('SELECT student_id FROM parent_student_links WHERE parent_id=$1 AND active=TRUE ORDER BY student_id', [claims.sub])).rows.map(r => String(r.student_id));
      candidate.parents = Array.isArray(candidate.parents) ? candidate.parents : [];
      const ownParent = candidate.parents.find((parent:any) => String(parent?.id) === claims.sub);
      if (ownParent) ownParent.studentIds = linked; else candidate.parents.push({ id: claims.sub, studentIds: linked });
    }
    const merged = sanitizeState(mergeState(current, candidate, claims));
    await persistPlatformState(client, current, merged, claims.sub);
    await client.query("UPDATE platform_state SET state='{}'::jsonb,updated_at=now(),revision=revision+1,updated_by=$1 WHERE id=1", [claims.sub]);
    await client.query('COMMIT');
    await audit(claims.sub, 'platform_state_saved', `role=${claims.role}; record-level revision=${revision+1}`);
    res.json({ status:'OK', revision:revision+1, bytes:payloadSize });
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e); } finally { client.release(); }
});

async function loadAssignedExam(client: PoolClient, studentId: string, examId: string): Promise<{ exam: any; examGrade: string; teacherId: string; questions: ReturnType<typeof normalizeExamQuestion>[] }> {
  const state = await readPlatformState(client);
  const exam = Array.isArray(state.exams) ? state.exams.find((item: any) => String(item?.id) === examId) : null;
  if (!exam) fail(404, 'الاختبار غير موجود على الخادم');
  if (exam.active === false || exam.published === false || exam.disabled === true) fail(403, 'الاختبار غير متاح للتسليم');
  if (!Array.isArray(exam.questions) || exam.questions.length < 1 || exam.questions.length > 250) fail(409, 'إعدادات أسئلة الاختبار غير صالحة');
  const profileRow = await client.query('SELECT profile_data FROM video_user_profiles WHERE user_id=$1', [studentId]);
  const storedStudent = (Array.isArray(state.students) ? state.students : []).find((item: any) => String(item?.id) === studentId) || {};
  // A school-managed state record takes precedence; new self-registered users fall back to their persisted profile.
  const profile = { ...(profileRow.rows[0]?.profile_data || {}), ...storedStudent };
  const studentGrade = str(profile.grade).trim();
  const examGrade = str(exam.grade).trim();
  if (!studentGrade || !examGrade || studentGrade !== examGrade) fail(403, 'الاختبار غير مخصص للصف المرتبط بحسابك');
  const courseId = str(exam.courseId).trim();
  if (courseId) {
    const course = (Array.isArray(state.courses) ? state.courses : []).find((item: any) => String(item?.id) === courseId);
    if (!course || course.active === false) fail(403, 'الدورة المرتبطة بالاختبار غير متاحة');
    const enrolledInState = isCourseExamEnrolled(course, studentId);
    const enrollment = await client.query('SELECT 1 FROM course_enrollments WHERE course_id=$1 AND student_id=$2 AND active=TRUE', [courseId, studentId]);
    if (!enrolledInState && !enrollment.rowCount) fail(403, 'يجب الاشتراك في الدورة أولًا لبدء امتحانها');
    await requireCourseVideosComplete(client, studentId, courseId, state);
  }
  const teacherId = str(exam.teacher || exam.teacherId).trim();
  const questions = exam.questions.map((question: unknown) => {
    try { return normalizeExamQuestion(question, Number(exam.questionPoints || 1)); }
    catch { return fail(409, 'يوجد سؤال بإعدادات غير صالحة؛ اطلب من المدرس مراجعة الاختبار'); }
  });
  return { exam, examGrade, teacherId, questions };
}

function examDate(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? String(value ?? '').slice(0, 10) : date.toISOString().slice(0, 10);
}

app.post('/api/v1/exams/start', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const claims = bearer(req);
    await requireDeviceSession(claims);
    if (claims.role !== 'student') fail(403, 'بدء الاختبارات متاح لحساب الطالب فقط');
    const examId = str(req.body?.exam_id).trim();
    if (!examId || examId.length > 255 || !/^[A-Za-z0-9_.:-]+$/.test(examId)) fail(400, 'معرّف الاختبار غير صالح');
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [claims.sub, examId]);
    const assigned = await loadAssignedExam(client, claims.sub, examId);
    const submitted = await client.query('SELECT 1 FROM exam_submissions WHERE student_id=$1 AND exam_id=$2', [claims.sub, examId]);
    if (submitted.rowCount) fail(409, 'سبق تسليم هذا الاختبار؛ راجع صفحة الدرجات');
    const minutes = Math.min(180, Math.max(1, Number(assigned.exam.duration) || 30));
    const seconds = Math.round(minutes * 60);
    const inserted = await client.query(
      "INSERT INTO exam_sessions(student_id,exam_id,started_at,expires_at) VALUES($1,$2,now(),now()+($3::int * interval '1 second')) ON CONFLICT(student_id,exam_id) DO NOTHING",
      [claims.sub, examId, seconds]
    );
    const session = await client.query('SELECT started_at,expires_at,closed_at FROM exam_sessions WHERE student_id=$1 AND exam_id=$2 FOR UPDATE', [claims.sub, examId]);
    const row = session.rows[0];
    const expires = row?.expires_at instanceof Date ? row.expires_at : new Date(row?.expires_at);
    const remainingSeconds = Math.max(0, Math.ceil((expires.getTime() - Date.now()) / 1000));
    if (!row || row.closed_at || Date.now() - expires.getTime() > 120_000) fail(408, 'انتهى وقت الاختبار ولا يمكن بدء محاولة جديدة');
    await client.query('COMMIT');
    res.status(inserted.rowCount ? 201 : 200).json({ status: inserted.rowCount ? 'STARTED' : 'RESUMED', exam_id: examId, started_at: row.started_at, expires_at: expires.toISOString(), remaining_seconds: remainingSeconds });
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e); } finally { client.release(); }
});

app.post('/api/v1/exams/submit', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const claims = bearer(req);
    await requireDeviceSession(claims);
    if (claims.role !== 'student') fail(403, 'تسليم الاختبارات متاح لحساب الطالب فقط');
    const examId = str(req.body?.exam_id).trim();
    const submittedAnswers = req.body?.answers;
    if (!examId || examId.length > 255 || !/^[A-Za-z0-9_.:-]+$/.test(examId)) fail(400, 'معرّف الاختبار غير صالح');
    if (!Array.isArray(submittedAnswers) || submittedAnswers.length > 250) fail(400, 'إجابات الاختبار غير صالحة');
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [claims.sub, examId]);
    const assigned = await loadAssignedExam(client, claims.sub, examId);
    const already = await client.query('SELECT submission_id,score,max_score,percentage,submitted_at FROM exam_submissions WHERE student_id=$1 AND exam_id=$2', [claims.sub, examId]);
    if (already.rowCount) {
      const row = already.rows[0];
      await client.query('COMMIT');
      res.json({ status: 'ALREADY_SUBMITTED', result_id: String(row.submission_id), exam_id: examId, score: Number(row.score), max: Number(row.max_score), percentage: Number(row.percentage), date: examDate(row.submitted_at) });
      return;
    }
    const session = await client.query('SELECT started_at,expires_at,closed_at FROM exam_sessions WHERE student_id=$1 AND exam_id=$2 FOR UPDATE', [claims.sub, examId]);
    if (!session.rowCount) fail(409, 'ابدأ الاختبار من زر البدء قبل التسليم');
    const sessionRow = session.rows[0];
    if (sessionRow.closed_at) fail(409, 'محاولة الاختبار مغلقة');
    const expiry = sessionRow.expires_at instanceof Date ? sessionRow.expires_at : new Date(sessionRow.expires_at);
    if (Date.now() - expiry.getTime() > 120_000) fail(408, 'انتهى وقت الاختبار؛ لم يُقبل التسليم المتأخر');
    const graded = (() => { try { return gradeExamAnswers(assigned.questions, submittedAnswers); } catch { return fail(400, 'عدد الإجابات أو أحد الاختيارات غير صالح'); } })();
    const inserted = await client.query(
      'INSERT INTO exam_submissions(student_id,exam_id,teacher_id,grade,subject,title,score,max_score,percentage,answers) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING submission_id,submitted_at',
      [claims.sub, examId, assigned.teacherId || null, assigned.examGrade, str(assigned.exam.subject).slice(0,255), str(assigned.exam.title).slice(0,255), graded.score, graded.max, graded.percentage, JSON.stringify(graded.answers)]
    );
    await client.query('UPDATE exam_sessions SET closed_at=now() WHERE student_id=$1 AND exam_id=$2', [claims.sub, examId]);
    const parentLinks = await client.query('SELECT parent_id FROM parent_student_links WHERE student_id=$1 AND active=TRUE ORDER BY parent_id', [claims.sub]);
    if (parentLinks.rowCount) {
      await client.query("INSERT INTO platform_state(id,state,updated_at,revision,updated_by) VALUES(1,'{}'::jsonb,now(),0,$1) ON CONFLICT(id) DO NOTHING", [claims.sub]);
      await client.query('SELECT revision FROM platform_state WHERE id=1 FOR UPDATE');
      const existingState = await readPlatformState(client), updatedState = structuredClone(existingState);
      updatedState.notifications = Array.isArray(updatedState.notifications) ? updatedState.notifications : [];
      const studentName = str((Array.isArray(existingState.students) ? existingState.students : []).find((item: any) => String(item?.id) === claims.sub)?.name) || claims.sub;
      for (const link of parentLinks.rows) {
        const parentId = String(link.parent_id), notificationId = `exam_result_${inserted.rows[0].submission_id}_${parentId}`;
        updatedState.notifications = updatedState.notifications.filter((item: any) => String(item?.id) !== notificationId);
        updatedState.notifications.push({
          id: notificationId, to: parentId, title: 'نتيجة امتحان جديدة',
          body: `نتيجة ${studentName} في ${str(assigned.exam.title)}: ${graded.score}/${graded.max} (${graded.percentage}%)`,
          date: new Date().toISOString(), read: false, examId, submissionId: String(inserted.rows[0].submission_id),
        });
      }
      await persistPlatformState(client, existingState, updatedState, claims.sub);
      await client.query("UPDATE platform_state SET state='{}'::jsonb,updated_at=now(),revision=revision+1,updated_by=$1 WHERE id=1", [claims.sub]);
    }
    await client.query('COMMIT');
    await audit(claims.sub, 'exam_submitted', `exam=${examId};score=${graded.score}/${graded.max}`);
    const row = inserted.rows[0];
    res.status(201).json({ status: 'SUBMITTED', result_id: String(row.submission_id), exam_id: examId, score: graded.score, max: graded.max, percentage: graded.percentage, date: examDate(row.submitted_at), title: str(assigned.exam.title), subject: str(assigned.exam.subject), grade: assigned.examGrade, teacher: assigned.teacherId });
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e); } finally { client.release(); }
});

app.post('/api/v1/admin/device/reset', async (req, res, next) => { try { const claims = await admin(req); const lookup = str(req.body?.user_id).trim(); if (!lookup) fail(400, 'user_id required'); const account = (await pool.query('SELECT id FROM video_users WHERE id=$1 OR lower(email)=lower($1) LIMIT 1', [lookup])).rows[0]; if (!account) fail(404, 'account not found'); const id = String(account.id); await pool.query('DELETE FROM account_devices WHERE user_id=$1', [id]); await audit(claims.sub, 'device_lock_reset', id); res.json({ status: 'ok', user_id:id }); } catch (e) { next(e); } });
app.post('/api/v1/admin/accounts/password-reset', async (req, res, next) => {
  try {
    const claims = await admin(req);
    const lookup = str(req.body?.user_id).trim();
    const password = str(req.body?.password);
    if (!lookup) fail(400, 'user_id or email is required');
    if (password.length < 8 || password.length > 1024) fail(400, 'password must contain 8 to 1024 characters');
    const account = (await pool.query('SELECT id FROM video_users WHERE id=$1 OR lower(email)=lower($1) LIMIT 1', [lookup])).rows[0];
    if (!account) fail(404, 'account not found');
    const id = String(account.id);
    const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    await pool.query('UPDATE video_users SET password=$2,session_version=session_version+1 WHERE id=$1', [id, hash]);
    await audit(claims.sub, 'account_password_reset', `account=${id}; all prior sessions revoked`);
    if (id === claims.sub) clearAuthCookie(res);
    res.json({ status: 'ok', user_id: id, sessions_revoked: true });
  } catch (e) { next(e); }
});
app.get('/api/v1/admin/device/status', async (req, res, next) => { try { await admin(req); const lookup = str(req.query.user_id).trim(); if (!lookup) fail(400, 'user_id required'); const account = (await pool.query('SELECT id,role FROM video_users WHERE id=$1 OR lower(email)=lower($1) LIMIT 1', [lookup])).rows[0]; if (!account) fail(404, 'account not found'); const id = String(account.id); const rows = (await pool.query('SELECT active,last_seen_at FROM account_devices WHERE user_id=$1 ORDER BY active DESC,last_seen_at DESC', [id])).rows; res.json({ user_id:id, role:String(account.role), linked: rows.length > 0, active: rows.some((row:any) => row.active), devices: rows.map((row:any) => ({ active:row.active, last_seen_at:row.last_seen_at })), device_count:rows.filter((row:any) => row.active).length, max_devices:account.role === 'admin' ? null : 1 }); } catch (e) { next(e); } });
app.post('/api/v1/admin/video/reset-views', async (req, res, next) => {
  try {
    const claims = await admin(req); const student = str(req.body?.student_id).trim(), video = str(req.body?.video_id).trim();
    if (!student && !video) { await pool.query('DELETE FROM student_video_views'); await audit(claims.sub, 'reset_all_video_views', 'all student video view counters reset'); }
    else if (student && video) { await pool.query('DELETE FROM student_video_views WHERE student_id=$1 AND video_id=$2', [student, video]); await audit(claims.sub, 'reset_video_views', `student=${student};video=${video}`); }
    else if (student) { await pool.query('DELETE FROM student_video_views WHERE student_id=$1', [student]); await audit(claims.sub, 'reset_student_video_views', student); }
    else { await pool.query('DELETE FROM student_video_views WHERE video_id=$1', [video]); await audit(claims.sub, 'reset_video_views', video); }
    res.json({ status: 'ok', message: 'video view counters reset' });
  } catch (e) { next(e); }
});
app.post('/api/v1/courses/enroll-free', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const claims = bearer(req); await requireDeviceSession(claims);
    if (claims.role !== 'student') fail(403, 'student account required');
    const id = str(req.body?.course_id).trim();
    await client.query('BEGIN');
    const catalog = await client.query('SELECT kind FROM course_catalog WHERE course_id=$1 AND active=TRUE FOR SHARE', [id]);
    if (catalog.rows[0]?.kind !== 'free') fail(403, 'course is not a free course');
    await client.query("INSERT INTO platform_state(id,state,updated_at,revision,updated_by) VALUES(1,'{}'::jsonb,now(),0,$1) ON CONFLICT(id) DO NOTHING", [claims.sub]);
    await client.query('SELECT revision FROM platform_state WHERE id=1 FOR UPDATE');
    const originalState = await readPlatformState(client), state = structuredClone(originalState);
    const course = (Array.isArray(state.courses) ? state.courses : []).find((item:any) => String(item?.id) === id);
    if (!course || course.active === false) fail(404, 'course not found');
    const oldEnrollment = (await client.query('SELECT active,enrolled_at FROM course_enrollments WHERE course_id=$1 AND student_id=$2 FOR UPDATE', [id, claims.sub])).rows[0];
    const enrolledAt = oldEnrollment?.active ? new Date(oldEnrollment.enrolled_at) : new Date();
    const currentEnrollments = Array.isArray(course.enrollments) ? course.enrollments.map(String) : [];
    const stateChanged = !currentEnrollments.includes(claims.sub);
    if (stateChanged) course.enrollments = [...currentEnrollments, claims.sub];
    course.enrolledAtByStudent = course.enrolledAtByStudent && typeof course.enrolledAtByStudent === 'object' ? course.enrolledAtByStudent : {};
    course.enrolledAtByStudent[claims.sub] = enrolledAt.toISOString();
    await client.query('INSERT INTO course_enrollments(course_id,student_id,active,enrolled_at) VALUES($1,$2,TRUE,$3) ON CONFLICT(course_id,student_id) DO UPDATE SET active=TRUE,enrolled_at=CASE WHEN course_enrollments.active THEN course_enrollments.enrolled_at ELSE EXCLUDED.enrolled_at END,updated_at=now()', [id, claims.sub, enrolledAt]);
    await client.query('INSERT INTO video_access(student_id,video_id,active) SELECT $1,cv.video_id,TRUE FROM course_videos cv WHERE cv.course_id=$2 ON CONFLICT(student_id,video_id) DO UPDATE SET active=TRUE,updated_at=now()', [claims.sub, id]);
    for (const [index, lesson] of (Array.isArray(course.lessons) ? course.lessons : []).entries()) {
      const ref = str(lesson?.videoRef || lesson?.videoUrl).trim();
      let videoId = '';
      if (ref.startsWith('hls:video-engine:')) videoId = ref.slice('hls:video-engine:'.length).split('|')[0] || '';
      else if (/^https?:\/\//i.test(ref)) videoId = `external_${str(lesson?.id || `${id}_${index}`).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 240)}`;
      videoId = safeId(videoId);
      if (videoId) await client.query('INSERT INTO video_access(student_id,video_id,active) VALUES($1,$2,TRUE) ON CONFLICT(student_id,video_id) DO UPDATE SET active=TRUE,updated_at=now()', [claims.sub, videoId]);
    }
    if (stateChanged || !oldEnrollment?.active) {
      await persistPlatformState(client, originalState, state, claims.sub);
      await client.query("UPDATE platform_state SET state='{}'::jsonb,updated_at=now(),revision=revision+1,updated_by=$1 WHERE id=1", [claims.sub]);
    }
    await client.query('COMMIT');
    await audit(claims.sub, 'free_course_enroll', id);
    res.json({ status: 'ENROLLED' });
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e); }
  finally { client.release(); }
});

app.get('/api/v1/platform/rewards', async (req, res, next) => { try { const claims = bearer(req); await requireDeviceSession(claims); const rewards = await pool.query('SELECT id,title,description,points_cost,stock,active FROM platform_rewards WHERE active=TRUE ORDER BY created_at DESC'); const balance = await pool.query('SELECT balance FROM platform_points WHERE student_id=$1', [claims.sub]); res.json({ status: 'OK', balance: Number(balance.rows[0]?.balance || 0), rewards: rewards.rows.map(r => ({ id:r.id,title:r.title,description:r.description,cost:r.points_cost,stock:r.stock,active:r.active })) }); } catch (e) { next(e); } });
app.post('/api/v1/platform/rewards', async (req, res, next) => { try { const claims = await admin(req); const id = safeId(req.body?.id), title = str(req.body?.title).trim(), description = req.body?.description == null ? null : str(req.body.description).trim(), cost = Number(req.body?.points_cost), stock = Number(req.body?.stock); if (!id || !title || title.length > 255 || !Number.isInteger(cost) || cost < 1 || !Number.isInteger(stock) || stock < -1) fail(400, 'invalid reward data'); await pool.query('INSERT INTO platform_rewards(id,title,description,points_cost,stock,active) VALUES($1,$2,$3,$4,$5,TRUE) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,points_cost=EXCLUDED.points_cost,stock=EXCLUDED.stock,active=TRUE', [id,title,description,cost,stock]); await audit(claims.sub,'platform_reward_create',id); res.json({ status:'OK', id }); } catch (e) { next(e); } });
app.post('/api/v1/admin/platform/rewards/delete', async (req, res, next) => { try { const claims = await admin(req); const id = str(req.body?.id).trim(); await pool.query('UPDATE platform_rewards SET active=FALSE WHERE id=$1', [id]); await audit(claims.sub,'platform_reward_delete',id); res.json({ status:'OK' }); } catch (e) { next(e); } });
app.post('/api/v1/platform/points/earn', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const claims = bearer(req); await requireDeviceSession(claims);
    if (claims.role !== 'student') fail(403, 'student account required');
    // Points are awarded only after a server-graded, server-persisted platform exam.
    // Ignore any client-supplied point amount; derive the award from the stored result.
    const eventType = str(req.body?.event_type).trim();
    const examId = str(req.body?.event_key).trim();
    if (eventType !== 'platform_exam' || !/^[A-Za-z0-9_.:-]{1,255}$/.test(examId)) fail(400, 'نوع النشاط أو معرّفه غير صالح');
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [claims.sub, `points:${examId}`]);
    const storedState = await readPlatformState(client);
    const exam = Array.isArray(storedState.exams) ? storedState.exams.find((item: any) => String(item?.id) === examId) : null;
    if (!exam || exam.platformPrivate !== true) fail(403, 'هذا الاختبار لا يمنح نقاط المنصة');
    const submission = await client.query('SELECT percentage FROM exam_submissions WHERE student_id=$1 AND exam_id=$2', [claims.sub, examId]);
    if (!submission.rowCount) fail(409, 'يجب إكمال الاختبار وتسليمه على الخادم أولًا');
    const percentage = Number(submission.rows[0].percentage);
    if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) fail(403, 'لا تُمنح نقاط لاختبار نتيجته صفر أو غير صالحة');
    const award = Math.max(1, Math.round(percentage / 10));
    const reason = `platform_exam:${examId}`;
    const ledger = await client.query('INSERT INTO platform_point_ledger(student_id,delta,reason) VALUES($1,$2,$3) ON CONFLICT(student_id,reason) DO NOTHING RETURNING id', [claims.sub, award, reason]);
    let balance: number;
    if (ledger.rowCount) {
      const updated = await client.query('INSERT INTO platform_points(student_id,balance,lifetime_earned,updated_at) VALUES($1,$2,$2,now()) ON CONFLICT(student_id) DO UPDATE SET balance=platform_points.balance+EXCLUDED.balance,lifetime_earned=platform_points.lifetime_earned+EXCLUDED.lifetime_earned,updated_at=now() RETURNING balance', [claims.sub, award]);
      balance = Number(updated.rows[0].balance);
    } else {
      const existing = await client.query('SELECT balance FROM platform_points WHERE student_id=$1', [claims.sub]);
      balance = Number(existing.rows[0]?.balance || 0);
    }
    await client.query('COMMIT');
    if (ledger.rowCount) await audit(claims.sub, 'platform_points_earned', `exam=${examId};points=${award}`);
    res.json({ status: 'OK', balance, awarded: ledger.rowCount ? award : 0, already_awarded: !ledger.rowCount });
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e); } finally { client.release(); }
});
app.post('/api/v1/platform/courses/complete-lesson', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const claims = bearer(req); await requireDeviceSession(claims);
    if (claims.role !== 'student') fail(403, 'إكمال الدروس متاح لحساب الطالب فقط');
    const courseId = str(req.body?.course_id).trim(), lessonIndex = Number(req.body?.lesson_index);
    if (!courseId || !Number.isSafeInteger(lessonIndex) || lessonIndex < 0) fail(400, 'بيانات الدرس غير صالحة');
    await client.query('BEGIN');
    const state = await readPlatformState(client);
    const course = Array.isArray(state.courses) ? state.courses.find((item: any) => String(item?.id) === courseId) : null;
    if (!course || course.active === false) fail(404, 'الدورة غير متاحة');
    const lessons = Array.isArray(course.lessons) ? course.lessons : [];
    if (!lessons.length || lessonIndex >= lessons.length) fail(400, 'الدرس غير موجود في الدورة');
    const { lesson } = await requireReleasedCourseLesson(client, claims.sub, courseId, lessonIndex, state);
    if (str(lesson.videoRef || lesson.videoUrl).trim()) {
      const watch = (await client.query('SELECT watched_seconds,duration_seconds,completed_at FROM course_lesson_watch_progress WHERE course_id=$1 AND student_id=$2 AND lesson_index=$3 FOR SHARE', [courseId, claims.sub, lessonIndex])).rows[0];
      if (!watch?.completed_at || !watchedEnough(watch.watched_seconds, watch.duration_seconds)) fail(403, 'شاهد الفيديو حتى نهايته قبل تسجيل الدرس كمكتمل');
    }
    await client.query('INSERT INTO course_lesson_completions(course_id,student_id,lesson_index) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [courseId, claims.sub, lessonIndex]);
    const completed = await client.query('SELECT lesson_index FROM course_lesson_completions WHERE course_id=$1 AND student_id=$2 ORDER BY lesson_index', [courseId, claims.sub]);
    const indexes = completed.rows.map((row: any) => Number(row.lesson_index));
    const courseComplete = courseLessonsComplete(lessons.length, indexes);
    let awarded = 0, balance = 0;
    const points = Number(course.completionPoints ?? course.completion_points ?? 0);
    if (courseComplete && Number.isSafeInteger(points) && points > 0) {
      const reason = `course_complete:${courseId}`;
      const ledger = await client.query('INSERT INTO platform_point_ledger(student_id,delta,reason) VALUES($1,$2,$3) ON CONFLICT(student_id,reason) DO NOTHING RETURNING id', [claims.sub, points, reason]);
      if (ledger.rowCount) {
        const updated = await client.query('INSERT INTO platform_points(student_id,balance,lifetime_earned,updated_at) VALUES($1,$2,$2,now()) ON CONFLICT(student_id) DO UPDATE SET balance=platform_points.balance+EXCLUDED.balance,lifetime_earned=platform_points.lifetime_earned+EXCLUDED.lifetime_earned,updated_at=now() RETURNING balance', [claims.sub, points]);
        awarded = points; balance = Number(updated.rows[0].balance);
      } else {
        const existing = await client.query('SELECT balance FROM platform_points WHERE student_id=$1', [claims.sub]);
        balance = Number(existing.rows[0]?.balance || 0);
      }
    } else {
      const existing = await client.query('SELECT balance FROM platform_points WHERE student_id=$1', [claims.sub]);
      balance = Number(existing.rows[0]?.balance || 0);
    }
    await client.query('COMMIT');
    if (awarded) await audit(claims.sub, 'course_points_earned', `course=${courseId};points=${awarded}`);
    res.json({ status: 'OK', completed_indexes: indexes, course_complete: courseComplete, awarded, balance });
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e); } finally { client.release(); }
});
app.post('/api/v1/platform/courses/watch-progress', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const claims = bearer(req); await requireDeviceSession(claims);
    if (claims.role !== 'student') fail(403, 'تسجيل مشاهدة الفيديو متاح لحساب الطالب فقط');
    const courseId = str(req.body?.course_id).trim(), lessonIndex = Number(req.body?.lesson_index);
    const reportedDuration = Math.round(Number(req.body?.duration_seconds)), position = Math.round(Number(req.body?.position_seconds));
    const playing = req.body?.playing === true, ended = req.body?.ended === true;
    if (!courseId || !Number.isSafeInteger(lessonIndex) || lessonIndex < 0 || !Number.isSafeInteger(reportedDuration) || reportedDuration < 1 || reportedDuration > 86400 || !Number.isSafeInteger(position) || position < 0 || position > reportedDuration) fail(400, 'بيانات تقدم الفيديو غير صالحة');
    await client.query('BEGIN');
    const state = await readPlatformState(client);
    const { lesson } = await requireReleasedCourseLesson(client, claims.sub, courseId, lessonIndex, state);
    if (!str(lesson.videoRef || lesson.videoUrl).trim()) fail(400, 'هذا الدرس لا يحتوي فيديو');
    const trustedDuration = await trustedCourseDuration(lesson);
    if (trustedDuration === null) return fail(409, 'يجب على إدارة المدرسة تحديد مدة الفيديو قبل اعتماد المشاهدة');
    const duration: number = trustedDuration;
    if (Math.abs(reportedDuration - duration) > Math.max(3, Math.ceil(duration * 0.05))) fail(400, 'مدة الفيديو لا تطابق المدة المعتمدة من إدارة المدرسة');
    if (position > duration) fail(400, 'موضع الفيديو يتجاوز مدته المعتمدة');
    const previous = (await client.query('SELECT watched_seconds,duration_seconds,last_position_seconds,heartbeat_at,playing,completed_at FROM course_lesson_watch_progress WHERE course_id=$1 AND student_id=$2 AND lesson_index=$3 FOR UPDATE', [courseId, claims.sub, lessonIndex])).rows[0];
    const heartbeatAt = previous?.heartbeat_at ? new Date(previous.heartbeat_at).getTime() : 0;
    const elapsed = heartbeatAt ? Math.max(0, Math.min(15, (Date.now() - heartbeatAt) / 1000)) : 0;
    const progress = advanceWatchProgress({
      hasPrevious: !!previous, previousCompleted: !!previous?.completed_at, previousPlaying: previous?.playing === true,
      previousWatchedSeconds: Number(previous?.watched_seconds || 0), previousDurationSeconds: Number(previous?.duration_seconds || 0),
      previousPositionSeconds: Number(previous?.last_position_seconds || 0), elapsedSeconds: elapsed,
      durationSeconds: duration, positionSeconds: position, ended,
    });
    const complete = progress.completed;
    await client.query(`INSERT INTO course_lesson_watch_progress(course_id,student_id,lesson_index,watched_seconds,duration_seconds,last_position_seconds,heartbeat_at,playing,completed_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,now(),$7,CASE WHEN $8 THEN COALESCE($9::timestamptz,now()) ELSE NULL END,now())
      ON CONFLICT(course_id,student_id,lesson_index) DO UPDATE SET watched_seconds=GREATEST(course_lesson_watch_progress.watched_seconds,EXCLUDED.watched_seconds),duration_seconds=GREATEST(course_lesson_watch_progress.duration_seconds,EXCLUDED.duration_seconds),last_position_seconds=EXCLUDED.last_position_seconds,heartbeat_at=now(),playing=EXCLUDED.playing,completed_at=COALESCE(course_lesson_watch_progress.completed_at,EXCLUDED.completed_at),updated_at=now()`,
      [courseId, claims.sub, lessonIndex, progress.watchedSeconds, progress.durationSeconds, progress.acceptedPositionSeconds, playing && !ended, complete, previous?.completed_at || null]);
    await client.query('COMMIT');
    res.json({ status: 'OK', watched_seconds: progress.watchedSeconds, duration_seconds: progress.durationSeconds, completed: complete, accepted_position_seconds: progress.acceptedPositionSeconds });
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e); } finally { client.release(); }
});
app.post('/api/v1/platform/rewards/redeem', async (req, res, next) => {
  const client = await pool.connect(); try {
    const claims = bearer(req); await requireDeviceSession(claims); if (claims.role !== 'student') fail(403,'student account required'); const id = str(req.body?.reward_id).trim(); await client.query('BEGIN'); const reward = await client.query('SELECT title,points_cost,stock,active FROM platform_rewards WHERE id=$1 FOR UPDATE',[id]); const r = reward.rows[0]; if (!r) fail(404,'reward not found'); if (!r.active) fail(404,'reward not available'); if (r.stock === 0) fail(409,'reward is out of stock'); const points = await client.query('SELECT balance FROM platform_points WHERE student_id=$1 FOR UPDATE',[claims.sub]); const balance = Number(points.rows[0]?.balance || 0); const cost = Number(r.points_cost); if (balance < cost) fail(403,'insufficient points');
    const code = randomBytes(16).toString('hex').toUpperCase(), codeHash = createHash('sha256').update(code).digest('hex');
    await client.query('UPDATE platform_points SET balance=balance-$2,updated_at=now() WHERE student_id=$1',[claims.sub,cost]); const redemptionKey = `redeem:${id}:${randomUUID()}`; await client.query('INSERT INTO platform_point_ledger(student_id,delta,reason) VALUES($1,$2,$3)',[claims.sub,-cost,redemptionKey]); if (r.stock > 0) await client.query('UPDATE platform_rewards SET stock=stock-1 WHERE id=$1',[id]); const redemption = await client.query("INSERT INTO platform_redemptions(reward_id,student_id,points_cost,status,claim_code_hash) VALUES($1,$2,$3,'approved',$4) RETURNING id",[id,claims.sub,cost,codeHash]);
    await client.query("INSERT INTO platform_state(id,state,updated_at,revision,updated_by) VALUES(1,'{}'::jsonb,now(),0,$1) ON CONFLICT(id) DO NOTHING", [claims.sub]);
    await client.query('SELECT revision FROM platform_state WHERE id=1 FOR UPDATE');
    const existingState = await readPlatformState(client), state = structuredClone(existingState);
    state.messages = Array.isArray(state.messages) ? state.messages : [];
    const messageId = `reward_redemption_${redemption.rows[0].id}`;
    state.messages = state.messages.filter((message: any) => String(message?.id) !== messageId);
    state.messages.push({ id: messageId, from: 'admin', fromName: 'متجر MK', fromRole: 'admin', to: claims.sub, toName: '', toRole: 'student', text: `تم استبدال ${r.title} مقابل ${cost} نقطة. كود الاستلام الخاص بك: ${code}`, date: new Date().toISOString(), read: false });
    await persistPlatformState(client, existingState, state, claims.sub);
    await client.query("UPDATE platform_state SET state='{}'::jsonb,updated_at=now(),revision=revision+1,updated_by=$1 WHERE id=1", [claims.sub]);
    await client.query('COMMIT'); await audit(claims.sub,'platform_reward_redeem',`reward=${id};redemption=${redemption.rows[0].id}`); res.json({ status:'OK',balance:balance-cost,redemption_id:redemption.rows[0].id,title:r.title,code });
  } catch (e) { await client.query('ROLLBACK').catch(()=>{}); next(e); } finally { client.release(); }
});
app.post('/api/v1/admin/platform/rewards/lookup-code', async (req, res, next) => {
  try {
    const claims = await admin(req), code = str(req.body?.code).replace(/\s+/g, '').toUpperCase();
    if (!/^[A-F0-9]{32}$/.test(code)) fail(400, 'صيغة كود الاستلام غير صحيحة');
    const hash = createHash('sha256').update(code).digest('hex');
    const result = await pool.query(`SELECT pr.id AS redemption_id,pr.status,pr.points_cost,pr.created_at,pr.student_id,vr.title AS reward_title
      FROM platform_redemptions pr JOIN platform_rewards vr ON vr.id=pr.reward_id WHERE pr.claim_code_hash=$1`, [hash]);
    if (!result.rowCount) fail(404, 'الكود غير صحيح أو غير موجود');
    const item = result.rows[0], profile = await pool.query('SELECT profile_data FROM video_user_profiles WHERE user_id=$1', [item.student_id]);
    await audit(claims.sub, 'platform_reward_code_lookup', `redemption=${item.redemption_id}`);
    res.json({ status: 'OK', redemption_id: String(item.redemption_id), reward: item.reward_title, student_id: item.student_id, student_name: str(profile.rows[0]?.profile_data?.name || ''), points: Number(item.points_cost), redemption_status: item.status, redeemed_at: item.created_at });
  } catch (e) { next(e); }
});

const upload = multer({ storage: multer.diskStorage({ destination: async (_req, _file, cb) => { try { await mkdir(path.join(MEDIA_ROOT,'uploads'),{recursive:true}); cb(null,path.join(MEDIA_ROOT,'uploads')); } catch (e) { cb(e as Error, ''); } }, filename: (_req,file,cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`) }), limits: { fileSize: MAX_UPLOAD, files: 1, fields: 5 }, fileFilter: (_req,file,cb) => { const ext = path.extname(file.originalname).slice(1).toLowerCase(); if (!['mp4','mov','mkv','webm','m4v','avi'].includes(ext)) return cb(new HttpError(415,'unsupported video format')); cb(null,true); } });
async function hasValidFileSignature(filePath: string, extension: string): Promise<boolean> {
  const bytes = await readFile(filePath);
  const ext = extension.toLowerCase();
  const starts = (...sig: number[]) => sig.every((v, i) => bytes[i] === v);
  if (ext === '.jpg' || ext === '.jpeg') return starts(0xff, 0xd8, 0xff);
  if (ext === '.png') return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (ext === '.gif') return bytes.subarray(0, 6).toString('ascii') === 'GIF87a' || bytes.subarray(0, 6).toString('ascii') === 'GIF89a';
  if (ext === '.webp') return bytes.subarray(0,4).toString('ascii') === 'RIFF' && bytes.subarray(8,12).toString('ascii') === 'WEBP';
  if (ext === '.pdf') return bytes.subarray(0,5).toString('ascii') === '%PDF-';
  if (['.docx','.xlsx'].includes(ext)) return starts(0x50,0x4b,0x03,0x04) && bytes.includes(Buffer.from('[Content_Types].xml'));
  if (['.txt','.md','.csv'].includes(ext)) return !bytes.includes(0) && !bytes.subarray(0,Math.min(bytes.length,8192)).includes(0xff);
  return false;
}
const schoolFilesRoot = path.join(MEDIA_ROOT, 'school-files');
async function canReadExamQuestionFile(claims: Claims, file: any): Promise<boolean> {
  if (file.purpose !== 'exam-question') return canReadSchoolFile(claims, file);
  if (claims.role === 'admin' || (claims.role === 'teacher' && claims.sub === file.owner_id)) return true;
  if (claims.role !== 'student' && claims.role !== 'parent') return false;
  const state = await readPlatformState(pool);
  const parentIds = claims.role === 'parent'
    ? (await pool.query('SELECT student_id FROM parent_student_links WHERE parent_id=$1 AND active=TRUE', [claims.sub])).rows.map(row => String(row.student_id))
    : null;
  const visible = filterState(state, claims, parentIds);
  return (Array.isArray(visible.exams) ? visible.exams : []).some((exam: any) =>
    Array.isArray(exam.questions) && exam.questions.some((question: any) => String(question?.imageFileId || '') === String(file.file_id)));
}
async function canReadAuthorizedSchoolFile(claims: Claims, file: any): Promise<boolean> {
  if (file.purpose === 'community-attachment') {
    if (claims.role === 'admin') return true;
    const state = await readPlatformState(pool);
    return (Array.isArray(state.communityTopics) ? state.communityTopics : []).some((topic:any) =>
      Array.isArray(topic?.attachment?.fileId ? [topic.attachment.fileId] : topic?.attachments) &&
      (topic.status === 'approved' || String(topic.authorId ?? '') === claims.sub) &&
      (String(topic?.attachment?.fileId || '') === String(file.file_id) || (Array.isArray(topic?.attachments) && topic.attachments.some((ref:any) => String(ref?.fileId ?? ref) === String(file.file_id)))));
  }
  if (file.purpose !== 'platform-library') return canReadExamQuestionFile(claims, file);
  if (claims.role === 'admin') return canReadPublishedLibraryFile(claims.role, null, String(file.file_id), [], []);
  if (!['student','parent'].includes(claims.role)) return false;
  const state = await readPlatformState(pool);
  const resource = (Array.isArray(state.platformLibrary) ? state.platformLibrary : []).find((item:any) =>
    item && item.active !== false && String(item.fileId || '') === String(file.file_id));
  const parentIds = claims.role === 'parent'
    ? (await pool.query('SELECT student_id FROM parent_student_links WHERE parent_id=$1 AND active=TRUE', [claims.sub])).rows.map((row:any) => String(row.student_id))
    : null;
  const visible = filterState(state, claims, parentIds);
  const scopedResource = (Array.isArray(visible.platformLibrary) ? visible.platformLibrary : []).find((item:any) => String(item?.id) === String(resource?.id));
  const studentIds = claims.role === 'student' ? [claims.sub] : (parentIds || []);
  return canReadPublishedLibraryFile(claims.role, scopedResource, String(file.file_id), studentIds, Array.isArray(state.payments) ? state.payments : []);
}
const documentUpload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => { try { await mkdir(schoolFilesRoot, { recursive: true }); cb(null, schoolFilesRoot); } catch (e) { cb(e as Error, ''); } },
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 5, fieldSize: 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const expected = schoolFileMimeForExtension(ext);
    if (!expected || (file.mimetype && file.mimetype !== expected && file.mimetype !== 'application/octet-stream')) return cb(new HttpError(415, 'unsupported school file type'));
    cb(null, true);
  },
});
app.post('/api/v1/files/upload', async (req, res, next) => {
  // Authenticate and verify device before Multer writes anything to disk. This prevents
  // unauthenticated callers from filling the upload directory with rejected files.
  let claims: Claims;
  try { claims = bearer(req); await requireDeviceSession(claims); }
  catch (e) { next(e); return; }
  documentUpload.single('file')(req, res, async error => {
    if (error) { next(error); return; }
    const file = req.file;
    try {
      if (!file) { next(new HttpError(400, 'file is required')); return; }
      const purpose = str(req.body?.purpose).trim();
      if (!['student-file','course-cover','course-file','payment-receipt','exam-question','platform-library','community-attachment'].includes(purpose)) fail(400, 'invalid file purpose');
      if (!canUploadSchoolFile(claims.role, purpose)) fail(403, 'role cannot upload this type of school file');
      let ownerId = claims.sub;
      if (purpose === 'student-file') {
        ownerId = str(req.body?.student_id).trim();
        if (!ownerId || !/^[A-Za-z0-9_-]{1,255}$/.test(ownerId)) fail(400, 'valid student_id is required');
        const student = await pool.query("SELECT id FROM video_users WHERE id=$1 AND role='student'", [ownerId]);
        if (!student.rowCount) fail(404, 'student account not found');
      }
      const ext = path.extname(file.originalname).toLowerCase();
      const mime = schoolFileMimeForExtension(ext);
      if (!mime) { fail(415, 'unsupported school file type'); return; }
      if (purpose === 'exam-question' && (!['image/jpeg','image/png','image/webp','image/gif'].includes(mime) || file.size > 5 * 1024 * 1024)) fail(415, 'exam question image must be JPG, PNG, WebP, or GIF up to 5 MB');
      if (purpose === 'payment-receipt' && (!['image/jpeg','image/png','image/webp','image/gif'].includes(mime) || file.size > 3 * 1024 * 1024)) fail(415, 'payment receipt must be a JPG, PNG, WebP, or GIF image up to 3 MB');
      if (purpose === 'community-attachment' && (!['image/jpeg','image/png','image/webp','image/gif','application/pdf'].includes(mime) || file.size > 5 * 1024 * 1024)) fail(415, 'community attachment must be an image or PDF up to 5 MB');
      if (!(await hasValidFileSignature(file.path, ext))) fail(415, 'file content does not match its declared type');
      const originalName = safeSchoolOriginalFilename(file.originalname);
      const bytes = await readFile(file.path);
      const digest = createHash('sha256').update(bytes).digest('hex');
      const fileId = `sf_${randomUUID().replaceAll('-','')}`;
      const storageKey = path.basename(file.filename);
      try {
        await pool.query('INSERT INTO school_files(file_id,owner_id,uploaded_by,owner_role,purpose,original_name,media_type,size_bytes,storage_key,sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [fileId, ownerId, claims.sub, claims.role, purpose, originalName, mime, file.size, storageKey, digest]);
      } catch (e) { await rm(file.path, {force:true}).catch(()=>{}); throw e; }
      await audit(claims.sub, 'school_file_uploaded', `purpose=${purpose};file=${fileId};bytes=${file.size}`);
      res.status(201).json({ status:'OK', file:{ id:fileId, name:originalName, type:mime, size:file.size, purpose } });
    } catch (e) {
      if (file) await rm(file.path, {force:true}).catch(()=>{});
      next(e);
    }
  });
});
app.get('/api/v1/files/:file_id/link', async (req, res, next) => {
  try {
    const claims = bearer(req); await requireDeviceSession(claims);
    const id = str(req.params.file_id);
    const file = (await pool.query('SELECT file_id,owner_id,owner_role,purpose FROM school_files WHERE file_id=$1 AND deleted_at IS NULL',[id])).rows[0];
    if (!file) fail(404, 'file not found');
    if (!await canReadAuthorizedSchoolFile(claims, file)) fail(403, 'file access denied');
    const token = tokenFor({sub:claims.sub,role:claims.role,device:claims.device,session_version:claims.session_version ?? 1,file_id:id,file_purpose:file.purpose}, 300);
    const download = req.query.download === '1' ? '&download=1' : '';
    res.json({url:`/api/v1/files/${encodeURIComponent(id)}/content?token=${encodeURIComponent(token)}${download}`, expires_in:300});
  } catch(e) { next(e); }
});
app.get('/api/v1/files/:file_id/content', async (req, res, next) => {
  try {
    const id = str(req.params.file_id), token = str(req.query.token);
    if (!token) fail(401, 'file access token required');
    const claims = verifyToken(token);
    if (claims.file_id !== id) fail(403, 'file token scope mismatch');
    await requireDeviceSession(claims);
    const file = (await pool.query('SELECT file_id,owner_id,owner_role,purpose,original_name,media_type,size_bytes,storage_key FROM school_files WHERE file_id=$1 AND deleted_at IS NULL',[id])).rows[0];
    if (!file) fail(404, 'file not found');
    if (!await canReadAuthorizedSchoolFile(claims,file)) fail(403, 'file access denied');
    if (claims.file_purpose !== file.purpose) fail(403, 'file token scope mismatch');
    const storageKey = String(file.storage_key || '');
    if (!isSafeSchoolStorageKey(storageKey)) fail(500, 'invalid stored file key');
    const storedPath = path.join(schoolFilesRoot, storageKey);
    const real = await import('node:fs/promises').then(m=>m.realpath(storedPath)).catch(()=>fail(404,'file content not found'));
    const realRoot = await import('node:fs/promises').then(m=>m.realpath(schoolFilesRoot));
    if (!real.startsWith(realRoot + path.sep)) fail(403, 'invalid file storage path');
    const safeName = encodeURIComponent(String(file.original_name).replace(/[\r\n]/g,'_'));
    const inline = ['image/jpeg','image/png','image/webp','image/gif','application/pdf'].includes(file.media_type) && req.query.download !== '1';
    res.setHeader('Content-Type', file.media_type);
    res.setHeader('Content-Length', String(file.size_bytes));
    res.setHeader('Content-Disposition', `${inline?'inline':'attachment'}; filename*=UTF-8''${safeName}`);
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    createReadStream(real).on('error',next).pipe(res);
  } catch(e) { next(e); }
});
app.delete('/api/v1/files/:file_id', async (req, res, next) => {
  try {
    const claims = bearer(req); await requireDeviceSession(claims);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const row = (await client.query('SELECT file_id,owner_id,uploaded_by,purpose,storage_key FROM school_files WHERE file_id=$1 AND deleted_at IS NULL FOR UPDATE',[str(req.params.file_id)])).rows[0];
      if (!row) fail(404,'file not found');
      if (claims.role !== 'admin' && !(claims.sub === row.owner_id && row.purpose === 'payment-receipt')) fail(403,'file delete denied');
      await client.query('UPDATE school_files SET deleted_at=now() WHERE file_id=$1',[row.file_id]);
      await client.query('COMMIT');
      await rm(path.join(schoolFilesRoot,String(row.storage_key)),{force:true}).catch(()=>{});
      await audit(claims.sub,'school_file_deleted',`file=${row.file_id};purpose=${row.purpose}`);
      res.json({status:'OK'});
    } catch(e) { await client.query('ROLLBACK').catch(()=>{}); throw e; } finally { client.release(); }
  } catch(e) { next(e); }
});

let activeFfmpeg = 0;
const ffmpegWaiters: Array<() => void> = [];
let ffmpegResolution: Promise<{ command: string; version: string } | null> | null = null;
let ffmpegResolutionAt = 0;
function resolveFfmpeg(force = false): Promise<{ command: string; version: string } | null> {
  if (!force && ffmpegResolution && Date.now() - ffmpegResolutionAt < 30_000) return ffmpegResolution;
  const candidates = [FFMPEG_CONFIGURED_PATH];
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local') : '');
    if (localAppData) candidates.push(path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'));
    candidates.push('ffmpeg.exe', 'ffmpeg');
  } else candidates.push('ffmpeg');
  const uniqueCandidates = [...new Set(candidates.filter(Boolean))];
  ffmpegResolutionAt = Date.now();
  ffmpegResolution = (async () => {
    for (const command of uniqueCandidates) {
      const version = await new Promise<string | null>(resolve => {
        const child = spawn(command, ['-version'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
        let output = '';
        let settled = false;
        const finish = (value: string | null) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
        const timer = setTimeout(() => { child.kill(); finish(null); }, 5000);
        child.stdout?.on('data', chunk => { if (output.length < 500) output += chunk.toString(); });
        child.once('error', () => finish(null));
        child.once('close', code => finish(code === 0 ? output.split(/\r?\n/)[0]?.trim() || 'FFmpeg' : null));
      });
      if (version) return { command, version };
    }
    return null;
  })();
  return ffmpegResolution;
}
async function isFfmpegAvailable(): Promise<boolean> { return Boolean(await resolveFfmpeg()); }
const FFMPEG_MISSING_MESSAGE = 'تعذر العثور على FFmpeg من خادم المنصة. تحقق من FFMPEG_PATH أو ثبّت FFmpeg ثم أعد تشغيل start-all.bat. على Windows يتم فحص مسار WinGet تلقائيًا أيضًا.';
let ffprobeResolution: Promise<string | null> | null = null;
let ffprobeResolutionAt = 0;
function resolveFfprobe(ffmpegCommand: string, force = false): Promise<string | null> {
  if (!force && ffprobeResolution && Date.now() - ffprobeResolutionAt < 30_000) return ffprobeResolution;
  const candidates: string[] = [];
  const commandDirectory = path.dirname(ffmpegCommand);
  const commandName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
  if (commandDirectory && commandDirectory !== '.') candidates.push(path.join(commandDirectory, commandName));
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local') : '');
    if (localAppData) candidates.push(path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'ffprobe.exe'));
    candidates.push('ffprobe.exe', 'ffprobe');
  } else candidates.push('ffprobe');
  ffprobeResolutionAt = Date.now();
  ffprobeResolution = (async () => {
    for (const command of [...new Set(candidates.filter(Boolean))]) {
      const available = await new Promise<boolean>(resolve => {
        const child = spawn(command, ['-version'], { stdio: 'ignore', windowsHide: true });
        let settled = false;
        const finish = (value: boolean) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
        const timer = setTimeout(() => { child.kill(); finish(false); }, 5000);
        child.once('error', () => finish(false));
        child.once('close', code => finish(code === 0));
      });
      if (available) return command;
    }
    return null;
  })();
  return ffprobeResolution;
}
async function inspectVideoInput(ffprobe: string, input: string): Promise<{ width: number; height: number; hasAudio: boolean }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_type,width,height', '-of', 'json', input], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '', stderr = '', settled = false;
    const finish = (error?: Error, value?: { width: number; height: number; hasAudio: boolean }) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) reject(error); else resolve(value!);
    };
    const timer = setTimeout(() => { child.kill(); finish(new Error('ffprobe timed out while inspecting the uploaded video')); }, 15_000);
    child.stdout.on('data', chunk => { if (stdout.length < 128_000) stdout += chunk.toString(); else { child.kill(); finish(new Error('ffprobe metadata output exceeded its limit')); } });
    child.stderr.on('data', chunk => { if (stderr.length < 2000) stderr += chunk.toString(); });
    child.once('error', error => finish(error));
    child.once('close', code => {
      if (settled) return;
      if (code !== 0) { finish(new Error(stderr.trim() || 'ffprobe could not read the uploaded video')); return; }
      try {
        const metadata = JSON.parse(stdout);
        const streams = Array.isArray(metadata?.streams) ? metadata.streams : [];
        const video = streams.find((stream: any) => stream?.codec_type === 'video');
        const width = Number(video?.width), height = Number(video?.height);
        if (!Number.isSafeInteger(width) || width < 2 || !Number.isSafeInteger(height) || height < 2) throw new Error('uploaded file does not contain a supported video stream');
        finish(undefined, { width, height, hasAudio: streams.some((stream: any) => stream?.codec_type === 'audio') });
      } catch (error) { finish(error instanceof Error ? error : new Error('ffprobe returned invalid video metadata')); }
    });
  });
}
app.get('/api/v1/admin/video/ffmpeg-status', async (req, res, next) => {
  try {
    await admin(req);
    const result = await resolveFfmpeg(true);
    const probe = result ? await resolveFfprobe(result.command, true) : null;
    const available = Boolean(result && probe);
    res.json({ available, command: result ? path.basename(result.command) : null, ffprobe: probe ? path.basename(probe) : null, version: result?.version || null, configured: Boolean(process.env.FFMPEG_PATH?.trim()), message: !result ? FFMPEG_MISSING_MESSAGE : !probe ? 'تعذر العثور على FFprobe بجوار FFmpeg؛ ثبّت حزمة FFmpeg الكاملة.' : 'FFmpeg وFFprobe جاهزان على خادم المنصة.' });
  } catch (e) { next(e); }
});
async function acquireFfmpegSlot(): Promise<() => void> {
  if (activeFfmpeg >= 2) await new Promise<void>(resolve => ffmpegWaiters.push(resolve));
  else activeFfmpeg++;
  let released = false;
  return () => { if (released) return; released = true; const next = ffmpegWaiters.shift(); if (next) next(); else activeFfmpeg = Math.max(0, activeFfmpeg - 1); };
}
async function processVideoJob(jobId: string, videoId: string, input: string): Promise<void> {
  let release: (() => void) | null = null;
  let error: string | null = null;
  try {
    release = await acquireFfmpegSlot();
    await pool.query("UPDATE video_jobs SET status='processing',updated_at=now() WHERE job_id=$1", [jobId]);
    const outDir = path.join(MEDIA_ROOT, 'hls', videoId);
    await mkdir(outDir, { recursive: true });
    const ffmpeg = await resolveFfmpeg(true);
    if (!ffmpeg) throw Object.assign(new Error(FFMPEG_MISSING_MESSAGE), { code: 'FFMPEG_MISSING' });
    const ffprobe = await resolveFfprobe(ffmpeg.command, true);
    if (!ffprobe) throw new Error('تعذر العثور على FFprobe بجوار FFmpeg؛ لا يمكن فحص الفيديو قبل تحويله. ثبّت حزمة FFmpeg الكاملة.');
    const metadata = await inspectVideoInput(ffprobe, input);
    const renditions = selectVideoRenditions(metadata.height);
    const ffmpegOutDir = outDir.replace(/\\/g, '/');
    const args = buildHlsTranscodeArgs(input, ffmpegOutDir, renditions, metadata.hasAudio);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(ffmpeg.command, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
      let stderr = '';
      child.stderr.on('data', data => { if (stderr.length < 5000) stderr += data.toString(); });
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve() : reject(new Error(stderr || `ffmpeg exited with code ${code}`)));
    });
    const master = await readFile(path.join(outDir, 'playlist.m3u8'), 'utf8').catch(() => '');
    const variants = hlsVariantNames(master);
    if (!master.startsWith('#EXTM3U') || !master.includes('#EXT-X-STREAM-INF') || variants.length !== renditions.length) throw new Error('FFmpeg completed without producing a valid multi-quality HLS master playlist');
    for (const variant of variants) {
      const manifest = await readFile(path.join(outDir, variant), 'utf8').catch(() => '');
      const segments = hlsSegmentNames(manifest);
      if (!manifest.startsWith('#EXTM3U') || !manifest.includes('#EXTINF:') || !segments.length) throw new Error(`FFmpeg produced an invalid HLS rendition playlist: ${variant}`);
      for (const segment of segments) {
        const output = await stat(path.join(outDir, segment)).catch(() => null);
        if (!output?.isFile() || output.size < 1) throw new Error(`FFmpeg produced an empty or missing HLS segment: ${segment}`);
      }
    }
  } catch (e) {
    const processError = e as NodeJS.ErrnoException;
    error = processError.code === 'ENOENT' || processError.code === 'FFMPEG_MISSING' ? FFMPEG_MISSING_MESSAGE : e instanceof Error ? e.message.slice(-1500) : 'ffmpeg failed';
  } finally {
    release?.();
  }
  const status = error ? 'failed' : 'completed';
  const playlistValue = error ? null : `/api/v1/videos/${videoId}/playlist`;
  try {
    await pool.query('UPDATE video_jobs SET status=$2,error=$3,playlist=$4,updated_at=now() WHERE job_id=$1', [jobId, status, error, playlistValue]);
    if (!error) await rm(input, { force: true }).catch(e => console.error('[video-input-cleanup]', e instanceof Error ? e.message : e));
  } catch (e) {
    // Keep the uploaded source if the job result could not be persisted. Startup
    // recovery can safely run the transcode again and update the same job.
    console.error('[video-job-db]', e instanceof Error ? e.message : e);
  }
}
async function resumeInterruptedVideoJobs(): Promise<void> {
  const { rows } = await pool.query("SELECT job_id,video_id,input_path FROM video_jobs WHERE status IN ('queued','processing') ORDER BY created_at ASC");
  if (!rows.length) return;
  const mediaRoot = await realpath(MEDIA_ROOT);
  for (const row of rows) {
    const jobId = String(row.job_id || ''), videoId = String(row.video_id || '');
    try {
      const input = await realpath(String(row.input_path || ''));
      const relative = path.relative(mediaRoot, input);
      if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('input path is outside media storage');
      const file = await stat(input);
      if (!file.isFile()) throw new Error('uploaded video source is not a file');
      await pool.query("UPDATE video_jobs SET status='queued',error=NULL,updated_at=now() WHERE job_id=$1", [jobId]);
      setTimeout(() => {
        void processVideoJob(jobId, videoId, input).catch(async error => {
          console.error('[video-job-resume]', error instanceof Error ? error.message : error);
          await pool.query("UPDATE video_jobs SET status='failed',error=$2,updated_at=now() WHERE job_id=$1", [jobId, 'تعذر استئناف معالجة الفيديو بعد إعادة تشغيل الخادم']).catch(() => {});
        });
      }, 0);
      console.info(`[video-job] resumed ${jobId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'uploaded video source is missing';
      await pool.query("UPDATE video_jobs SET status='failed',error=$2,updated_at=now() WHERE job_id=$1", [jobId, `تعذر استئناف الفيديو: ${message}`]);
      console.error(`[video-job] cannot resume ${jobId}: ${message}`);
    }
  }
}
app.post('/api/v1/video/upload', async (req: AuthedRequest, res, next) => {
  try { await admin(req); if (!(await isFfmpegAvailable())) fail(503, FFMPEG_MISSING_MESSAGE); upload.single('video')(req,res,async err => {
    if (err) { next(err); return; }
    try {
      const file = req.file; const videoIdRaw = str(req.body?.video_id).trim();
      if (!videoIdRaw || !file) { if(file) await rm(file.path,{force:true}); fail(400,'video_id and video file are required; video_id must be sent before the file'); }
      const videoFile = file as Express.Multer.File;
      const videoId = safeId(videoIdRaw), jobId = `job_${randomUUID().replaceAll('-','')}`;
      const client = await pool.connect();
      try {
        await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[videoId]);
        const active = await client.query("SELECT EXISTS(SELECT 1 FROM video_jobs WHERE video_id=$1 AND status IN ('queued','processing')) AS active",[videoId]);
        if (active.rows[0].active) { await client.query('ROLLBACK'); await rm(videoFile.path,{force:true}); fail(409,'a video processing job is already active for this video_id'); }
        await client.query("INSERT INTO video_jobs(job_id,video_id,input_path,status,original_name) VALUES($1,$2,$3,'queued',$4)",[jobId,videoId,videoFile.path,path.basename(videoFile.originalname)]); await client.query('COMMIT');
      } catch(e) { await client.query('ROLLBACK').catch(()=>{}); throw e; } finally { client.release(); }
      void processVideoJob(jobId,videoId,videoFile.path);
      res.json({status:'PROCESSING',video_id:videoId,playlist:'',original_name:path.basename(videoFile.originalname),job_id:jobId});
    } catch(e) { next(e); }
  }); } catch(e) { next(e); }
});
app.get('/api/v1/video/jobs/:job_id', async (req,res,next) => { try { await admin(req); const row = await pool.query('SELECT job_id,video_id,status,playlist,error FROM video_jobs WHERE job_id=$1',[req.params.job_id]); if(!row.rows[0]) fail(404,'job not found'); res.json(row.rows[0]); } catch(e) { next(e); } });
app.post('/api/v1/video/jobs/:job_id/retry', async (req,res,next) => {
  try {
    const claims = await admin(req), jobId = safeId(req.params.job_id), client = await pool.connect();
    let row: any;
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT job_id,video_id,input_path,status FROM video_jobs WHERE job_id=$1 FOR UPDATE', [jobId]);
      row = found.rows[0];
      if (!row) fail(404, 'job not found');
      if (row.status !== 'failed') fail(409, 'only failed video jobs can be retried');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [String(row.video_id)]);
      const active = await client.query("SELECT EXISTS(SELECT 1 FROM video_jobs WHERE video_id=$1 AND job_id<>$2 AND status IN ('queued','processing')) AS active", [row.video_id, jobId]);
      if (active.rows[0]?.active) fail(409, 'another processing job already exists for this video');
      const mediaRoot = await realpath(MEDIA_ROOT), input = await realpath(String(row.input_path || '')).catch(() => fail(404, 'uploaded source is missing; upload the video again'));
      const relative = path.relative(mediaRoot, input);
      if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail(403, 'input file is outside media storage');
      const file = await stat(input); if (!file.isFile()) fail(400, 'uploaded source is not a file');
      await client.query("UPDATE video_jobs SET status='queued',error=NULL,playlist=NULL,updated_at=now() WHERE job_id=$1", [jobId]);
      await client.query('COMMIT');
      row.input_path = input;
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
    void processVideoJob(jobId, String(row.video_id), String(row.input_path)).catch(async error => {
      console.error('[video-job-retry]', error instanceof Error ? error.message : error);
      await pool.query("UPDATE video_jobs SET status='failed',error=$2,updated_at=now() WHERE job_id=$1", [jobId, 'تعذر بدء إعادة تحويل الفيديو']).catch(() => {});
    });
    await audit(claims.sub, 'video_process_retry', String(row.video_id));
    res.json({ status: 'queued', job_id: jobId, video_id: String(row.video_id) });
  } catch (error) { next(error); }
});
app.post('/api/v1/video/process', async (req,res,next) => {
  try {
    const claims = await admin(req); const id = str(req.body?.video_id).trim(), input = str(req.body?.input_file).trim();
    if(!id || !input || !path.isAbsolute(input)) fail(400,'video_id and absolute input_file are required');
    const root = await import('node:fs/promises').then(m=>m.realpath(MEDIA_ROOT));
    const resolved = await import('node:fs/promises').then(m=>m.realpath(input)).catch(()=>fail(404,'input file not found'));
    if(!resolved.startsWith(root + path.sep)) fail(403,'input file is outside MEDIA_ROOT');
    const s=await stat(resolved); if(!s.isFile()) fail(400,'input_file must be a file');
    const videoId=safeId(id), jobId=`job_${randomUUID().replaceAll('-','')}`, client=await pool.connect();
    try {
      await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[videoId]);
      const active=await client.query("SELECT EXISTS(SELECT 1 FROM video_jobs WHERE video_id=$1 AND status IN ('queued','processing')) AS active",[videoId]);
      if(active.rows[0].active) fail(409,'video is already queued or processing');
      await client.query("INSERT INTO video_jobs(job_id,video_id,input_path,status,original_name) VALUES($1,$2,$3,'queued',$4)",[jobId,videoId,resolved,path.basename(resolved)]);
      await client.query('COMMIT');
    } catch(e) { await client.query('ROLLBACK').catch(()=>{}); throw e; } finally { client.release(); }
    void processVideoJob(jobId,videoId,resolved); await audit(claims.sub,'video_process_queued',videoId);
    res.json({status:'PROCESSING',message:'video processing queued',playlist:null,job_id:jobId});
  } catch(e) { next(e); }
});
app.post('/api/v1/video/view', async (req,res,next) => {
  const client = await pool.connect(); try { const token = str(req.body?.token), videoId = str(req.body?.video_id).trim(); if(!token || !videoId) fail(400,'token and video_id are required'); const claims=verifyToken(token); await requireDeviceSession(claims); if(claims.role!=='student') fail(403,'only students can consume course videos'); await requireVideoAccess(claims.sub,videoId); await requireReleasedCourseVideo(pool,claims.sub,videoId); if(!videoId.startsWith('external_')) { const playlist=await stat(path.join(MEDIA_ROOT,'hls',safeId(videoId),'playlist.m3u8')).catch(()=>null); if(!playlist?.isFile()) fail(409,'الفيديو لم يكتمل تحويله على الخادم بعد؛ لم يتم خصم مشاهدة.'); } await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',[claims.sub,videoId]); const found=await client.query('SELECT view_count FROM student_video_views WHERE student_id=$1 AND video_id=$2 FOR UPDATE',[claims.sub,videoId]); const current=Number(found.rows[0]?.view_count || 0), count=nextVideoViewCount(current,MAX_VIEWS); if(count===null) return fail(403,'maximum of 3 views reached'); await client.query('INSERT INTO student_video_views(student_id,video_id,view_count) VALUES($1,$2,$3) ON CONFLICT(student_id,video_id) DO UPDATE SET view_count=EXCLUDED.view_count',[claims.sub,videoId,count]); await client.query('COMMIT'); const mediaToken=tokenFor({sub:claims.sub,role:'student',device:claims.device,session_version:claims.session_version ?? 1,video_id:videoId},900); res.json({status:'AUTHORIZED',license_key:mediaToken,remaining_views:MAX_VIEWS-count,message:`authorized; view ${count} of ${MAX_VIEWS}`}); }
  catch(e) { await client.query('ROLLBACK').catch(()=>{}); next(e); } finally { client.release(); }
});
app.post('/api/v1/admin/video/preview-token', async (req,res,next) => {
  try {
    const claims = await admin(req), videoId = safeId(req.body?.video_id);
    if (!videoId) fail(400, 'معرّف الفيديو غير صالح.');
    const playlist = await stat(path.join(MEDIA_ROOT, 'hls', videoId, 'playlist.m3u8')).catch(() => null);
    if (!playlist?.isFile()) fail(404, 'الفيديو لم يكتمل تجهيزه على الخادم بعد.');
    const mediaToken = tokenFor({ sub: claims.sub, role: 'admin', device: claims.device, session_version: claims.session_version ?? 1, video_id: videoId, video_preview: true }, 900);
    res.json({ status: 'AUTHORIZED', license_key: mediaToken, expires_in: 900 });
  } catch(e) { next(e); }
});
app.post('/api/v1/drm/license', async (req,res,next) => {
  try {
    const token=str(req.body?.token), fingerprint=str(req.body?.device_fingerprint), videoId=safeId(req.body?.video_id);
    if(!token||fingerprint.length<16||fingerprint.length>256||!videoId) fail(400,'token, valid device_fingerprint and video_id are required');
    const claims=verifyToken(token); if(claims.role!=='student') fail(403,'video access is limited to students');
    const deviceHash=hashDevice(fingerprint); if(claims.device!==deviceHash) fail(409,'device fingerprint does not match this login session');
    await requireDeviceSession(claims); await requireVideoAccess(claims.sub,videoId); await requireReleasedCourseVideo(pool,claims.sub,videoId);
    const key=`rate:license:${deviceHash}`; const count=await redis.incr(key); if(count===1) await redis.expire(key,60); if(count>10) fail(429,'too many requests');
    const sessionKey=`session:${claims.sub}`; const existing=await redis.get(sessionKey); if(existing && existing!==deviceHash) fail(409,'student is already active on another device'); await redis.set(sessionKey,deviceHash,{EX:1800});
    const client=await pool.connect();
    try { await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',[claims.sub,videoId]); const row=await client.query('SELECT view_count FROM student_video_views WHERE student_id=$1 AND video_id=$2 FOR UPDATE',[claims.sub,videoId]); const current=Number(row.rows[0]?.view_count||0), countNow=nextVideoViewCount(current,MAX_VIEWS); if(countNow===null) return fail(403,'maximum of 3 views reached'); await client.query('INSERT INTO student_video_views(student_id,video_id,view_count) VALUES($1,$2,$3) ON CONFLICT(student_id,video_id) DO UPDATE SET view_count=EXCLUDED.view_count',[claims.sub,videoId,countNow]); await client.query('COMMIT'); const mediaToken=tokenFor({sub:claims.sub,role:'student',device:claims.device,session_version:claims.session_version ?? 1,video_id:videoId},900); res.json({status:'AUTHORIZED',license_key:mediaToken,remaining_views:MAX_VIEWS-countNow,message:`authorized; view ${countNow} of ${MAX_VIEWS}`}); }
    catch(e) { await client.query('ROLLBACK').catch(()=>{}); throw e; } finally { client.release(); }
  } catch(e) { next(e); }
});
async function verifyMedia(token: string, videoId: string): Promise<Claims> { const claims=verifyToken(token); if(claims.video_id!==videoId) fail(403,'video access denied'); await requireDeviceSession(claims); if(claims.role==='admin'&&claims.video_preview===true)return claims; if(claims.role!=='student')fail(403,'video access denied'); await requireVideoAccess(claims.sub,videoId); await requireReleasedCourseVideo(pool,claims.sub,videoId); return claims; }
function sendHlsManifest(res: Response, manifest: string, videoId: string, token: string): void {
  let output: string;
  try { output = rewriteHlsManifest(manifest, videoId, token); }
  catch { fail(500, 'invalid HLS playlist reference'); }
  res.setHeader('Content-Type','application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.send(output!);
}
app.get('/api/v1/videos/:video_id/playlist', async (req,res,next) => { try { const id=safeId(req.params.video_id); const token=str(req.query.token); await verifyMedia(token,id); const raw=await readFile(path.join(MEDIA_ROOT,'hls',id,'playlist.m3u8'),'utf8').catch(()=>fail(404,'playlist not found')); sendHlsManifest(res,raw,id,token); } catch(e) { next(e); } });
app.get('/api/v1/videos/:video_id/playlist/:variant', async (req,res,next) => { try { const id=safeId(req.params.video_id), variant=str(req.params.variant), token=str(req.query.token); await verifyMedia(token,id); if(!/^variant_\d{1,2}\.m3u8$/.test(variant)) fail(400,'invalid HLS variant'); const file=path.join(MEDIA_ROOT,'hls',id,variant); const real=await import('node:fs/promises').then(m=>m.realpath(file)).catch(()=>fail(404,'variant playlist not found')); const root=path.join(MEDIA_ROOT,'hls',id)+path.sep; if(!real.startsWith(root)) fail(403,'invalid variant path'); const raw=await readFile(real,'utf8'); sendHlsManifest(res,raw,id,token); } catch(e) { next(e); } });
app.get('/api/v1/videos/:video_id/segment/:segment', async (req,res,next) => { try { const id=safeId(req.params.video_id), segment=req.params.segment, token=str(req.query.token); await verifyMedia(token,id); if(!/^segment_[A-Za-z0-9_-]{1,80}\.ts$/.test(segment)) fail(400,'invalid segment'); const file=path.join(MEDIA_ROOT,'hls',id,segment); const real=await import('node:fs/promises').then(m=>m.realpath(file)).catch(()=>fail(404,'segment not found')); const root=path.join(MEDIA_ROOT,'hls',id)+path.sep; if(!real.startsWith(root)) fail(403,'invalid segment path'); res.setHeader('Content-Type','video/mp2t'); res.setHeader('Cache-Control','private, no-store'); createReadStream(real).on('error',next).pipe(res); } catch(e) { next(e); } });

app.get('/api/v1/ai/status', async (req,res,next) => {
  try {
    const claims=bearer(req); await requireDeviceSession(claims);
    const configured=!!process.env.GROQ_API_KEY?.trim();
    res.json({status:'OK',configured,provider:configured?'Groq':'local-fallback',model:configured?GROQ_MODEL:null,mode:configured?'cloud':'offline'});
  } catch(e) { next(e); }
});
app.post('/api/v1/ai/deep-search', aiLimiter, async (req,res,next) => {
  try {
    const claims=bearer(req); await requireDeviceSession(claims); if(!ALLOWED_ROLES.has(claims.role)) fail(403,'educational AI access denied'); const key=process.env.GROQ_API_KEY?.trim(); if(!key) fail(503,'AI is not configured'); const prompt=str(req.body?.current_prompt).trim(); if(!prompt) fail(400,'current_prompt is required'); if(prompt.length>12000) fail(413,'prompt too long');
    const dailyKey=`mk-school:rate:ai-daily:${createHash('sha256').update(claims.sub).digest('hex')}`;
    const dailyCount=Number(await redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]); end; return n",{keys:[dailyKey],arguments:[String(24*60*60*1000)]}));
    if(exceedsAiDailyLimit(dailyCount,AI_DAILY_LIMIT))fail(429,'daily AI request limit reached');
    const history=Array.isArray(req.body?.history)?req.body.history.slice(-10).map((m:any)=>({role:m?.role==='assistant'?'assistant':'user',content:str(m?.content).slice(0,6000)})):[];
    const state=await readPlatformState(pool); const parentIds=claims.role==='parent'?(await pool.query('SELECT student_id FROM parent_student_links WHERE parent_id=$1 AND active=TRUE',[claims.sub])).rows.map(r=>r.student_id):null;
    const scopedState = filterState(state, claims, parentIds);
    // For student and parent tutoring, provide lesson material only from courses
    // the signed-in student has actually enrolled in. filterState already locks
    // unreleased lessons; this removes unrelated course catalogs from AI context.
    if (claims.role === 'student' || claims.role === 'parent') {
      const eligibleIds = claims.role === 'student' ? [claims.sub] : (parentIds || []);
      scopedState.courses = filterAiCoursesForEnrolledStudents(scopedState.courses, eligibleIds.map(String));
    }
    // Send only educational fields to the third-party AI provider; exclude identifiers,
    // names, contact details, birthdays, student codes, files and secret material.
    const context = minimizeAiContext(scopedState, 60000);
    const messages=[{role:'system',content:'You are a precise educational tutor. Explain clearly, distinguish facts from uncertainty, and never claim to have browsed the web unless browsing data was actually provided. Answer in the student\'s language. The school context is minimized and may omit identifying details; never infer missing personal information.'},...history,{role:'user',content:`بيانات تعليمية مصرح بها من منصة MK School (تم حذف المعرفات والبيانات الشخصية):\n${context}\n\nQuestion: ${prompt}`}];
    const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:GROQ_MODEL,messages,temperature:0.2,max_tokens:1024}),signal:AbortSignal.timeout(20000)});
    if(!response.ok) fail(response.status===429?429:502,'AI provider rejected the request'); const data:any=await response.json(); res.json({status:'OK',reply:str(data?.choices?.[0]?.message?.content)||'No answer returned.',confidence_mode:'MODEL_ONLY_NO_WEB_VERIFICATION'});
  } catch(e) { next(e); }
});

// Serve the existing frontend directly from Node.js; no Docker or separate web container required.
const FRONTEND_ROOT = path.resolve(process.env.FRONTEND_ROOT || path.resolve(ROOT, '..', 'www'));
app.use('/assets', express.static(path.join(FRONTEND_ROOT, 'assets'), { fallthrough: true, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
app.get('/', (_req, res) => res.sendFile(path.join(FRONTEND_ROOT, 'index.html')));
app.get('/index.html', (_req, res) => res.sendFile(path.join(FRONTEND_ROOT, 'index.html')));
app.use((_req,res) => res.status(404).json({error:'not found'}));
app.use(errorHandler);

async function start(): Promise<void> {
  await mkdir(MEDIA_ROOT,{recursive:true});
  await redis.connect();
  await initDatabase();
  const HOST = process.env.HOST || '127.0.0.1';
  const server=app.listen(PORT,HOST,()=>console.info(`[startup] TypeScript backend listening on ${HOST}:${PORT}`));
  server.maxHeadersCount = 100;
  server.keepAliveTimeout = 5000;
  let shuttingDown = false;
  let cleanupPromise: Promise<void> | undefined;
  const cleanup = (): Promise<void> => cleanupPromise ??= (async () => {
    await pool.end().catch(error => console.error('[shutdown] PostgreSQL close failed:', error instanceof Error ? error.message : 'unknown error'));
    if (redis.isOpen) await redis.quit().catch(error => console.error('[shutdown] Redis close failed:', error instanceof Error ? error.message : 'unknown error'));
  })();
  const shutdown=async (signal:string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[shutdown] ${signal}`);
    const forceTimer = setTimeout(() => {
      console.error('[shutdown] forcing close after 10 second drain timeout');
      server.closeAllConnections();
      void cleanup().finally(() => process.exit(1));
    }, 10000);
    forceTimer.unref();
    server.close(() => { clearTimeout(forceTimer); void cleanup().finally(() => process.exit(0)); });
    server.closeIdleConnections();
  };
  process.on('SIGTERM',()=>void shutdown('SIGTERM')); process.on('SIGINT',()=>void shutdown('SIGINT'));
}
start().catch(err=>{ console.error('[startup-fatal]',err); process.exit(1); });
