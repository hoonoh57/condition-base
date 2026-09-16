import { availability } from './conditions.mjs';
import { json } from './http.mjs';

export async function coverage(conn) {
  const [[state]] = await conn.query('SELECT * FROM srb_derived.build_state WHERE singleton=1');
  if (state?.status !== 'READY') return { ready: false, status: state?.status ?? 'NOT_BUILT' };
  const [[counts]] = await conn.query(`SELECT COUNT(*) n, COUNT(mktcap_krw) shares,
    COALESCE(SUM(status_known),0) statuses FROM srb_derived.d_feat`);
  return { ready: true, status: state.status, dataAsOf: state.data_asof, candidates: Number(counts.n),
    sharesComplete: Number(counts.n)>0 && Number(counts.n)===Number(counts.shares),
    statusComplete: Number(counts.n)>0 && Number(counts.n)===Number(counts.statuses) };
}
export async function catalog(conn) {
  const status = await coverage(conn);
  const [defs] = await conn.query('SELECT * FROM srb_core.condition_def ORDER BY slot,cond_key');
  return { coverage: status, conditions: defs.map(d => ({ ...d,
    defaults: json(d.param_schema), ...availability(d, status) })) };
}
