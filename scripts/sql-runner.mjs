import fs from 'node:fs/promises';

// Ordinary MySQL SQL only: no DELIMITER or stored routines.
export function splitSql(source) {
  const statements = [];
  let statement = '', quote = null;
  for (let i = 0; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (quote) {
      statement += c;
      if (c === '\\' && next !== undefined) statement += source[++i];
      else if (c === quote) {
        if (next === quote) statement += source[++i];
        else quote = null;
      }
    } else if (c === "'" || c === '"' || c === '`') {
      quote = c; statement += c;
    } else if (c === '#' || (c === '-' && next === '-' && /\s/.test(source[i + 2] ?? '\n'))) {
      while (i < source.length && source[i] !== '\n') i++;
      statement += '\n';
    } else if (c === '/' && next === '*') {
      if (source[i + 2] === '!') throw new Error('Executable SQL comments are unsupported');
      const end = source.indexOf('*/', i + 2);
      if (end < 0) throw new Error('Unterminated SQL comment');
      i = end + 1; statement += ' ';
    } else if (c === ';') {
      if (statement.trim()) statements.push(statement.trim());
      statement = '';
    } else statement += c;
  }
  if (quote) throw new Error('Unterminated SQL string');
  if (statement.trim()) statements.push(statement.trim());
  return statements;
}

export async function runSqlFiles(pool, files, { dryRun = false, log = console.log } = {}) {
  const scripts = await Promise.all(files.map(async file => ({
    name: file.pathname.split('/').at(-1),
    statements: splitSql(await fs.readFile(file, 'utf8')),
  })));
  if (dryRun) {
    for (const script of scripts) log(`${script.name}: ${script.statements.length} statements (dry run)`);
    return;
  }
  // One session preserves USE and temporary tables across all statements.
  const conn = await pool.getConnection();
  try {
    for (const script of scripts) {
      log(`▶ ${script.name} (${script.statements.length} statements)`);
      for (const [index, statement] of script.statements.entries()) {
        const start = Date.now();
        try {
          const [result] = await conn.query(statement);
          if (Array.isArray(result)) log(JSON.stringify(result, null, 2));
          else log(`  ${((Date.now() - start) / 1000).toFixed(1)}s rows=${result.affectedRows ?? '-'}`);
        } catch (error) {
          throw new Error(`${script.name}, statement ${index + 1}: ${error.code ?? 'SQL_ERROR'}`, { cause: error });
        }
      }
    }
  } finally { conn.release(); }
}

export async function sqlCommand(role, relativeFiles) {
  const dryRun = process.argv.includes('--dry-run');
  let db;
  try {
    if (!dryRun) db = await import('../server/db.mjs');
    await runSqlFiles(db?.[role], relativeFiles.map(f => new URL(f, import.meta.url)), { dryRun });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally { if (db) await db.closePools(); }
}
