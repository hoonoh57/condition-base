import { Router } from 'express';
import { route, connection, id, date } from '../http.mjs';
import { coverage } from '../catalog.mjs';
export default function supply({ readerPool }) {
  const router=Router();
  router.get('/',route(async (req,res)=>res.json(await connection(readerPool,async conn=>{
    const data=await coverage(conn);
    const [items]=await conn.query('SELECT * FROM srb_core.improvement_item ORDER BY item_id');
    let rows=[];
    if (req.query.instrumentId) {
      const instrumentId=id(req.query.instrumentId), asOf=date(req.query.asOf);
      // Only IS is available through free browsing.
      const [[partition]]=await conn.query("SELECT date_from,date_to FROM srb_lab.data_partition WHERE part='IS'");
      const upper=asOf<partition.date_to?asOf:partition.date_to;
      [rows]=await conn.query(`SELECT trading_date,foreign_net,institution_net,known_date
        FROM srb_derived.investor_flow WHERE instrument_id=? AND trading_date BETWEEN ? AND ?
        AND known_date<=? ORDER BY trading_date DESC,known_date DESC LIMIT 100`,
        [instrumentId,partition.date_from,upper,upper]);
    }
    return {coverage:data,items,rows,available:rows.length>0,
      note:'일자별 상장주식수·상장상태·수급은 known_date가 있는 원천 자료를 입력해야 합니다.'};
  }))));
  return router;
}
