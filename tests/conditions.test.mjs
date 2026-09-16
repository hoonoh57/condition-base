import test from 'node:test';
import assert from 'node:assert/strict';
import { validateParams, buildPredicate } from '../server/conditions.mjs';
import { schemaSql } from '../server/schema.mjs';
import { hash } from '../server/hash.mjs';
import { options, date } from '../server/http.mjs';

test('condition validation rejects unknown outcomes, SQL payloads and ignored settings',()=>{
  assert.throws(()=>buildPredicate('mfe_20',{}),/CONDITION_UNAVAILABLE/);
  assert.throws(()=>buildPredicate('__proto__',{}),/CONDITION_UNAVAILABLE/);
  assert.throws(()=>validateParams('PRICE_BAND',{lo:0,hi:1,mfe_20:1}),/UNKNOWN_PARAM/);
  assert.throws(()=>validateParams('PRICE_BAND',{lo:'0 OR 1=1',hi:100}),/INVALID_PARAM/);
  assert.throws(()=>validateParams('PRICE_BAND',{lo:100,hi:1}),/INVALID_RANGE/);
  assert.throws(()=>validateParams('HH20_BREAK',{len:30}),/INVALID_NUMBER/);
  assert.throws(()=>validateParams('MFE_QUALITY',{win:15,thr:.08}),/INVALID_MFE_WINDOW/);
});
test('predicates bind values and keep QUALITY separate from filters',()=>{
  assert.deepEqual(buildPredicate('PRICE_BAND',{lo:10,hi:50}),{sql:'f.close BETWEEN ? AND ?',args:[10,50]});
  assert.equal(buildPredicate('MFE_QUALITY',{win:20,thr:.08}),null);
  assert.equal(buildPredicate('BB_UPPER_BREAK',{len:20,mult:3,buf_atr:1}).args[0],3);
});
test('schema names are mapped as identifiers without rewriting string literals',()=>{
  const names={core:'my_core',lab:'my_lab',derived:'my_derived',marketData:'my_market'};
  assert.equal(schemaSql("SELECT 'srb_core' FROM srb_core.strategy",names),"SELECT 'srb_core' FROM `my_core`.strategy");
  assert.throws(()=>schemaSql('SELECT * FROM srb_core.strategy',{...names,core:'x; DROP DATABASE a'}),/Invalid schema/);
});
test('parameter hashes are independent of object key order',()=>{
  assert.equal(hash({a:1,b:{x:2,y:3}}),hash({b:{y:3,x:2},a:1}));
});
test('partition, window and calendar-date inputs are validated',()=>{
  assert.throws(()=>options({part:'ALL'}),/INVALID_PARTITION/);
  assert.throws(()=>options({mfeWin:'20;DROP'}),/INVALID_NUMBER/);
  assert.throws(()=>date('2024-02-30'),/INVALID_DATE/);
  assert.equal(date('2024-02-29'),'2024-02-29');
});
