import 'dotenv/config';

function req(key) {
  const v = process.env[key];
  if (!v || !v.trim()) {
    throw new Error(`[config] 필수 환경변수 누락: ${key} — .env.example 참고`);
  }
  return v.trim();
}
const opt = (k, d) => (process.env[k]?.trim() || d);
const int = (k, d) => Number.parseInt(opt(k, String(d)), 10);
const bool = (k, d = false) => opt(k, String(d)).toLowerCase() === 'true';

export const config = {
  db: {
    host: opt('MD_HOST', '127.0.0.1'),
    port: int('MD_PORT', 3306),
    timezone: opt('DB_TIMEZONE', '+09:00'),
    poolLimit: int('DB_POOL_LIMIT', 8),
    marketData: opt('MD_DATABASE', 'market_data'),
    core: opt('CORE_DATABASE', 'srb_core'),
    derived: opt('DERIVED_DATABASE', 'srb_derived'),
    roles: {
      reader: { user: req('MD_USER'),    password: req('MD_PASSWORD') },
      build:  { user: opt('BUILD_USER'), password: opt('BUILD_PASSWORD') },
      lab:    { user: opt('LAB_USER'),   password: opt('LAB_PASSWORD') },
      prom:   { user: opt('PROM_USER'),  password: opt('PROM_PASSWORD') },
    },
  },
  server: { port: int('PORT', 5180), host: opt('HOST', '127.0.0.1') },
  guards: { allowOosBrowse: bool('ALLOW_OOS_BROWSE', false) },
  baseline: {
    severity: opt('BASELINE_SEVERITY', 'WORST'),
    costModelKey: opt('COST_MODEL_KEY', 'NA_DAILY'),
    stopDefKey: opt('STOP_DEF_KEY', 'NA_DAILY'),
    fillRuleKey: opt('FILL_RULE_KEY', 'T1_OPEN'),
    taxScheduleVer: opt('TAX_SCHEDULE_VER', 'TBD_VERIFY_KRX'),
  },
  data: { minuteUniverseTopN: int('MINUTE_UNIVERSE_TOP_N', 700) },
};

// 비밀값이 로그·응답에 새지 않도록
export function safeConfig() {
  const c = structuredClone(config);
  for (const r of Object.values(c.db.roles)) r.password = r.password ? '***' : '';
  return c;
}
