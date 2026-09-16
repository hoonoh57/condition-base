import fs from 'node:fs/promises';
import { splitSql, sqlCommand } from './sql-runner.mjs';
if (process.argv.includes('--dry-run')) await sqlCommand(['../sql/02_checks/p0_survivorship.sql']);
else {
  const db=await import('../server/db.mjs');
  try {
    const sql=await fs.readFile(new URL('../sql/02_checks/p0_survivorship.sql',import.meta.url),'utf8');
    const results=[];
    for (const statement of splitSql(sql)) {
      const [rows]=await db.dbPool.query(statement); results.push(rows);
    }
    const report={checkedAt:new Date().toISOString(),summary:results[0][0],vanishedByYear:results[1]};
    await fs.mkdir(new URL('../data/',import.meta.url),{recursive:true});
    await fs.writeFile(new URL('../data/p0-report.json',import.meta.url),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
    console.log('Review coverage/survivorship before build:derived -- --p0-reviewed.');
  } catch(error) { console.error(error.code ?? error.message); process.exitCode=1; }
  finally { await db.closePool(); }
}
