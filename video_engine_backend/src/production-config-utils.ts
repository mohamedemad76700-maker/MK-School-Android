export interface ProductionConfiguration {
  nodeEnv: string;
  jwtSecret: string;
  frontendOrigin: string;
  appBaseUrl: string;
  host: string;
  trustProxy: boolean;
  allowPrivateDatastoreTransport?: boolean;
  databaseUrl: string;
  redisUrl: string;
}

function parseUrl(value: string): URL | null {
  try { return new URL(value); } catch { return null; }
}

function isLoopback(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

/** Return actionable, secret-free problems that make a public production deployment unsafe. */
export function validateProductionConfiguration(config: ProductionConfiguration): string[] {
  if (config.nodeEnv !== 'production') return [];

  const issues: string[] = [];
  if (config.jwtSecret.length < 48) issues.push('JWT_SECRET must contain at least 48 characters in production');

  const frontend = parseUrl(config.frontendOrigin);
  const appBase = parseUrl(config.appBaseUrl);
  const localOnly = Boolean(frontend && appBase
    && isLoopback(frontend.hostname) && isLoopback(appBase.hostname)
    && isLoopback(config.host) && !config.trustProxy);
  if (!frontend) issues.push('FRONTEND_ORIGIN must be a valid URL');
  else if (!localOnly && frontend.protocol !== 'https:') issues.push('FRONTEND_ORIGIN must use HTTPS in public production');
  if (frontend && (frontend.pathname !== '/' || frontend.search || frontend.hash)) issues.push('FRONTEND_ORIGIN must not include a path, query, or fragment');

  if (!appBase) issues.push('APP_BASE_URL must be a valid URL');
  else if (!localOnly && appBase.protocol !== 'https:') issues.push('APP_BASE_URL must use HTTPS in public production');

  const loopbackBind = isLoopback(config.host);
  const publicBind = config.host === '0.0.0.0' && config.trustProxy;
  if (!localOnly && !loopbackBind && !publicBind) {
    issues.push('HOST must bind to loopback, or to 0.0.0.0 behind a trusted HTTPS proxy');
  }
  if (!localOnly && !config.trustProxy) issues.push('TRUST_PROXY=true is required behind the configured reverse proxy');

  const database = parseUrl(config.databaseUrl);
  if (!database || !['postgres:', 'postgresql:'].includes(database.protocol)) {
    issues.push('DATABASE_URL must be a valid PostgreSQL URL');
  } else if (!isLoopback(database.hostname) && !['require', 'verify-ca', 'verify-full'].includes(database.searchParams.get('sslmode') || '') && !config.allowPrivateDatastoreTransport) {
    issues.push('remote PostgreSQL connections must set sslmode=require or stronger');
  }

  const redis = parseUrl(config.redisUrl);
  if (!redis || !['redis:', 'rediss:'].includes(redis.protocol)) {
    issues.push('REDIS_URL must be a valid Redis URL');
  } else if (!isLoopback(redis.hostname) && redis.protocol !== 'rediss:' && !config.allowPrivateDatastoreTransport) {
    issues.push('remote Redis connections must use rediss:// TLS');
  }

  return issues;
}
