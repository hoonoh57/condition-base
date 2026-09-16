import fs from 'node:fs/promises';
import { runSqlFiles, splitSql } from './sql-runner.mjs';

const base = new URL('../sql/01_derived/', import.meta.url);
export const buildFiles = ['00_inputs.sql','01_schema.sql','02_build_d_ind.sql','03_build_d_feat.sql'].map(f=>new URL(f,base));
export async function evolveDerived(conn) {
  const [stateCols]=await conn.query('SHOW COLUMNS FROM srb_derived.build_state');
  if (!stateCols.some(c=>c.Field==='build_id')) await conn.query('ALTER TABLE srb_derived.build_state ADD COLUMN build_id CHAR(36) NULL');
  const additions = { halt_gap_days:'INT NULL', delisted_age_days:'INT NULL',
    status_known:'TINYINT(1) NOT NULL DEFAULT 0', mfe_end_5:'DATE NULL',mfe_end_10:'DATE NULL',
    mfe_end_20:'DATE NULL',mfe_end_40:'DATE NULL' };
  const [cols]=await conn.query('SHOW COLUMNS FROM srb_derived.d_feat');
  for (const [name,type] of Object.entries(additions)) if (!cols.some(c=>c.Field===name))
    await conn.query(`ALTER TABLE srb_derived.d_feat ADD COLUMN ${name} ${type}`);
}
export async function buildDerived(pool, { log=console.log }={}) {
  const conn=await pool.getConnection();
  let locked=false, started=false;
  try {
    const [[lock]]=await conn.query("SELECT GET_LOCK('condition-base-derived-build',0) acquired");
    if (!lock.acquired) throw new Error('Another derived build is running');
    locked=true;
    for (const file of buildFiles.slice(0,2)) {
      for (const sql of splitSql(await fs.readFile(file,'utf8'))) await conn.query(sql);
    }
    await evolveDerived(conn);
    await conn.query(`INSERT INTO srb_derived.build_state (singleton,status,build_id,started_at)
      VALUES (1,'BUILDING',UUID(),CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE status='BUILDING',build_id=UUID(),started_at=CURRENT_TIMESTAMP`);
    started=true;
    for (const file of buildFiles.slice(2)) {
      log(file.pathname.split('/').at(-1));
      for (const sql of splitSql(await fs.readFile(file,'utf8'))) await conn.query(sql);
    }
    await conn.query(`UPDATE srb_derived.build_state SET status='READY',completed_at=CURRENT_TIMESTAMP,
      data_asof=(SELECT MAX(trading_date) FROM srb_derived.d_ind) WHERE singleton=1`);
  } catch(error) {
    if (started) await conn.query("UPDATE srb_derived.build_state SET status='FAILED' WHERE singleton=1").catch(()=>{});
    throw error;
  } finally {
    if (locked) await conn.query("SELECT RELEASE_LOCK('condition-base-derived-build')");
    conn.release();
  }
}
export async function dryBuild() { await runSqlFiles(undefined,buildFiles,{dryRun:true}); }
