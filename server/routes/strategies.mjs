import { Router } from 'express';
import { route, id, text, number, connection, transaction } from '../http.mjs';
import { hash } from '../hash.mjs';
import { version, loadRows } from '../research.mjs';
import { catalog } from '../catalog.mjs';

export default function strategies({ readerPool, labPool }) {
  const router = Router();
  router.get('/', route(async (_req, res) => {
    res.json(await connection(readerPool, async conn => {
      const [strategies] = await conn.query(`SELECT s.*,
        (SELECT MAX(version_id) FROM srb_lab.strategy_version v WHERE v.strategy_id=s.strategy_id) latest_version_id
        FROM srb_lab.strategy s ORDER BY s.strategy_id DESC`);
      return { strategies };
    }));
  }));
  router.get('/conditions', route(async (_req, res) => res.json(await connection(readerPool, catalog))));
  router.post('/', route(async (req, res) => {
    const name = text(req.body.name, 80, 'name');
    res.status(201).json(await transaction(labPool, async conn => {
      const [s] = await conn.query('INSERT INTO srb_lab.strategy (name) VALUES (?)', [name]);
      const anchor = { lo: .10, hi: .15 };
      const [v] = await conn.query(`INSERT INTO srb_lab.strategy_version (strategy_id,ver,params_hash,memo)
        VALUES (?,1,?,'Initial anchor')`, [s.insertId, hash(anchor)]);
      await conn.query(`INSERT INTO srb_lab.strategy_condition
        (version_id,order_no,cond_key,enabled,params,frozen) VALUES (?,1,'IGNITE_10_15',1,?,1)`,
        [v.insertId, JSON.stringify(anchor)]);
      return { strategyId: String(s.insertId), versionId: String(v.insertId) };
    }));
  }));
  router.get('/:strategyId/versions', route(async (req, res) => {
    const strategyId = id(req.params.strategyId);
    const [versions] = await readerPool.query(`SELECT v.*,m.part,m.data_asof,m.measured_at
      FROM srb_lab.strategy_version v LEFT JOIN srb_lab.measurement m ON m.version_id=v.version_id
      WHERE v.strategy_id=? ORDER BY v.ver DESC`, [strategyId]);
    res.json({ versions });
  }));
  router.get('/versions/:versionId', route(async (req, res) => {
    const versionId = id(req.params.versionId);
    res.json(await connection(readerPool, async conn => ({ version: await version(conn, versionId),
      rows: await loadRows(conn, versionId) })));
  }));
  router.get('/versions/:versionId/hypotheses', route(async (req, res) => {
    const [hypotheses] = await readerPool.query(
      'SELECT * FROM srb_lab.hypothesis WHERE version_id=? ORDER BY hyp_id DESC', [id(req.params.versionId)]);
    res.json({ hypotheses });
  }));
  router.post('/versions/:versionId/hypotheses', route(async (req, res) => {
    const versionId = id(req.params.versionId);
    const statement = text(req.body.statement,255,'statement');
    const cut = number(req.body.predCut,0,1,'predCut');
    const pass = number(req.body.predPass,0,1,'predPass');
    res.status(201).json(await transaction(labPool, async conn => {
      await version(conn,versionId,true);
      const [result] = await conn.query(`INSERT INTO srb_lab.hypothesis
        (version_id,origin,statement,pred_cut_pct,pred_pass_pct) VALUES (?,'HUMAN',?,?,?)`,
        [versionId,statement,cut,pass]);
      return { hypId: String(result.insertId) };
    }));
  }));
  return router;
}
