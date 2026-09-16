export async function requireHypothesis(conn, versionId) {
  const [[h]] = await conn.query(
    'SELECT COUNT(*) c FROM srb_core.hypothesis WHERE version_id=? AND verdict="OPEN"',
    [versionId]);
  if (!h.c) { const e = new Error('HYPOTHESIS_REQUIRED'); e.status = 403; throw e; }
}

export async function chargeTrial(conn, { versionId, condKey, paramsHash, hypId, part }) {
  await conn.query(
    `INSERT IGNORE INTO srb_core.trial_ledger
     (version_id,cond_key,params_hash,hyp_id,partition_used) VALUES (?,?,?,?,?)`,
    [versionId, condKey, paramsHash, hypId, part]);
}

export async function consumePartition(conn, part) {
  if (part === 'IS') return;
  const [r] = await conn.query(
    `UPDATE srb_core.data_partition
        SET unlock_count = unlock_count + 1
      WHERE part=? AND unlock_count < max_unlocks`, [part]);
  if (!r.affectedRows) { const e = new Error('PARTITION_BUDGET_EXHAUSTED'); e.status = 409; throw e; }
}

export async function ledger(conn) {
  const [[t]] = await conn.query('SELECT COUNT(*) n FROM srb_core.trial_ledger');
  const N = Math.max(t.n, 1);
  return { N, q_threshold: 0.10, bonferroni_alpha: 0.05 / N };
}
