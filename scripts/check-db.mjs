import { dbPool, closePool } from '../server/db.mjs';
import { config } from '../server/config.mjs';

console.log(`접속 대상: ${config.db.user}@${config.db.host}:${config.db.port}`);

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
  if (error.code === 'ER_ACCESS_DENIED_ERROR') {
    console.error('스키마 조회 전 로그인 단계에서 거부되었습니다.');
    console.error('MySQL에 실제 로그인되는 계정을 .env의 DB_USER / DB_PASSWORD에 설정하세요.');
    console.error('단일 계정 설정은 MySQL 사용자 생성이나 기존 비밀번호 변경을 수행하지 않습니다.');
  }
  process.exitCode = 1;
} finally { await closePool(); }
