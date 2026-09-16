import fs from 'node:fs/promises';
import { splitSql } from './sql-runner.mjs';
import { config } from '../server/config.mjs';
import { adminPool, closePools } from '../server/db.mjs';

try {
  const statements=splitSql(await fs.readFile(new URL('../sql/00_core/03_grants.sql',import.meta.url),'utf8'));
  for(const sql of statements) await adminPool.query(sql);
  for(const role of ['reader','build','lab','prom']) {
    const credentials=config.db.roles[role];
    if(!credentials.user) continue;
    if(!credentials.password) throw new Error(`Password required for role: ${role}`);
    // Existing passwords are deliberately not changed by this setup command.
    await adminPool.query('CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?',
      [credentials.user,config.db.accountHost,credentials.password]);
    const sqlRole='srb_'+role+'_role';
    await adminPool.query('GRANT ? TO ?@?',[sqlRole,credentials.user,config.db.accountHost]);
    await adminPool.query('SET DEFAULT ROLE ? TO ?@?',[sqlRole,credentials.user,config.db.accountHost]);
    console.log(`Configured ${role} role`);
  }
} catch(error) { console.error(error.code??error.message);process.exitCode=1; }
finally { await closePools(); }
