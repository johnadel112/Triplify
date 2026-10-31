export function validateEnvironment(env: Record<string, unknown>) {
  const mode = String(env.NODE_ENV ?? 'development');
  if (!['development', 'test', 'production'].includes(mode)) throw new Error('Invalid NODE_ENV');
  const uri = String(env.MONGODB_URI ?? '');
  if (!/^mongodb(?:\+srv)?:\/\//.test(uri)) throw new Error('MONGODB_URI is required');
  const secret = String(env.JWT_ACCESS_SECRET ?? '');
  if (secret.length < 32 || /^(change|example|your)/i.test(secret))
    throw new Error('JWT_ACCESS_SECRET must be a random secret of at least 32 characters');
  const origins = String(env.FRONTEND_URL ?? '')
    .split(',')
    .map((x) => x.trim());
  if (
    !origins.length ||
    origins.some((x) => {
      try {
        return new URL(x).origin !== x || !/^https?:/.test(x);
      } catch {
        return true;
      }
    })
  )
    throw new Error('FRONTEND_URL must contain exact HTTP(S) origins');
  const secure = String(env.COOKIE_SECURE ?? mode === 'production');
  const sameSite = String(env.COOKIE_SAME_SITE ?? 'lax');
  if (!['true', 'false'].includes(secure) || !['strict', 'lax', 'none'].includes(sameSite))
    throw new Error('Invalid cookie configuration');
  if ((mode === 'production' || sameSite === 'none') && secure !== 'true')
    throw new Error('Secure cookies required');
  if (mode === 'production' && origins.some((x) => !x.startsWith('https://')))
    throw new Error('Production origins must use HTTPS');
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  return {
    ...env,
    NODE_ENV: mode,
    PORT: port,
    MONGODB_URI: uri,
    JWT_ACCESS_SECRET: secret,
    FRONTEND_URL: origins.join(','),
    COOKIE_SECURE: secure,
    COOKIE_SAME_SITE: sameSite,
  };
}
