// 미래 정보 컬럼: 필터로 사용 시 즉시 예외
const OUTCOME_COLS = new Set([
  'anchor_date','anchor_open','executable','nonexec_reason',
  'mfe_5','mfe_10','mfe_20','mfe_40'
]);

const num = (v) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('bad param');
  return v;
};

export const REGISTRY = {
  IGNITE_10_15: (p) => ({ sql: 'f.ret1 BETWEEN ? AND ?', args: [num(p.lo), num(p.hi)] }),
  AMT20_MIN:    (p) => ({ sql: 'f.amt20 >= ?',            args: [num(p.min_krw)] }),
  PRICE_BAND:   (p) => ({ sql: 'f.close BETWEEN ? AND ?', args: [num(p.lo), num(p.hi)] }),
  DISP60:       (p) => ({ sql: 'f.disp60 BETWEEN ? AND ?',args: [num(p.lo), num(p.hi)] }),
  MA60_XUP:     (p) => ({ sql: 'f.ma60_xup_age IS NOT NULL AND f.ma60_xup_age <= ?',
                          args: [num(p.within)] }),
  BB_UPPER_BREAK:(p)=> ({ sql: 'f.bb_break = 1', args: [] }),
  HH20_BREAK:   ()  => ({ sql: 'f.hh20_break = 1', args: [] }),
  SQZ_PRE:      (p) => ({ sql: 'f.bbw_pct_prev <= ?',     args: [num(p.pct)] }),
  POS20:        (p) => ({ sql: 'f.pos20 BETWEEN ? AND ?', args: [num(p.lo), num(p.hi)] }),
  NOT_BLOWOFF:  (p) => ({ sql: 'f.ret1 <= ?',             args: [num(p.max_ret)] }),
  AMT_RANK_TODAY:(p)=> ({ sql: 'f.amt_rank_mkt <= ?',     args: [num(p.top_n)] }),
  MKTCAP_BAND:  (p) => ({ sql: 'f.mktcap_krw BETWEEN ? AND ?',
                          args: [num(p.lo), num(p.hi)] }),
  EXCL_HALT:    ()  => ({ sql: 'f.excl_halt = 0', args: [] }),
  EXCL_DELISTED:()  => ({ sql: 'f.excl_delisted = 0', args: [] }),
  // QUALITY: 컷을 만들지 않음 → 술어를 반환하지 않는다
  MFE_QUALITY:  ()  => null,
};

export function buildPredicate(condKey, params) {
  const fn = REGISTRY[condKey];
  if (!fn) throw new Error(`unknown cond_key: ${condKey}`);
  const frag = fn(params ?? {});
  if (!frag) return null;
  for (const c of OUTCOME_COLS) {
    if (frag.sql.includes(c)) throw new Error(`LOOKAHEAD_GUARD: ${condKey} touches ${c}`);
  }
  return frag;
}
