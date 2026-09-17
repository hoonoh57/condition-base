import { buildPredicate } from './conditions.mjs';
import { fail, options } from './http.mjs';

const BASE_SKIP = new Set(['IGNITE_10_15', 'MFE_QUALITY', 'DEDUP_DAYS']);

export async function partitionFor(conn, part) {
  const [[partition]] = await conn.query('SELECT * FROM srb_lab.data_partition WHERE part=?', [part]);
  if (!partition) fail(400, 'INVALID_PARTITION');
  return partition;
}
export function predicates(rows, partition, { skip } = {}) {
  const where = ['f.cond_date BETWEEN ? AND ?'];
  const args = [partition.date_from, partition.date_to];
  for (const row of rows.filter(r => r.enabled).sort((a,b) => a.order_no-b.order_no)) {
    if (skip?.has(row.cond_key)) continue;
    const frag = buildPredicate(row.cond_key, row.params);
    if (frag) { where.push('(' + frag.sql + ')'); args.push(...frag.args); }
  }
  return { where: where.join(' AND '), args };
}
export const featureJoin = table =>
  `FROM srb_derived.${table} f JOIN srb_derived.d_ind i`
  + ' ON i.instrument_id=f.instrument_id AND i.trading_date=f.cond_date';
export async function requireDerived(conn) {
  const [[state]] = await conn.query('SELECT * FROM srb_derived.build_state WHERE singleton=1 FOR SHARE');
  if (state?.status !== 'READY') fail(409, 'DERIVED_NOT_READY');
  return state;
}
async function measure(conn, table, filter, partition, mfeWin, mfeThr) {
  const [[m]] = await conn.query(`
    SELECT COUNT(*) n,
      AVG(CASE WHEN f.anchor_date <= ? THEN f.executable END) exec_pct,
      AVG(CASE WHEN f.executable=1 AND f.mfe_end_${mfeWin} <= ?
        AND f.mfe_${mfeWin} IS NOT NULL THEN f.mfe_${mfeWin} >= ? END) pass_pct,
      SUM(f.executable=1 AND f.mfe_end_${mfeWin} <= ? AND f.mfe_${mfeWin} IS NOT NULL) n_evaluated,
      SUM(f.anchor_date <= ? AND f.nonexec_reason='LIMIT_UP_OPEN') n_limitup,
      SUM(f.anchor_date <= ? AND f.nonexec_reason='HALTED') n_halt
    ${featureJoin(table)} WHERE ${filter.where}`,
    [partition.date_to, partition.date_to, mfeThr, partition.date_to,
      partition.date_to, partition.date_to, ...filter.args]);
  return m;
}
export async function evalStack(conn, input) {
  const { part, mfeWin, mfeThr } = options(input);
  const state = await requireDerived(conn);
  const partition = await partitionFor(conn, part);
  const [[calendar]] = await conn.query(
    'SELECT COUNT(*) n FROM srb_derived.trading_calendar WHERE trading_date BETWEEN ? AND ?',
    [partition.date_from, partition.date_to]);
  const dayCount = Number(calendar.n);
  const applied = [], output = [];
  let previous = null;
  for (const row of [...input.rows].sort((a,b) => a.order_no-b.order_no)) {
    if (!row.enabled) { output.push({ ...row, n_survive: null, cut_pct: null, per_day: null,
      exec_pct: null, mfe_pass_pct: null, base_pass_pct: null, base_n: null, lift: null,
      is_quality: row.cond_key === 'MFE_QUALITY' }); continue; }
    applied.push(row);
    const m = await measure(conn, 'd_feat', predicates(applied, partition), partition, mfeWin, mfeThr);
    const b = await measure(conn, 'd_base',
      predicates(applied, partition, { skip: BASE_SKIP }), partition, mfeWin, mfeThr);
    const isQuality = row.cond_key === 'MFE_QUALITY';
    const n = Number(m.n);
    const pass = m.pass_pct == null ? null : Number(m.pass_pct);
    const basePass = b.pass_pct == null ? null : Number(b.pass_pct);
    output.push({ ...row, n_survive: n,
      cut_pct: isQuality || previous === null || previous === 0 ? 0 : 1 - n / previous,
      per_day: dayCount ? n / dayCount : 0,
      exec_pct: m.exec_pct == null ? null : Number(m.exec_pct),
      mfe_pass_pct: pass,
      base_pass_pct: basePass,
      base_n: Number(b.n_evaluated ?? 0),
      lift: pass != null && basePass ? pass / basePass : null,
      n_evaluated: Number(m.n_evaluated ?? 0), n_limitup: Number(m.n_limitup ?? 0),
      n_halt: Number(m.n_halt ?? 0), is_quality: isQuality });
    if (!isQuality) previous = n;
  }
  return { part, mfeWin, mfeThr, dateFrom: partition.date_from, dateTo: partition.date_to,
    dataAsOf: state.data_asof, buildId: state.build_id, dayCount, rows: output };
}
