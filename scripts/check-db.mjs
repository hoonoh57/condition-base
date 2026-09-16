import { dbPool, closePool } from '../server/db.mjs';

try {
  const [[identity]] = await dbPool.query('SELECT CURRENT_USER() account, VERSION() version');
  console.log(`MySQL 연결 성공: ${identity.account} / ${identity.version}`);
  const checks = [
    ['원천 데이터', 'SELECT instrument_id,trading_date FROM market_data.korean_equity_daily LIMIT 0'],
    ['기준 정의', 'SELECT cond_key FROM srb_core.condition_def LIMIT 0'],
    ['파생 스키마', 'SELECT instrument_id FROM srb_derived.d_ind LIMIT 0'],
    ['연구 스키마', 'SELECT strategy_id FROM srb_lab.strategy LIMIT 0'],
  ];
  for (const [label, sql] of checks) {
    try { await dbPool.query(sql); console.log(`${label}: 조회 성공`); }
    catch (error) { console.error(`${label}: ${error.code ?? 'QUERY_FAILED'}`); process.exitCode = 1; }
  }
  console.log('모든 작업은 같은 계정입니다. 쓰기·DDL 권한은 db:setup/build 실행 시 확인됩니다.');
} catch (error) {
  console.error(`MySQL 연결 실패: ${error.code ?? error.message}`);
  process.exitCode = 1;
} finally { await closePool(); }
