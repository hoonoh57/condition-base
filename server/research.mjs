import { hash } from './hash.mjs';
import { fail, json, options } from './http.mjs';
import { validateParams } from './conditions.mjs';
import { catalog } from './catalog.mjs';
import { requireHypothesis, chargeTrial, consumePartition } from './guards.mjs';
import { evalStack, requireDerived } from './stack.mjs';

export async function version(conn, versionId, lock = false) {
  const [[v]] = await conn.query('SELECT * FROM srb_lab.strategy_version WHERE version_id=?', [versionId]);
  if (!v) fail(404, 'VERSION_NOT_FOUND');
  if (lock) await conn.query('SELECT strategy_id FROM srb_lab.strategy WHERE strategy_id=? FOR UPDATE', [v.strategy_id]);
  return v;
}
export async function loadRows(conn, versionId) {
  const [rows] = await conn.query(`SELECT r.*,d.label_ko,d.role FROM srb_lab.strategy_condition r
    JOIN srb_core.condition_def d ON d.cond_key=r.cond_key WHERE version_id=? ORDER BY order_no`, [versionId]);
  return rows.map(r => ({ ...r, params: json(r.params), enabled: Boolean(r.enabled), frozen: Boolean(r.frozen) }));
}
export async function storedResult(conn, versionId) {
  const [[m]] = await conn.query('SELECT * FROM srb_lab.measurement WHERE version_id=?', [versionId]);
  return m ? { ...json(m.result), versionId: String(versionId), stored: true } : null;
}
export async function browseStack(conn, versionId, input) {
  if ((input.part ?? 'IS') === 'IS') await requireDerived(conn);
  await version(conn, versionId);
  const opts = options(input);
  if (opts.part !== 'IS') {
    const stored = await storedResult(conn, versionId);
    if (!stored || stored.part !== opts.part || stored.mfeWin !== opts.mfeWin || stored.mfeThr !== opts.mfeThr)
      fail(403, 'HOLDOUT_MEASUREMENT_REQUIRED');
    return stored;
  }
  const rows = await loadRows(conn, versionId);
  return { versionId, ...(await evalStack(conn, { rows, ...opts })), stored: false };
}
async function saveBaseline(conn, baseline) {
  const value = { ...baseline, costParams: {}, stopParams: {} };
  const key = hash(value);
  await conn.query(`INSERT IGNORE INTO srb_lab.baseline
    (baseline_hash,cost_model_key,cost_params,stop_def_key,stop_params,fill_rule_key,tax_schedule_ver,severity)
    VALUES (?,?,?,?,?,?,?,?)`, [key, baseline.costModelKey, '{}', baseline.stopDefKey, '{}',
    baseline.fillRuleKey, baseline.taxScheduleVer, baseline.severity]);
  return key;
}
export async function mutateStack(conn, input, baseline) {
  await requireDerived(conn);
  const { versionId, hypId, action } = input;
  const opts = options(input);
  const source = await version(conn, versionId, true);
  const hypothesis = await requireHypothesis(conn, versionId, hypId);
  const rows = await loadRows(conn, versionId);
  if (action === 'add') {
    if (rows.length >= 32) fail(409, 'STACK_LIMIT');
    if (rows.some(r => r.cond_key === input.condKey)) fail(409, 'CONDITION_EXISTS');
    const params = validateParams(input.condKey, input.params);
    rows.push({ order_no: rows.length+1, cond_key: input.condKey, params, enabled: true, frozen: false });
  } else if (action === 'update') {
    const row = rows.find(r => r.order_no === input.orderNo);
    if (!row) fail(404, 'ROW_NOT_FOUND');
    if (row.frozen) fail(409, 'ROW_FROZEN');
    if (input.enabled === undefined && input.params === undefined) fail(400, 'EMPTY_CHANGE');
    if (input.enabled !== undefined) {
      if (typeof input.enabled !== 'boolean') fail(400, 'INVALID_ENABLED');
      row.enabled = input.enabled;
    }
    if (input.params !== undefined) row.params = validateParams(row.cond_key, input.params);
  } else if (action === 'reorder') {
    if (!Array.isArray(input.order) || input.order.length !== rows.length
      || new Set(input.order).size !== rows.length) fail(400, 'INVALID_ORDER');
    for (const row of rows) {
      const index = input.order.indexOf(row.order_no);
      if (index < 0 || (row.frozen && index+1 !== row.order_no)) fail(400, 'INVALID_ORDER');
      row.order_no = index+1;
    }
  } else if (action !== 'measure') fail(400, 'INVALID_ACTION');
  if (action === 'add' && input.condKey === 'MFE_QUALITY') {
    const quality = rows.find(r => r.cond_key === 'MFE_QUALITY');
    opts.mfeWin = quality.params.win; opts.mfeThr = quality.params.thr;
  }
  if (action === 'update' && input.params && rows.find(r=>r.order_no===input.orderNo)?.cond_key === 'MFE_QUALITY') {
    opts.mfeWin = input.params.win; opts.mfeThr = input.params.thr;
  }
  const defs = await catalog(conn);
  for (const row of rows.filter(r => r.enabled)) {
    if (!defs.conditions.find(d => d.cond_key===row.cond_key)?.available) fail(422, 'CONDITION_UNAVAILABLE', row.cond_key);
  }
  if (!rows.some(r => r.enabled && r.cond_key !== 'MFE_QUALITY')) fail(400, 'EMPTY_STACK');
  const [[latest]] = await conn.query('SELECT ver FROM srb_lab.strategy_version WHERE strategy_id=? ORDER BY ver DESC LIMIT 1 FOR UPDATE', [source.strategy_id]);
  const paramsHash = hash(rows.map(({ order_no, cond_key, enabled, params }) => ({ order_no, cond_key, enabled, params })));
  const [insert] = await conn.query(`INSERT INTO srb_lab.strategy_version (strategy_id,ver,params_hash,memo)
    VALUES (?,?,?,?)`, [source.strategy_id, Number(latest.ver)+1, paramsHash, input.memo ?? action]);
  const newVer = String(insert.insertId);
  for (const row of rows) await conn.query(`INSERT INTO srb_lab.strategy_condition
    (version_id,order_no,cond_key,enabled,params,frozen) VALUES (?,?,?,?,?,?)`,
    [newVer, row.order_no, row.cond_key, row.enabled, JSON.stringify(row.params), row.frozen]);
  await chargeTrial(conn, { versionId: newVer, condKey: input.condKey ?? action.toUpperCase(),
    paramsHash: hash({ paramsHash, ...opts }), hypId, part: opts.part });
  await consumePartition(conn, opts.part);
  const result = await evalStack(conn, { rows: await loadRows(conn, newVer), ...opts });
  const baselineHash = await saveBaseline(conn, baseline);
  for (const row of result.rows.filter(r => r.enabled)) await conn.query(`INSERT INTO srb_lab.stack_snapshot
    (version_id,order_no,n_survive,cut_pct,per_day,mfe_pass_pct,exec_pct,mfe_win,mfe_thr,baseline_hash,data_asof)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [newVer,row.order_no,row.n_survive,row.cut_pct,row.per_day,
    row.mfe_pass_pct,row.exec_pct,result.mfeWin,result.mfeThr,baselineHash,result.dataAsOf]);
  const last = result.rows.filter(r => r.enabled).at(-1);
  // Tolerance is fixed and documented; do not choose it after seeing results.
  const verdict = last.mfe_pass_pct === null || !last.n_evaluated ? 'INCONCLUSIVE'
    : Math.abs(last.cut_pct-Number(hypothesis.pred_cut_pct)) <= .10
      && last.mfe_pass_pct >= Number(hypothesis.pred_pass_pct) ? 'CONFIRMED' : 'REJECTED';
  await conn.query(`UPDATE srb_lab.hypothesis SET measured_cut_pct=?,measured_pass_pct=?,
    verdict=?,decided_at=CURRENT_TIMESTAMP WHERE hyp_id=?`, [last.cut_pct,last.mfe_pass_pct,verdict,hypId]);
  result.hypothesis = { hypId, verdict, predictedCut: Number(hypothesis.pred_cut_pct),
    predictedPass: Number(hypothesis.pred_pass_pct), measuredCut: last.cut_pct, measuredPass: last.mfe_pass_pct };
  result.baselineHash = baselineHash;
  await conn.query(`INSERT INTO srb_lab.measurement
    (version_id,parent_version_id,part,baseline_hash,data_asof,result) VALUES (?,?,?,?,?,?)`,
    [newVer,versionId,opts.part,baselineHash,result.dataAsOf,JSON.stringify(result)]);
  await conn.query("UPDATE srb_lab.strategy_version SET status='TESTED' WHERE version_id=?", [newVer]);
  return { versionId: newVer, ...result, stored: true };
}
