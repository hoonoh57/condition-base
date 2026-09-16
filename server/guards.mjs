import { fail } from './http.mjs';

export async function requireHypothesis(conn, versionId, hypId) {
  const [[hypothesis]] = await conn.query(
    'SELECT * FROM srb_lab.hypothesis WHERE hyp_id=? AND version_id=? FOR UPDATE', [hypId, versionId]);
  if (!hypothesis || hypothesis.verdict !== 'OPEN') fail(403, 'HYPOTHESIS_REQUIRED');
  return hypothesis;
}
export async function chargeTrial(conn, { versionId, condKey, paramsHash, hypId, part }) {
  await conn.query(
    'INSERT INTO srb_lab.trial_ledger (version_id,cond_key,params_hash,hyp_id,partition_used) VALUES (?,?,?,?,?)',
    [versionId, condKey, paramsHash, hypId, part]);
}
export async function consumePartition(conn, part) {
  const [[partition]] = await conn.query('SELECT * FROM srb_lab.data_partition WHERE part=? FOR UPDATE', [part]);
  if (!partition) fail(400, 'INVALID_PARTITION');
  if (part === 'IS') return;
  if (partition.unlock_count >= partition.max_unlocks) fail(409, 'PARTITION_BUDGET_EXHAUSTED');
  await conn.query('UPDATE srb_lab.data_partition SET unlock_count=unlock_count+1 WHERE part=?', [part]);
}
export async function ledger(conn) {
  const [[t]] = await conn.query('SELECT COUNT(*) n FROM srb_lab.trial_ledger');
  const N = Number(t.n);
  return { N, q_threshold: .10, bonferroni_alpha: N ? .05 / N : null };
}
