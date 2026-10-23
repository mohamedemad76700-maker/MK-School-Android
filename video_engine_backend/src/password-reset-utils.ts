export interface PasswordResetBasePolicy {
  nodeEnv: string;
  frontendOrigin: string;
  host: string;
  trustProxy: boolean;
}

function isLoopback(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '::1'].includes(hostname.toLowerCase().replace(/^\[|\]$/g, ''));
}

/** Validate the origin that will be placed in a password-reset email. */
export function isSafePasswordResetBase(base: string, policy: PasswordResetBasePolicy): boolean {
  let url: URL;
  let frontend: URL;
  try {
    url = new URL(base);
    frontend = new URL(policy.frontendOrigin);
  } catch {
    return false;
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return false;
  const localOnly = !policy.trustProxy && isLoopback(policy.host)
    && isLoopback(frontend.hostname) && isLoopback(url.hostname);
  return policy.nodeEnv !== 'production' || url.protocol === 'https:' || localOnly;
}
