export function databaseCredentials(env = process.env) {
  // Legacy MD_* is one fallback pair, never a source of role-specific accounts.
  const legacy = env.DB_USER === undefined;
  const userKey = legacy ? 'MD_USER' : 'DB_USER';
  const passwordKey = legacy ? 'MD_PASSWORD' : 'DB_PASSWORD';
  const user = env[userKey]?.trim();
  if (!user) throw new Error('[config] DB_USER 설정이 필요합니다 — .env.example 참고');
  if (env[passwordKey] === undefined) throw new Error(`[config] ${passwordKey} 설정이 필요합니다`);
  return { user, password: env[passwordKey] };
}
