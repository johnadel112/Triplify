import { buildMongoConnectionUri, parseMongoDnsServers } from './mongodb-dns';

export function validateEnvironment(env: Record<string, unknown>) {
  const mode = String(env.NODE_ENV ?? 'development');
  if (!['development', 'test', 'production'].includes(mode)) throw new Error('Invalid NODE_ENV');
  const uri = String(env.MONGODB_URI ?? '');
  if (!/^mongodb(?:\+srv)?:\/\//.test(uri)) throw new Error('MONGODB_URI is required');
  const mongoDnsServers = parseMongoDnsServers(String(env.MONGODB_DNS_SERVERS ?? ''));
  const mongoDirectHosts = String(env.MONGODB_DIRECT_HOSTS ?? '').trim();
  const mongoReplicaSet = String(env.MONGODB_REPLICA_SET ?? '').trim();
  buildMongoConnectionUri(uri, mongoDirectHosts, mongoReplicaSet);
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
  const mailMode = String(env.MAIL_MODE ?? 'disabled');
  if (!['disabled', 'smtp', 'resend'].includes(mailMode)) throw new Error('MAIL_MODE must be disabled, smtp or resend');
  if (mailMode === 'resend') {
    for (const name of ['RESEND_API_KEY', 'MAIL_FROM']) {
      if (!String(env[name] ?? '').trim()) throw new Error(`${name} is required for Resend`);
    }
  }
  const storage = String(env.MEDIA_STORAGE ?? 'local');
  if (!['local', 'cloudinary'].includes(storage)) throw new Error('Invalid MEDIA_STORAGE');
  if (storage === 'cloudinary') {
    for (const name of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) {
      if (!String(env[name] ?? '').trim()) throw new Error(`${name} is required for Cloudinary`);
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(String(env.CLOUDINARY_CLOUD_NAME))) throw new Error('Invalid CLOUDINARY_CLOUD_NAME');
  }
  if (mailMode === 'smtp') {
    for (const name of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM']) {
      if (!String(env[name] ?? '').trim()) throw new Error(`${name} is required for SMTP`);
    }
    const smtpPort = Number(env.SMTP_PORT ?? 587);
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) throw new Error('Invalid SMTP_PORT');
    if (!['true', 'false'].includes(String(env.SMTP_SECURE ?? 'false'))) throw new Error('Invalid SMTP_SECURE');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');

  const stripeSecretKey = String(env.STRIPE_SECRET_KEY ?? '').trim();
  const stripeWebhookSecret = String(env.STRIPE_WEBHOOK_SECRET ?? '').trim();
  if (stripeSecretKey && !stripeSecretKey.startsWith('sk_test_'))
    throw new Error('STRIPE_SECRET_KEY must be a Stripe test-mode secret key');
  if (stripeWebhookSecret && !stripeWebhookSecret.startsWith('whsec_'))
    throw new Error('STRIPE_WEBHOOK_SECRET must be a Stripe webhook signing secret');

  return {
    ...env,
    NODE_ENV: mode,
    MAIL_MODE: mailMode,
    MEDIA_STORAGE: storage,
    PORT: port,
    MONGODB_URI: uri,
    MONGODB_DNS_SERVERS: mongoDnsServers.join(','),
    MONGODB_DIRECT_HOSTS: mongoDirectHosts,
    MONGODB_REPLICA_SET: mongoReplicaSet,
    JWT_ACCESS_SECRET: secret,
    FRONTEND_URL: origins.join(','),
    COOKIE_SECURE: secure,
    COOKIE_SAME_SITE: sameSite,
    STRIPE_SECRET_KEY: stripeSecretKey,
    STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
  };
}
