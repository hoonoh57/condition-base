-- 02_build_d_ind.sql (요지)
INSERT INTO srb_derived.d_ind
SELECT instrument_id, trading_date, close, high, low, amount,
  LAG(close) OVER w AS prev_close,
  close / NULLIF(LAG(close) OVER w,0) - 1 AS ret1,
  AVG(close) OVER (w ROWS 19 PRECEDING) AS ma20,
  AVG(close) OVER (w ROWS 59 PRECEDING) AS ma60,
  AVG(close) OVER (w ROWS 119 PRECEDING) AS ma120,
  LAG(AVG(close) OVER (w ROWS 59 PRECEDING)) OVER w AS ma60_prev,
  STDDEV_POP(close) OVER (w ROWS 19 PRECEDING) AS sd20,
  AVG(GREATEST(high-low,
      ABS(high - IFNULL(LAG(close) OVER w, high)),
      ABS(low  - IFNULL(LAG(close) OVER w, low)))) OVER (w ROWS 19 PRECEDING) AS atr20,
  AVG(amount) OVER (w ROWS 19 PRECEDING) AS amt20,
  MAX(high) OVER (w ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING) AS hh20,
  MIN(low)  OVER (w ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING) AS ll20,
  (4*STDDEV_POP(close) OVER (w ROWS 19 PRECEDING))
     / NULLIF(AVG(close) OVER (w ROWS 19 PRECEDING),0) AS bbw,
  NULL, 0
FROM market_data.korean_equity_daily
WINDOW w AS (PARTITION BY instrument_id ORDER BY trading_date);

UPDATE srb_derived.d_ind SET ignite_flag = 1
WHERE ret1 >= 0.10 AND ret1 <= 0.15;
