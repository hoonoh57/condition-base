import fs from 'node:fs/promises';
import { splitSql, sqlCommand } from './sql-runner.mjs';
if (process.argv.includes('--dry-run')) await sqlCommand('buildPool', ['../sql/02_checks/p0_universe.sql']);
else {
  const {config}=await import('../server/config.mjs');
  const db=await import('../server/db.mjs');
  let conn;
  try {
    conn=await db.buildPool.getConnection();
    const [[state]]=await conn.query('SELECT status FROM srb_derived.build_state WHERE singleton=1');
    if (state?.status!=='READY') throw new Error('Derived build required');
    const statements=splitSql(await fs.readFile(new URL('../sql/02_checks/p0_universe.sql',import.meta.url),'utf8'));
    await conn.query(statements.shift());
    await conn.beginTransaction();
    await conn.query('SET @universe_top_n=?',[config.data.minuteUniverseTopN]);
    for (const sql of statements) await conn.query(sql);
    await conn.commit();
    console.log('Universe built: top '+config.data.minuteUniverseTopN);
  } catch(error) {
    if (conn) await conn.rollback().catch(()=>{});
    console.error(error.code ?? error.message); process.exitCode=1;
  } finally { conn?.release(); await db.closePools(); }
}
