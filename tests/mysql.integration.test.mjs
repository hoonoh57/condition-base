import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import fs from 'node:fs/promises';
import { once } from 'node:events';
import { schemaSql } from '../server/schema.mjs';
import { splitSql } from '../scripts/sql-runner.mjs';
import { buildDerived } from '../scripts/derived-service.mjs';
import { createApp } from '../server/app.mjs';

test('MySQL: derived SQL and full research workflow', { skip: !process.env.MYSQL_TEST_URL }, async t => {
  const url=new URL(process.env.MYSQL_TEST_URL);
  if (!['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('Integration DB must be local');
  const native=mysql.createPool({host:url.hostname,port:Number(url.port),user:decodeURIComponent(url.username),
    password:decodeURIComponent(url.password),dateStrings:true,decimalNumbers:true,supportBigNumbers:true,bigNumberStrings:true});
  const prefix='srb_test_'+Date.now();
  const names={marketData:prefix+'_market',core:prefix+'_core',derived:prefix+'_derived',lab:prefix+'_lab'};
  const wrap=c=>({query:(sql,args)=>c.query(schemaSql(sql,names),args),
    beginTransaction:()=>c.beginTransaction(),commit:()=>c.commit(),rollback:()=>c.rollback(),release:()=>c.release()});
  const pool={query:(sql,args)=>native.query(schemaSql(sql,names),args),getConnection:async()=>wrap(await native.getConnection())};
  t.after(async()=>{
    for (const name of Object.values(names)) {
      assert.match(name,/^srb_test_\d+_(market|core|derived|lab)$/);
      await native.query('DROP DATABASE IF EXISTS `'+name+'`');
    }
    await native.end();
  });
  await pool.query('CREATE DATABASE srb_core');
  await pool.query('CREATE DATABASE market_data');
  await pool.query(`CREATE TABLE market_data.korean_equity_daily (
    instrument_id BIGINT UNSIGNED,trading_date DATE,open BIGINT UNSIGNED,high BIGINT UNSIGNED,
    low BIGINT UNSIGNED,close BIGINT UNSIGNED,amount BIGINT UNSIGNED,
    PRIMARY KEY(instrument_id,trading_date))`);
  await pool.query(`CREATE TABLE market_data.market_instrument (
    instrument_id BIGINT UNSIGNED PRIMARY KEY,instrument_type VARCHAR(20),first_seen_date DATE,last_seen_date DATE)`);
  const conn=await pool.getConnection();
  for(const file of ['00_core/01_schema.sql','00_core/02_condition_def.sql','01_derived/00_inputs.sql','01_derived/01_schema.sql','03_lab/01_schema.sql']) {
    const source=await fs.readFile(new URL('../sql/'+file,import.meta.url),'utf8');
    for(const sql of splitSql(source)) await conn.query(sql);
  }
  conn.release();
  const repeat=await pool.getConnection();
  for(const statement of splitSql(await fs.readFile(new URL('../sql/00_core/01_schema.sql',import.meta.url),'utf8')))
    await repeat.query(statement);
  repeat.release();
  const [[seeds]]=await pool.query('SELECT COUNT(*) n FROM srb_core.improvement_item');
  assert.equal(Number(seeds.n),6);
  const dates=[];
  for(let d=new Date('2024-01-02T00:00:00Z');dates.length<260;d.setUTCDate(d.getUTCDate()+1)) {
    const day=d.toISOString().slice(0,10);
    if(d.getUTCDay()!==0&&d.getUTCDay()!==6&&day!=='2024-06-06') dates.push(day);
  }
  const candles=[];
  for(let instrument=1;instrument<=3;instrument++) {
    let price=10000+instrument*1000;
    for(let n=0;n<dates.length;n++) {
      if(instrument===2&&n===151) continue;
      const prior=price;
      price=Math.round(price*([130,150,175,205,218,235,255].includes(n)?1.12:1+Math.sin(n/7)*.004));
      let open=prior,high=Math.max(price,open)+100,low=Math.min(price,open)-100;
      if(instrument===3&&n===151) { open=high=low=price=Math.round(prior*1.3); }
      candles.push([instrument,dates[n],open,high,low,price,1e10+instrument*1e8+n*1000]);
    }
    await pool.query('INSERT INTO market_data.market_instrument VALUES (?,?,?,?)',[instrument,'EQUITY',dates[0],dates.at(-1)]);
  }
  await pool.query('INSERT INTO market_data.korean_equity_daily VALUES ?',[candles]);
  await buildDerived(pool,{log(){}});
  const [[missing]]=await pool.query('SELECT * FROM srb_derived.d_feat WHERE instrument_id=2 AND cond_date=?',[dates[150]]);
  assert.equal(missing.anchor_date,dates[151]);
  assert.equal(missing.nonexec_reason,'HALTED');
  assert.equal(missing.mfe_5,null);
  const [[limit]]=await pool.query('SELECT * FROM srb_derived.d_feat WHERE instrument_id=3 AND cond_date=?',[dates[150]]);
  assert.equal(limit.nonexec_reason,'LIMIT_UP_OPEN');
  const [[tail]]=await pool.query('SELECT * FROM srb_derived.d_feat WHERE instrument_id=1 AND cond_date=?',[dates[255]]);
  assert.equal(tail.mfe_5,null);
  const [[feature]]=await pool.query('SELECT * FROM srb_derived.d_feat WHERE instrument_id=1 AND cond_date=?',[dates[150]]);
  assert.equal(feature.amt_rank_mkt,3);
  assert.equal(feature.days_since_ignite,20);
  assert.ok(feature.bbw_pct_prev>=0&&feature.bbw_pct_prev<=100);
  assert.equal(feature.mktcap_krw,null);
  const [[ind]]=await pool.query('SELECT * FROM srb_derived.d_ind WHERE instrument_id=1 AND trading_date=?',[dates[150]]);
  const [[priorInd]]=await pool.query('SELECT * FROM srb_derived.d_ind WHERE instrument_id=1 AND trading_date=?',[dates[149]]);
  assert.equal(ind.ma60_prev,priorInd.ma60);
  assert.equal(ind.bbw_prev,priorInd.bbw);
  assert.ok(ind.atr20>0);
  for(const [part,from,to,max] of [['IS',dates[0],dates[190],999],['OOS',dates[191],dates[230],2],['VAULT',dates[231],dates[259],1]])
    await pool.query('UPDATE srb_lab.data_partition SET date_from=?,date_to=?,max_unlocks=? WHERE part=?',[from,to,max,part]);
  const baseline={costModelKey:'NA_DAILY',stopDefKey:'NA_DAILY',fillRuleKey:'T1_OPEN',taxScheduleVer:'UNVERIFIED',severity:'WORST'};
  const server=createApp({db:{dbPool:pool},settings:{baseline}}).listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base='http://127.0.0.1:'+server.address().port;
  const request=async(path,body,status=200)=>{
    const res=await fetch(base+'/api'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
    const data=await res.json();
    assert.equal(res.status,status,JSON.stringify(data));return data;
  };
  assert.equal((await request('/health?db=1')).databaseChecked,true);
  const catalog=await request('/strategies/conditions');
  assert.equal(catalog.conditions.find(c=>c.cond_key==='MKTCAP_BAND').available,false);
  const created=await request('/strategies',{name:'Integration strategy'},201);
  const initial=created.versionId;
  const hypothesis=async(versionId)=> (await request('/strategies/versions/'+versionId+'/hypotheses',
    {statement:'거래대금 하한으로 표본을 줄인다',predCut:.2,predPass:.4},201)).hypId;
  const hyp=await hypothesis(initial);
  await request('/stack/rows',{versionId:initial,hypId:hyp,condKey:'PRICE_BAND',params:{lo:50000,hi:1000}},400);
  const added=await request('/stack/rows',{versionId:initial,hypId:hyp,condKey:'AMT20_MIN',params:{min_krw:0}},201);
  assert.equal(added.rows.length,2);
  assert.ok(added.rows[1].n_survive>0);
  assert.equal(added.rows[1].n_evaluated,4);
  assert.equal(added.rows[1].n_survive,9);
  assert.ok(Math.abs(added.rows[1].per_day-9/191)<1e-8);
  assert.equal((await request('/ledger')).N,1);
  await request('/stack/rows',{versionId:initial,hypId:hyp,condKey:'PRICE_BAND',params:{lo:0,hi:1e9}},403);
  await request('/stack?versionId='+added.versionId+'&mfeWin=5');
  await request('/stack?versionId='+added.versionId+'&mfeWin=10');
  assert.equal((await request('/ledger')).N,1);
  const candidates=await request('/stack/candidates?versionId='+added.versionId);
  assert.ok(candidates.rows.length>0);
  const sample=candidates.rows[0];
  const evidence=await request('/bars?instrumentId='+sample.instrument_id+'&cond_date='+sample.cond_date+'&versionId='+added.versionId);
  assert.ok(evidence.candles.length>0);
  assert.ok(evidence.candles.every(c=>c.time<=dates[190]));
  await request('/bars?instrumentId=1&cond_date='+dates[205]+'&versionId='+added.versionId,undefined,403);
  await request('/stack?versionId='+added.versionId+'&part=OOS',undefined,403);
  const oos=await request('/stack/measure',{versionId:added.versionId,hypId:await hypothesis(added.versionId),part:'OOS'},201);
  assert.equal(oos.part,'OOS');
  assert.equal((await request('/stack?versionId='+oos.versionId+'&part=OOS')).stored,true);
  await request('/stack?versionId='+oos.versionId+'&part=OOS&mfeThr=.2',undefined,403);
  const after=(await request('/ledger'));
  assert.equal(after.N,2);
  assert.equal(after.partitions.find(p=>p.part==='OOS').unlock_count,1);
  const frozenHyp=await hypothesis(added.versionId);
  await request('/stack/rows/update',{versionId:added.versionId,hypId:frozenHyp,orderNo:1,enabled:false},409);
  const toggled=await request('/stack/rows/update',{versionId:added.versionId,hypId:frozenHyp,orderNo:2,enabled:false},201);
  assert.equal(toggled.rows[1].enabled,false);
  assert.equal(toggled.rows[1].n_survive,null);
  assert.equal((await request('/strategies/versions/'+added.versionId)).rows[1].enabled,true);
  // Failure after version/trial creation must roll back all writes and the holdout budget.
  const failureHyp=await hypothesis(toggled.versionId);
  await pool.query("UPDATE srb_lab.data_partition SET unlock_count=max_unlocks WHERE part='VAULT'");
  const [[before]]=await pool.query('SELECT COUNT(*) n FROM srb_lab.strategy_version');
  await request('/stack/measure',{versionId:toggled.versionId,hypId:failureHyp,part:'VAULT'},409);
  const [[afterVersions]]=await pool.query('SELECT COUNT(*) n FROM srb_lab.strategy_version');
  assert.equal(afterVersions.n,before.n);
  const [[stillOpen]]=await pool.query('SELECT verdict FROM srb_lab.hypothesis WHERE hyp_id=?',[failureHyp]);
  assert.equal(stillOpen.verdict,'OPEN');
  assert.equal((await request('/ledger')).N,3);
  // Mid-transaction failure after snapshots must roll back every research write.
  await pool.query(`CREATE TRIGGER srb_lab.fail_hypothesis BEFORE UPDATE ON srb_lab.hypothesis
    FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test rollback after snapshots'`);
  await request('/stack/measure',{versionId:toggled.versionId,hypId:failureHyp,part:'IS'},500);
  await pool.query('DROP TRIGGER srb_lab.fail_hypothesis');
  const [[afterFailure]]=await pool.query('SELECT COUNT(*) n FROM srb_lab.strategy_version');
  assert.equal(afterFailure.n,before.n);
  assert.equal((await request('/ledger')).N,3);
  // Distinct hypotheses on the same parent serialize version numbers correctly.
  const parallelHyp=await hypothesis(toggled.versionId);
  const concurrent=await Promise.all([
    request('/stack/measure',{versionId:toggled.versionId,hypId:failureHyp},201),
    request('/stack/measure',{versionId:toggled.versionId,hypId:parallelHyp},201),
  ]);
  assert.notEqual(concurrent[0].versionId,concurrent[1].versionId);
  const extra=await request('/stack/rows',{versionId:concurrent[0].versionId,
    hypId:await hypothesis(concurrent[0].versionId),condKey:'PRICE_BAND',params:{lo:0,hi:1000000000}},201);
  const reordered=await request('/stack/order',{versionId:extra.versionId,
    hypId:await hypothesis(extra.versionId),order:[1,3,2]},201);
  assert.equal(reordered.rows[1].cond_key,'PRICE_BAND');
  const edited=await request('/stack/rows/update',{versionId:reordered.versionId,
    hypId:await hypothesis(reordered.versionId),orderNo:2,params:{lo:999999999,hi:1000000000}},201);
  assert.equal(edited.rows[1].n_survive,0);
  assert.equal(edited.rows[1].mfe_pass_pct,null);
  assert.ok(Array.isArray((await request('/supply')).items));
  // Optional source values are only valid once known, never backfilled into the past.
  await pool.query('INSERT INTO srb_derived.shares_history VALUES (1,?,?,1000)',[dates[0],dates[200]]);
  await buildDerived(pool,{log(){}});
  await request('/stack/candidates?versionId='+oos.versionId+'&part=OOS',undefined,409);
  const [[past]]=await pool.query('SELECT mktcap_krw FROM srb_derived.d_feat WHERE instrument_id=1 AND cond_date=?',[dates[150]]);
  const [[future]]=await pool.query('SELECT mktcap_krw FROM srb_derived.d_feat WHERE instrument_id=1 AND cond_date=?',[dates[205]]);
  assert.equal(past.mktcap_krw,null);
  assert.ok(Number(future.mktcap_krw)>0);
  const universeSql=splitSql(await fs.readFile(new URL('../sql/02_checks/p0_universe.sql',import.meta.url),'utf8'));
  const universeConn=await pool.getConnection();
  await universeConn.query('SET @universe_top_n=2');
  for(const sql of universeSql) await universeConn.query(sql);
  const [sizes]=await universeConn.query('SELECT as_of,COUNT(*) n FROM srb_derived.universe_snapshot GROUP BY as_of');
  assert.ok(sizes.every(r=>Number(r.n)<=2));
  universeConn.release();
  if (process.env.BROWSER_TEST==='1') {
    const { browserWorkflow }=await import('./browser-workflow.mjs');
    await browserWorkflow(base);
  }
});
