import { Router } from 'express';
import { route, id, date, fail, transaction, options } from '../http.mjs';
import { partitionFor, requireDerived, predicates, featureJoin } from '../stack.mjs';
import { version, storedResult, loadRows } from '../research.mjs';
export default function bars({ dbPool }) {
  const router=Router();
  router.get('/',route(async (req,res)=>{
    const instrumentId=id(req.query.instrumentId ?? req.query.code);
    const condDate=date(req.query.cond_date), versionId=id(req.query.versionId ?? req.query.version);
    const opts=options(req.query);
    res.json(await transaction(dbPool,async conn=>{
      const state=await requireDerived(conn);
      await version(conn,versionId);
      const partition=await partitionFor(conn,opts.part);
      if (condDate<partition.date_from||condDate>partition.date_to) fail(403,'DATE_OUTSIDE_PARTITION');
      if (opts.part!=='IS') {
        const saved=await storedResult(conn,versionId);
        if (saved?.part!==opts.part) fail(403,'HOLDOUT_MEASUREMENT_REQUIRED');
        if (state.build_id!==saved.buildId) fail(409,'MEASUREMENT_DATA_CHANGED');
      }
      const filter=predicates(await loadRows(conn,versionId),partition);
      const [[feature]]=await conn.query(`SELECT f.anchor_date,f.anchor_open ${featureJoin}
        WHERE f.instrument_id=? AND f.cond_date=? AND ${filter.where}`,[instrumentId,condDate,...filter.args]);
      if (!feature) fail(404,'CANDIDATE_NOT_FOUND');
      const [rows]=await conn.query(`SELECT d.trading_date time,d.open,d.high,d.low,d.close,d.amount,
        i.ma60,i.ma20+2*i.sd20 bb_up FROM market_data.korean_equity_daily d
        LEFT JOIN srb_derived.d_ind i ON i.instrument_id=d.instrument_id AND i.trading_date=d.trading_date
        WHERE d.instrument_id=? AND d.trading_date BETWEEN GREATEST(?,DATE_SUB(?,INTERVAL 180 DAY))
        AND LEAST(?,DATE_ADD(?,INTERVAL 90 DAY)) ORDER BY d.trading_date`,
        [instrumentId,partition.date_from,condDate,partition.date_to,condDate]);
      const line=key=>rows.filter(r=>r[key]!=null).map(r=>({time:r.time,value:Number(r[key])}));
      const visible=feature.anchor_date&&feature.anchor_date<=partition.date_to;
      return {instrumentId,cond_date:condDate,anchor_date:visible?feature.anchor_date:null,
        anchor_open:visible?Number(feature.anchor_open):null,
        candles:rows.map(r=>({time:r.time,open:Number(r.open),high:Number(r.high),low:Number(r.low),close:Number(r.close)})),
        ma60:line('ma60'),bb_up:line('bb_up'),volume:line('amount')};
    }));
  }));
  return router;
}
