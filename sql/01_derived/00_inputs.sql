CREATE DATABASE IF NOT EXISTS srb_derived DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
USE srb_derived;
-- Optional point-in-time inputs. Never fill these with today's values retroactively.
CREATE TABLE IF NOT EXISTS shares_history (
  instrument_id BIGINT UNSIGNED NOT NULL, effective_date DATE NOT NULL,
  known_date DATE NOT NULL, shares_outstanding BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (instrument_id, effective_date, known_date)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS status_history (
  instrument_id BIGINT UNSIGNED NOT NULL, effective_date DATE NOT NULL,
  known_date DATE NOT NULL, status ENUM('ACTIVE','HALTED','DELISTED') NOT NULL,
  PRIMARY KEY (instrument_id, effective_date, known_date)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS investor_flow (
  instrument_id BIGINT UNSIGNED NOT NULL, trading_date DATE NOT NULL,
  known_date DATE NOT NULL, foreign_net BIGINT NULL, institution_net BIGINT NULL,
  PRIMARY KEY (instrument_id, trading_date, known_date)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS build_state (
  singleton TINYINT PRIMARY KEY, status ENUM('BUILDING','READY','FAILED') NOT NULL,
  build_id CHAR(36) NULL,
  data_asof DATE NULL, started_at TIMESTAMP NULL, completed_at TIMESTAMP NULL
) ENGINE=InnoDB;
