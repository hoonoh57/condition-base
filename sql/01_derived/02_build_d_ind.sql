USE srb_derived;
TRUNCATE TABLE d_ind;

-- 1패스: prev_close와 TR을 먼저 확정 (윈도우 1단)
DROP TEMPORARY TABLE IF EXISTS tmp_tr;
CREATE TEMPORARY TABLE tmp_tr (
  instrument_id BIGINT UNSIGNED NOT NULL,
  trading_date DATE NOT NULL,
  open BIGINT UNSIGNED, high BIGINT UNSIGNED,
  low BIGINT UNSIGNED, close BIGINT UNSIGNED,
  amount BIGINT UNSIGNED,
  prev_close BIGINT UNSIGNED NULL,
  tr DECIMAL(16,4) NULL,
  PRIMARY KEY (instrument_id, trading_date)
) ENGINE=InnoDB;

INSERT INTO tmp_tr
SELECT instrument_id, trading_date, open, high, low, close, amount, prev_close,
       GREATEST(high - low,
                ABS(CAST(high AS DECIMAL(20,0)) - IFNULL(prev_close, high)),
                ABS(CAST(low AS DECIMAL(20,0)) - IFNULL(prev_close, low))) AS tr
FROM (
  SELECT instrument_id, trading_date, open, high, low, close, amount,
         LAG(close) OVER (PARTITION BY instrument_id ORDER BY trading_date) AS prev_close
  FROM market_data.korean_equity_daily
) x;

-- 2패스: 롤링 집계 (컬럼 명시 — 순서 의존 제거)
INSERT INTO d_ind
 (instrument_id, trading_date, close, high, low, amount, prev_close, ret1,
  ma20, ma60, ma120, ma60_prev, sd20, atr20, amt20, hh20, ll20, bbw, bbw_prev, ignite_flag)
SELECT instrument_id, trading_date, close, high, low, amount, prev_close,
  close / NULLIF(prev_close, 0) - 1,
  CASE WHEN COUNT(*) OVER (w ROWS 19 PRECEDING)=20 THEN AVG(close) OVER (w ROWS 19 PRECEDING) END,
  CASE WHEN COUNT(*) OVER (w ROWS 59 PRECEDING)=60 THEN AVG(close) OVER (w ROWS 59 PRECEDING) END,
  CASE WHEN COUNT(*) OVER (w ROWS 119 PRECEDING)=120 THEN AVG(close) OVER (w ROWS 119 PRECEDING) END,
  NULL,                                        -- 3패스에서 채움
  CASE WHEN COUNT(*) OVER (w ROWS 19 PRECEDING)=20 THEN STDDEV_POP(close) OVER (w ROWS 19 PRECEDING) END,
  CASE WHEN COUNT(*) OVER (w ROWS 19 PRECEDING)=20 THEN AVG(tr) OVER (w ROWS 19 PRECEDING) END,
  CASE WHEN COUNT(*) OVER (w ROWS 19 PRECEDING)=20 THEN AVG(amount) OVER (w ROWS 19 PRECEDING) END,
  MAX(high) OVER (w ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING),
  MIN(low)  OVER (w ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING),
  CASE WHEN COUNT(*) OVER (w ROWS 19 PRECEDING)=20 THEN
    (4 * STDDEV_POP(close) OVER (w ROWS 19 PRECEDING))
     / NULLIF(AVG(close) OVER (w ROWS 19 PRECEDING), 0) END,
  NULL,                                        -- 3패스에서 채움
  0
FROM tmp_tr
WINDOW w AS (PARTITION BY instrument_id ORDER BY trading_date);

DROP TEMPORARY TABLE tmp_tr;

-- 3패스: 자기참조 LAG (이제 중첩이 아님)
UPDATE d_ind t
JOIN (
  SELECT instrument_id, trading_date,
         LAG(ma60) OVER w AS p_ma60,
         LAG(bbw)  OVER w AS p_bbw
  FROM d_ind
  WINDOW w AS (PARTITION BY instrument_id ORDER BY trading_date)
) s ON s.instrument_id = t.instrument_id AND s.trading_date = t.trading_date
SET t.ma60_prev = s.p_ma60, t.bbw_prev = s.p_bbw;

UPDATE d_ind SET ignite_flag = 1 WHERE ret1 BETWEEN 0.10 AND 0.15;
