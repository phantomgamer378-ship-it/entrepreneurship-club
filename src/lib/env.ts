// Central environment configuration.
// Anything bundled into the frontend must be treated as public (see docs/SECURITY.md §secrets).
// Server-only secrets are read lazily and never exposed through getters used by client code.

function optional(key: string): string | undefined {
  const v = process.env[key]
  return v && v.length > 0 ? v : undefined
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',

  // Session signing secret (server-only). A random dev default keeps local runs working;
  // production MUST set SESSION_SECRET (see .env.example).
  sessionSecret:
    optional('SESSION_SECRET') ??
    'dev-only-insecure-session-secret-change-me-in-production-0123456789',

  sessionTtlSeconds: 60 * 60 * 8, // 8h sliding sessions

  // Internal service token shared between the chat mini-service and API routes (server-only).
  internalServiceToken: optional('INTERNAL_SERVICE_TOKEN') ?? 'dev-internal-token',

  // Cron secret protecting /api/cron/* endpoints (server-only).
  cronSecret: optional('CRON_SECRET') ?? 'dev-cron-token',

  // Email provider configuration. Unconfigured → console provider (dev mode).
  resendApiKey: optional('RESEND_API_KEY'),
  emailFromAddress: optional('EMAIL_FROM_ADDRESS') ?? 'Entrepreneurship Club <onboarding@resend.dev>',
  resendWebhookSecret: optional('RESEND_WEBHOOK_SECRET'),

  // Video provider configuration. Unconfigured → Jitsi embed (no credentials required).
  dailyApiKey: optional('DAILY_API_KEY'),
  dailyDomain: optional('DAILY_DOMAIN') ?? 'https://aprea.daily.co',

  jitsiDomain: optional('JITSI_DOMAIN') ?? 'meet.jit.si',

  // Public site config (safe to expose).
  siteName: 'Entrepreneurship Club — ALTA School of Technology',
  siteShortName: 'EC · ADYPU',
  institution:
    'ALTA School of Technology, Ajeenkya DY Patil University, Pune',
} as const

export const isEmailConfigured = () => Boolean(env.resendApiKey)
export const isDailyConfigured = () => Boolean(env.dailyApiKey)
