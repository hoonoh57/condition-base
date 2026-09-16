import { Router } from 'express';
import { route, connection } from '../http.mjs';
import { ledger } from '../guards.mjs';
export default function ledgerRoutes({ readerPool }) {
  const router=Router();
  router.get('/',route(async (_req,res)=>res.json(await connection(readerPool,async conn=>{
    const summary=await ledger(conn);
    const [partitions]=await conn.query('SELECT * FROM srb_lab.data_partition ORDER BY date_from');
    const [trials]=await conn.query(`SELECT t.*,h.statement,h.verdict,h.pred_cut_pct,h.pred_pass_pct,
      h.measured_cut_pct,h.measured_pass_pct,v.ver,s.name strategy_name
      FROM srb_lab.trial_ledger t LEFT JOIN srb_lab.hypothesis h ON h.hyp_id=t.hyp_id
      JOIN srb_lab.strategy_version v ON v.version_id=t.version_id
      JOIN srb_lab.strategy s ON s.strategy_id=v.strategy_id ORDER BY t.trial_id DESC LIMIT 200`);
    return {...summary,partitions,trials};
  }))));
  return router;
}
