import { Router } from 'express';
import { route, id, number, options, transaction, fail } from '../http.mjs';
import { browseStack, mutateStack, loadRows, storedResult } from '../research.mjs';
import { partitionFor, predicates, featureJoin, requireDerived } from '../stack.mjs';

export default function stack({ dbPool }, settings) {
  const router = Router();
  router.get('/', route(async (req,res) => {
    const versionId=id(req.query.versionId);
    res.json(await transaction(dbPool, conn => browseStack(conn,versionId,options(req.query))));
  }));
  router.get('/candidates', route(async (req,res) => {
    const versionId=id(req.query.versionId), opts=options(req.query);
    res.json(await transaction(dbPool, async conn => {
      const state=await requireDerived(conn);
      const measured = await browseStack(conn,versionId,opts);
      const partition=await partitionFor(conn,opts.part);
      const filter=predicates(await loadRows(conn,versionId),partition);
      const [rows]=await conn.query(`SELECT f.instrument_id,f.cond_date,f.close,
        CASE WHEN f.anchor_date<=? THEN f.anchor_date END anchor_date,
        CASE WHEN f.anchor_date<=? THEN f.executable END executable,
        CASE WHEN f.mfe_end_${opts.mfeWin}<=? THEN f.mfe_${opts.mfeWin} END mfe
        ${featureJoin} WHERE ${filter.where} ORDER BY f.cond_date DESC,f.instrument_id LIMIT 100`,
        [partition.date_to,partition.date_to,partition.date_to,...filter.args]);
      if (opts.part !== 'IS') {
        // Rebuilt data cannot be browsed as though it were the old paid measurement.
        if (state.build_id !== measured.buildId)
          fail(409,'MEASUREMENT_DATA_CHANGED');
      }
      return { rows };
    }));
  }));
  router.get('/snapshot/:versionId', route(async (req,res) => {
    const result=await transaction(dbPool,conn=>storedResult(conn,id(req.params.versionId)));
    if (!result) fail(404,'MEASUREMENT_NOT_FOUND');
    res.json(result);
  }));
  for (const [path,action] of [['/rows','add'],['/rows/update','update'],['/order','reorder'],['/measure','measure']]) {
    router.post(path,route(async (req,res) => {
      const input={...req.body,versionId:id(req.body.versionId),hypId:id(req.body.hypId),action};
      if (action==='update') input.orderNo=number(req.body.orderNo,1,32,'orderNo',true);
      if (input.memo !== undefined && (typeof input.memo!=='string'||input.memo.length>255)) fail(400,'INVALID_MEMO');
      res.status(201).json(await transaction(dbPool,conn=>mutateStack(conn,input,settings.baseline)));
    }));
  }
  return router;
}
