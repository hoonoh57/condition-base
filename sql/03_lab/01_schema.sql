CREATE DATABASE IF NOT EXISTS srb_lab DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
USE srb_lab;
CREATE TABLE IF NOT EXISTS baseline LIKE srb_core.baseline;
CREATE TABLE IF NOT EXISTS strategy LIKE srb_core.strategy;
CREATE TABLE IF NOT EXISTS strategy_version LIKE srb_core.strategy_version;
CREATE TABLE IF NOT EXISTS strategy_condition LIKE srb_core.strategy_condition;
CREATE TABLE IF NOT EXISTS stack_snapshot LIKE srb_core.stack_snapshot;
CREATE TABLE IF NOT EXISTS hypothesis LIKE srb_core.hypothesis;
CREATE TABLE IF NOT EXISTS trial_ledger LIKE srb_core.trial_ledger;
CREATE TABLE IF NOT EXISTS data_partition LIKE srb_core.data_partition;
INSERT IGNORE INTO data_partition SELECT * FROM srb_core.data_partition;

-- Versioned result JSON preserves partition, precision, disabled rows and diagnostics.
CREATE TABLE IF NOT EXISTS measurement (
  version_id BIGINT UNSIGNED PRIMARY KEY,
  parent_version_id BIGINT UNSIGNED NULL,
  part ENUM('IS','OOS','VAULT') NOT NULL,
  baseline_hash CHAR(40) NOT NULL,
  data_asof DATE NOT NULL,
  result JSON NOT NULL,
  measured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
