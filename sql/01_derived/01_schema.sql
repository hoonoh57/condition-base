CREATE DATABASE IF NOT EXISTS srb_derived
  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
USE srb_derived;

-- 1단계: 전 종목·전 기간 지표 (필터 전용 컬럼만)
CREATE TABLE IF NOT EXISTS d_ind (
  instrument_id BIGINT UNSIGNED NOT NULL,
  trading_date  DATE NOT NULL,
  close BIGINT UNSIGNED NOT NULL,
  high  BIGINT UNSIGNED NOT NULL,
  low   BIGINT UNSIGNED NOT NULL,
  amount BIGINT UNSIGNED NOT NULL,
  prev_close BIGINT UNSIGNED NULL,
  ret1  DECIMAL(10,6) NULL,
  ma20 DECIMAL(16,4) NULL, ma60 DECIMAL(16,4) NULL, ma120 DECIMAL(16,4) NULL,
  ma60_prev DECIMAL(16,4) NULL,
  sd20 DECIMAL(16,4) NULL,
  atr20 DECIMAL(16,4) NULL,
  amt20 BIGINT UNSIGNED NULL,
  hh20 BIGINT UNSIGNED NULL, ll20 BIGINT UNSIGNED NULL,
  bbw  DECIMAL(12,6) NULL,
  bbw_prev DECIMAL(12,6) NULL,
  ignite_flag TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (instrument_id, trading_date),
  KEY ix_date (trading_date)
) ENGINE=InnoDB;

-- 2단계: 후보 행 + 성과(MFE) — OUTCOME 컬럼 포함
CREATE TABLE IF NOT EXISTS d_feat (
  instrument_id BIGINT UNSIGNED NOT NULL,
  cond_date DATE NOT NULL,
  -- FILTER 영역
  ret1 DECIMAL(10,6), close BIGINT UNSIGNED,
  amt20 BIGINT UNSIGNED, amt_rank_mkt SMALLINT,
  ma60 DECIMAL(16,4), disp60 DECIMAL(8,3),
  ma60_xup_age SMALLINT,            -- 0=당일 돌파, NULL=미돌파
  bb_up DECIMAL(16,4), bb_break TINYINT(1),
  bbw_pct_prev DECIMAL(6,2),
  hh20_break TINYINT(1), pos20 DECIMAL(6,4),
  atr20_pct DECIMAL(8,4),
  days_since_ignite SMALLINT, ignite_ret DECIMAL(10,6),
  excl_halt TINYINT(1), excl_delisted TINYINT(1),
  mktcap_krw BIGINT UNSIGNED NULL,
  -- OUTCOME 영역 (필터 사용 금지)
  anchor_date DATE NULL, anchor_open BIGINT UNSIGNED NULL,
  executable TINYINT(1) NOT NULL DEFAULT 0,
  nonexec_reason ENUM('NONE','LIMIT_UP_OPEN','HALTED','NO_BAR') NOT NULL DEFAULT 'NONE',
  mfe_5 DECIMAL(8,4), mfe_10 DECIMAL(8,4),
  mfe_20 DECIMAL(8,4), mfe_40 DECIMAL(8,4),
  PRIMARY KEY (instrument_id, cond_date),
  KEY ix_cond_date (cond_date)
) ENGINE=InnoDB;
