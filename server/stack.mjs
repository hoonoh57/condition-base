import { buildPredicate } from './conditions.mjs';

export async function evalStack(conn, { rows, part, mfeWin = 20, mfeThr = 0.08 }) {
  const p = await conn.query(
    'SELECT date_from,date_to FROM srb_core.data_partition WHERE part=?', [part]);
  const { date_from, date_to } = p[0][0];
  const mfeCol = ({5:'mfe_5',10:'mfe_10',20:'mfe_20',40:'mfe_40'})[mfeWin];
  if (!mfeCol) throw new Error('bad mfe window');

  const base = ['f.cond_date BETWEEN ? AND ?'];
  const baseArgs = [date_from, date_to];
  const out = [];
  let prevN = null;

  const active = rows.filter(r => r.enabled).sort((a,b) => a.order_no - b.order_no);

  for (const r of active) {
    const frag = buildPredicate(r.cond_key, r.params);
    if (frag) { base.push(`(${frag.sql})`); baseArgs.push(...frag.args); }

    const where = base.join(' AND ');
    const [[m]] = await conn.query(
      `SELECT COUNT(*) n,
              COUNT(DISTINCT f.cond_date) d,
              AVG(f.executable) exec_pct,
              AVG(CASE WHEN f.executable=1 AND f.${mfeCol} >= ? THEN 1
                       WHEN f.executable=1 THEN 0 END) pass_pct,
              SUM(f.nonexec_reason='LIMIT_UP_OPEN') n_limitup,
              SUM(f.nonexec_reason='HALTED')        n_halt
         FROM srb_derived.d_feat f
        WHERE ${where}`, [mfeThr, ...baseArgs]);

    out.push({
      order_no: r.order_no, cond_key: r.cond_key,
      n_survive: m.n,
      cut_pct: prevN === null ? 0 : (prevN ? 1 - m.n / prevN : 0),
      per_day: m.d ? m.n / m.d : 0,
      exec_pct: m.exec_pct, mfe_pass_pct: m.pass_pct,
      n_limitup: m.n_limitup, n_halt: m.n_halt,
      is_quality: frag === null,
    });
    if (frag) prevN = m.n;
  }
  return { mfeWin, mfeThr, part, rows: out };
}
// routes/stack.mjs 요지
router.post('/rows', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { versionId, condKey, params, hypId, part = 'IS', mfeWin, mfeThr } = req.body;
    await requireHypothesis(conn, versionId);
    const newVer = await forkVersion(conn, versionId);        // 항상 새 버전
    const orderNo = await nextOrderNo(conn, newVer);
    await conn.query(`INSERT INTO srb_core.strategy_condition
      (version_id,order_no,cond_key,enabled,params) VALUES (?,?,?,1,?)`,
      [newVer, orderNo, condKey, JSON.stringify(params)]);
    await chargeTrial(conn, { versionId: newVer, condKey,
      paramsHash: sha1(JSON.stringify(params)), hypId, part });
    await consumePartition(conn, part);
    const rows = await loadRows(conn, newVer);
    const result = await evalStack(conn, { rows, part, mfeWin, mfeThr });
    await saveSnapshots(conn, newVer, result);
    await closeHypothesis(conn, hypId, result);               // 예측 대 실측 확정
    await conn.commit();
    res.json({ versionId: newVer, ...result });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});
