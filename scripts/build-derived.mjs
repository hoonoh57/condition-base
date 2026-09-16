import fs from 'node:fs/promises';
import { buildDerived, dryBuild } from './derived-service.mjs';

if (process.argv.includes('--dry-run')) await dryBuild();
else {
  const db=await import('../server/db.mjs');
  try {
    const report=JSON.parse(await fs.readFile(new URL('../data/p0-report.json',import.meta.url),'utf8'));
    if (!process.argv.includes('--p0-reviewed')) throw new Error('Review npm run p0 results, then add --p0-reviewed');
    const [[current]]=await db.dbPool.query('SELECT MAX(trading_date) data_asof FROM market_data.korean_equity_daily');
    if (!current.data_asof || current.data_asof!==report.summary.data_asof) throw new Error('P0 report missing or stale; run npm run p0');
    await buildDerived(db.dbPool);
  } catch(error) { console.error(error.code ?? error.message); process.exitCode=1; }
  finally { await db.closePool(); }
}
