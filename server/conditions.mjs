import { fail, number } from './http.mjs';

const DEFINITIONS = {
  IGNITE_10_15: { lo: [.10, .10], hi: [.15, .15] },
  AMT20_MIN: { min_krw: [0, 1e15] },
  AMT_RANK_TODAY: { top_n: [1, 10000, true], pool: ['MARKET'] },
  MKTCAP_BAND: { lo: [0, 1e17], hi: [0, 1e17] },
  MA60_XUP: { within: [0, 250, true] },
  DISP60: { lo: [0, 1000], hi: [0, 1000] },
  BB_UPPER_BREAK: { len: [20, 20, true], mult: [.1, 10], buf_atr: [0, 10] },
  SQZ_PRE: { pct: [0, 100], look: [120, 120, true] },
  HH20_BREAK: { len: [20, 20, true] },
  POS20: { lo: [-100, 100], hi: [-100, 100] },
  NOT_BLOWOFF: { max_ret: [0, 1] },
  PRICE_BAND: { lo: [0, 1e9], hi: [0, 1e9] },
  DEDUP_DAYS: { days: [1, 250, true] },
  EXCL_HALT: { gap_days: [1, 250, true] },
  EXCL_DELISTED: { tail_days: [0, 250, true] },
  MFE_QUALITY: { win: [5, 40, true], thr: [0, 1] },
};
export function validateParams(key, params) {
  if (!Object.hasOwn(DEFINITIONS, key)) fail(422, 'CONDITION_UNAVAILABLE', key);
  if (!params || Array.isArray(params) || typeof params !== 'object') fail(400, 'INVALID_PARAMS');
  const spec = DEFINITIONS[key], normalized = {};
  for (const name of Object.keys(params)) if (!Object.hasOwn(spec, name)) fail(400, 'UNKNOWN_PARAM', name);
  for (const [name, rule] of Object.entries(spec)) {
    if (typeof rule[0] === 'string') {
      if (!rule.includes(params[name])) fail(400, 'INVALID_PARAM', name);
      normalized[name] = params[name];
    } else {
      if (typeof params[name] !== 'number') fail(400, 'INVALID_PARAM', name);
      normalized[name] = number(params[name], ...rule.slice(0, 2), name, rule[2]);
    }
  }
  if ('lo' in normalized && normalized.lo > normalized.hi) fail(400, 'INVALID_RANGE');
  if (key === 'MFE_QUALITY' && ![5,10,20,40].includes(normalized.win)) fail(400, 'INVALID_MFE_WINDOW');
  return normalized;
}
export const REGISTRY = {
  IGNITE_10_15: p => ({ sql: 'f.ret1 BETWEEN ? AND ?', args: [p.lo, p.hi] }),
  AMT20_MIN: p => ({ sql: 'f.amt20 >= ?', args: [p.min_krw] }),
  PRICE_BAND: p => ({ sql: 'f.close BETWEEN ? AND ?', args: [p.lo, p.hi] }),
  DISP60: p => ({ sql: 'f.disp60 BETWEEN ? AND ?', args: [p.lo, p.hi] }),
  MA60_XUP: p => ({ sql: 'f.ma60_xup_age <= ?', args: [p.within] }),
  BB_UPPER_BREAK: p => ({ sql: 'f.close > i.ma20 + ? * i.sd20 + ? * i.atr20', args: [p.mult, p.buf_atr] }),
  HH20_BREAK: () => ({ sql: 'f.hh20_break = 1', args: [] }),
  SQZ_PRE: p => ({ sql: 'f.bbw_pct_prev <= ?', args: [p.pct] }),
  POS20: p => ({ sql: 'f.pos20 BETWEEN ? AND ?', args: [p.lo, p.hi] }),
  NOT_BLOWOFF: p => ({ sql: 'f.ret1 <= ?', args: [p.max_ret] }),
  AMT_RANK_TODAY: p => ({ sql: 'f.amt_rank_mkt <= ?', args: [p.top_n] }),
  MKTCAP_BAND: p => ({ sql: 'f.mktcap_krw BETWEEN ? AND ?', args: [p.lo, p.hi] }),
  DEDUP_DAYS: p => ({ sql: '(f.days_since_ignite IS NULL OR f.days_since_ignite >= ?)', args: [p.days] }),
  EXCL_HALT: p => ({ sql: 'f.halt_gap_days < ? AND f.excl_halt = 0', args: [p.gap_days] }),
  EXCL_DELISTED: p => ({ sql: '(f.delisted_age_days IS NULL OR f.delisted_age_days > ?) AND f.excl_delisted = 0', args: [p.tail_days] }),
  MFE_QUALITY: () => null,
};
export function buildPredicate(key, params) {
  const normalized = validateParams(key, params);
  return REGISTRY[key](normalized);
}
export function availability(def, coverage) {
  if (!Object.hasOwn(REGISTRY, def.cond_key)) return { available: false, reason: '복원 규칙/원천 데이터 미확정' };
  if (!coverage.ready) return { available: false, reason: '파생 데이터 빌드 필요' };
  if (def.cond_key === 'MKTCAP_BAND' && !coverage.sharesComplete)
    return { available: false, reason: '후보 전체의 시점별 상장주식수 필요' };
  if (def.cond_key === 'EXCL_DELISTED' && !coverage.statusComplete)
    return { available: false, reason: '후보 전체의 시점별 상장상태 필요' };
  return { available: true, reason: null };
}
