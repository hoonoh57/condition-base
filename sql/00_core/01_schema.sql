CREATE DATABASE IF NOT EXISTS srb_core
  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
USE srb_core;

CREATE TABLE IF NOT EXISTS baseline (
  baseline_hash    CHAR(40) PRIMARY KEY,
  cost_model_key   VARCHAR(32) NOT NULL,   -- NA_DAILY | CONST20 | PARTICIPATION | NEUTRAL
  cost_params      JSON        NOT NULL,
  stop_def_key     VARCHAR(32) NOT NULL,   -- NA_DAILY | MA60_ATR_CAP | FIXED_PCT
  stop_params      JSON        NOT NULL,
  fill_rule_key    VARCHAR(32) NOT NULL,   -- T1_OPEN | SLOT_CLOSE_RANK_NEXT1M
  tax_schedule_ver VARCHAR(16) NOT NULL,
  severity         ENUM('WORST','NEUTRAL') NOT NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS condition_def (
  cond_key      VARCHAR(48) PRIMARY KEY,
  tf            ENUM('D','M60','M1') NOT NULL,
  slot          ENUM('A','B','C','D','E','X') NOT NULL,
  label_ko      VARCHAR(120) NOT NULL,
  role          ENUM('FILTER','QUALITY','EXCLUSION') NOT NULL,
  param_schema  JSON NOT NULL,
  data_ready    TINYINT(1) NOT NULL DEFAULT 1,   -- 0이면 UI에서 활성화 차단
  reconstructible TINYINT(1) NOT NULL DEFAULT 1, -- 시점 복원 가능 여부
  note          VARCHAR(255)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS strategy (
  strategy_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(80) NOT NULL UNIQUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS strategy_version (
  version_id  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  strategy_id BIGINT UNSIGNED NOT NULL,
  ver         INT NOT NULL,
  params_hash CHAR(40) NOT NULL,
  memo        VARCHAR(255),
  status      ENUM('DRAFT','TESTED','LIVE','RETIRED') DEFAULT 'DRAFT',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sv (strategy_id, ver),
  FOREIGN KEY (strategy_id) REFERENCES strategy(strategy_id)
) ENGINE=InnoDB;

-- ★ 스택 행 = 화면의 한 줄
CREATE TABLE IF NOT EXISTS strategy_condition (
  version_id BIGINT UNSIGNED NOT NULL,
  order_no   SMALLINT        NOT NULL,
  cond_key   VARCHAR(48)     NOT NULL,
  enabled    TINYINT(1)      NOT NULL DEFAULT 1,
  params     JSON            NOT NULL,
  frozen     TINYINT(1)      NOT NULL DEFAULT 0,
  retired_reason VARCHAR(160) NULL,
  PRIMARY KEY (version_id, order_no),
  UNIQUE KEY uq_vc (version_id, cond_key),
  FOREIGN KEY (version_id) REFERENCES strategy_version(version_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ★ 행 우측 숫자의 측정 당시 스냅샷
CREATE TABLE IF NOT EXISTS stack_snapshot (
  version_id BIGINT UNSIGNED NOT NULL,
  order_no   SMALLINT NOT NULL,
  n_survive  INT NOT NULL,
  cut_pct    DECIMAL(6,3) NOT NULL,
  per_day    DECIMAL(8,3) NOT NULL,
  mfe_pass_pct DECIMAL(6,3) NULL,
  exec_pct   DECIMAL(6,3) NULL,
  mfe_win    SMALLINT NULL,
  mfe_thr    DECIMAL(6,3) NULL,
  baseline_hash CHAR(40) NOT NULL,
  data_asof  DATE NOT NULL,
  measured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (version_id, order_no)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS hypothesis (
  hyp_id INT AUTO_INCREMENT PRIMARY KEY,
  version_id BIGINT UNSIGNED NULL,
  parent_hyp_id INT NULL,
  origin ENUM('AUTOPSY','ABLATION','PLATEAU','HUMAN') NOT NULL,
  statement VARCHAR(255) NOT NULL,
  pred_cut_pct   DECIMAL(6,3) NOT NULL,   -- 예상 감소율
  pred_pass_pct  DECIMAL(6,3) NOT NULL,   -- ★ 예상 MFE 통과율
  measured_cut_pct  DECIMAL(6,3) NULL,
  measured_pass_pct DECIMAL(6,3) NULL,
  verdict ENUM('OPEN','CONFIRMED','REJECTED','INCONCLUSIVE') DEFAULT 'OPEN',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMP NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS trial_ledger (
  trial_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  version_id BIGINT UNSIGNED NOT NULL,
  cond_key VARCHAR(48) NOT NULL,
  params_hash CHAR(40) NOT NULL,
  hyp_id INT NULL,
  partition_used ENUM('IS','OOS','VAULT') NOT NULL DEFAULT 'IS',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_trial (version_id, cond_key, params_hash)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS data_partition (
  part ENUM('IS','OOS','VAULT') PRIMARY KEY,
  date_from DATE NOT NULL, date_to DATE NOT NULL,
  unlock_count INT NOT NULL DEFAULT 0,
  max_unlocks INT NOT NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO data_partition VALUES
 ('IS','2021-01-04','2025-06-30',0,999),
 ('OOS','2025-07-01','2026-02-22',0,20),
 ('VAULT','2026-02-23','2026-08-26',0,3);

CREATE TABLE IF NOT EXISTS improvement_item (
  item_id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(160) NOT NULL UNIQUE,
  current_state_assumption VARCHAR(255) NOT NULL,
  expected_effect VARCHAR(160),
  acquisition_cost ENUM('LOW','MID','HIGH') NOT NULL,
  blocks VARCHAR(120),
  status ENUM('OPEN','DEFERRED','RESOLVED') DEFAULT 'OPEN',
  resolved_at TIMESTAMP NULL
) ENGINE=InnoDB;

INSERT INTO improvement_item (title,current_state_assumption,expected_effect,acquisition_cost,blocks)
SELECT seed.title,seed.assumption,seed.effect,seed.cost,seed.blocks FROM (
 SELECT '외국인·기관 순매수' title,'수급 데이터 없이 측정됨' assumption,'점화 지속성 판별' effect,'MID' cost,'슬롯A 품질' blocks
 UNION ALL SELECT '급등 원인 분류(실적/테마)','원인 무구분으로 혼재 측정','이벤트 순도 상승','HIGH','슬롯A'
 UNION ALL SELECT 'CB/유상증자 대기물량','오버행 무시된 상태로 측정','상방 여유 과대평가 보정','MID','슬롯A'
 UNION ALL SELECT '투자주의(소수계좌) 배제','투자주의 종목 포함된 채 측정','집행 가능성 보정','HIGH','배제'
 UNION ALL SELECT '일자별 상장주식수','시가총액 조건 사용 불가','MKTCAP_BAND 활성화','LOW','MKTCAP_BAND'
 UNION ALL SELECT '폐지종목 커버리지','생존편향 미확인, 낙관 방향 가능','전 성과 하향 보정','MID','전체'
) seed WHERE NOT EXISTS (SELECT 1 FROM improvement_item existing WHERE existing.title=seed.title);
