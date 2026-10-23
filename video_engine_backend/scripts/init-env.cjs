const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const defaultFile = path.join(root, '.env');

function initEnv(targetFile = defaultFile, options = {}) {
  const file = path.resolve(targetFile);
  if (!fs.existsSync(file)) {
    const secret = crypto.randomBytes(48).toString('base64url');
    const adminPassword = crypto.randomBytes(24).toString('base64url');
    const body = [
      'PORT=8080', 'HOST=127.0.0.1', 'NODE_ENV=production',
      `JWT_SECRET=${secret}`, 'PG_POOL_MAX=25', 'LOGIN_IP_LIMIT=30',
      'REGISTER_IP_LIMIT=20', 'FRONTEND_ORIGIN=http://localhost:8080', 'FRONTEND_ORIGINS=https://localhost,capacitor://localhost',
      'DATABASE_URL=postgresql://mkschool:CHANGE_ME@127.0.0.1:5432/mkschool',
      'REDIS_URL=redis://127.0.0.1:6379',
      'VIDEO_BOOTSTRAP_ADMIN_EMAIL=admin@mkschool.local',
      `VIDEO_BOOTSTRAP_ADMIN_PASSWORD=${adminPassword}`,
      'MEDIA_ROOT=./video_engine_backend/media',
      'TRUST_PROXY=false', 'GROQ_API_KEY=', 'GROQ_MODEL=openai/gpt-oss-120b', ''
    ].join('\n');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body, { mode: 0o600, flag: 'wx' });
    if (!options.quiet) {
      console.log('[setup] Created private .env with random JWT and administrator credentials.');
      console.log(`[setup] One-time bootstrap admin password: ${adminPassword}`);
      console.log(`[setup] Set DATABASE_URL to match your PostgreSQL username and password in ${file}.`);
    }
    return { file, created: true, adminPassword };
  }
  if (!options.quiet) console.log('[setup] Existing .env preserved.');
  return { file, created: false, adminPassword: null };
}

if (require.main === module) initEnv(process.env.MK_ENV_FILE || defaultFile);
module.exports = { initEnv };
