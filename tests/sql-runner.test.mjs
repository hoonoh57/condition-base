import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSql, runSqlFiles } from '../scripts/sql-runner.mjs';

test('preserves SQL after comments and semicolons inside literals', () => {
  assert.deepEqual(splitSql(`-- heading\nUSE example; /* comment; */
    SELECT 'a;b', 'it''s;ok', "x;y", \`semi;colon\`; # end
    SELECT 2; -- tail`), [
    'USE example', `SELECT 'a;b', 'it''s;ok', "x;y", \`semi;colon\``, 'SELECT 2',
  ]);
});

test('rejects unfinished strings/comments before execution', () => {
  assert.throws(() => splitSql("SELECT 'unfinished"), /Unterminated/);
  assert.throws(() => splitSql('SELECT 1; /* unfinished'), /Unterminated/);
});

const files = [
  new URL('../sql/01_derived/01_schema.sql', import.meta.url),
  new URL('../sql/01_derived/02_build_d_ind.sql', import.meta.url),
  new URL('../sql/01_derived/03_build_d_feat.sql', import.meta.url),
];
test('build files use one session, preserving temporary tables and USE', async () => {
  let connections = 0, releases = 0;
  const executed = [];
  const pool = { async getConnection() {
    connections++;
    return {
      async query(sql) { executed.push(sql); return [{ affectedRows: 0 }]; },
      release() { releases++; },
    };
  } };
  await runSqlFiles(pool, files, { log() {} });
  assert.equal(connections, 1);
  assert.equal(releases, 1);
  assert.ok(executed.some(s => s.startsWith('CREATE TEMPORARY TABLE tmp_tr')));
  assert.ok(executed.some(s => s.startsWith('INSERT INTO d_ind')));
  assert.ok(executed.some(s => s.startsWith('INSERT INTO d_feat')));
  assert.ok(executed.every(s => !s.includes('(...)')));
});

test('SQL failure stops subsequent statements and releases the session', async () => {
  let queries = 0, releases = 0;
  const pool = { async getConnection() { return {
    async query() { queries++; throw Object.assign(new Error('secret details'), { code: 'ER_TEST' }); },
    release() { releases++; },
  }; } };
  await assert.rejects(runSqlFiles(pool, files, { log() {} }), /01_schema.sql, statement 1: ER_TEST/);
  assert.equal(queries, 1);
  assert.equal(releases, 1);
});

test('dry run requires no DB pool', async () => {
  await runSqlFiles(undefined, files, { dryRun: true, log() {} });
});
