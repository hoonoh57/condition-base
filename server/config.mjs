import 'dotenv/config';
import { databaseCredentials } from './db-config.mjs';
const opt = (k, d) => (process.env[k]?.trim() || d);
const int = (k, d) => Number.parseInt(opt(k, String(d)), 10);
const bool = (k, d = false) => opt(k, String(d)).toLowerCase() === 'true';

export const config = {
  db: {
    host: opt('DB_HOST', opt('MD_HOST', '127.0.0.1')),
    port: int('DB_PORT', int('MD_PORT', 3306)),
    timezone: opt('DB_TIMEZONE', '+09:00'),
    poolLimit: int('DB_POOL_LIMIT', 8),
    marketData: opt('MD_DATABASE', 'market_data'),
    core: opt('CORE_DATABASE', 'srb_core'),
    derived: opt('DERIVED_DATABASE', 'srb_derived'),
    lab: opt('LAB_DATABASE', 'srb_lab'),
    ...databaseCredentials(),
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

for (const name of ['marketData', 'core', 'derived', 'lab']) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(config.db[name])) throw new Error(`Invalid DB name: ${name}`);
}
if (!Number.isInteger(config.data.minuteUniverseTopN) || config.data.minuteUniverseTopN < 1
    || config.data.minuteUniverseTopN > 10000) throw new Error('Invalid MINUTE_UNIVERSE_TOP_N');

// 비밀값이 로그·응답에 새지 않도록
export function safeConfig() {
  const c = structuredClone(config);
  c.db.password = c.db.password ? '***' : '';
  return c;
}
