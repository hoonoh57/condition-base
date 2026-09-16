import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseCredentials } from '../server/db-config.mjs';
import * as database from '../server/db.mjs';
import { safeConfig } from '../server/config.mjs';

test('one credential pair overrides every former role account', () => {
  assert.deepEqual(databaseCredentials({DB_USER:'tester',DB_PASSWORD:' single secret ',
    MD_USER:'reader',MD_PASSWORD:'old',BUILD_USER:'builder',BUILD_PASSWORD:'other',
    LAB_USER:'lab',LAB_PASSWORD:'other',ADMIN_USER:'admin',ADMIN_PASSWORD:'other'}),
  {user:'tester',password:' single secret '});
});
test('legacy configuration uses only its matching MD pair', () => {
  assert.deepEqual(databaseCredentials({MD_USER:'legacy',MD_PASSWORD:'pw'}),{user:'legacy',password:'pw'});
  assert.throws(()=>databaseCredentials({DB_USER:'new',MD_PASSWORD:'old'}),/DB_PASSWORD/);
  assert.deepEqual(databaseCredentials({DB_USER:'local',DB_PASSWORD:''}),{user:'local',password:''});
});
test('one pool is exported and safe configuration masks its password', () => {
  assert.equal(typeof database.dbPool.getConnection,'function');
  assert.equal('readerPool' in database,false);
  assert.equal('adminPool' in database,false);
  assert.equal('roles' in safeConfig().db,false);
  assert.ok(['***',''].includes(safeConfig().db.password));
});
