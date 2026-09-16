-- 03_build_d_feat.sql (앵커·MFE 핵심)
WITH fwd AS (
  SELECT instrument_id, trading_date,
    LEAD(trading_date) OVER w AS t1_date,
    LEAD(open)  OVER w AS t1_open,
    LEAD(high)  OVER w AS t1_high,
    LEAD(low)   OVER w AS t1_low,
    close AS d_close,
    -- T+1 시가 기준 전방 최고가: 윈도우 시작점이 T+1
    MAX(high) OVER (w ROWS BETWEEN 1 FOLLOWING AND 5  FOLLOWING) AS fh5,
    MAX(high) OVER (w ROWS BETWEEN 1 FOLLOWING AND 10 FOLLOWING) AS fh10,
    MAX(high) OVER (w ROWS BETWEEN 1 FOLLOWING AND 20 FOLLOWING) AS fh20,
    MAX(high) OVER (w ROWS BETWEEN 1 FOLLOWING AND 40 FOLLOWING) AS fh40
  FROM market_data.korean_equity_daily
  WINDOW w AS (PARTITION BY instrument_id ORDER BY trading_date)
)
INSERT INTO srb_derived.d_feat (...)
SELECT i.instrument_id, i.trading_date AS cond_date,
  i.ret1, i.close, i.amt20, NULL,
  i.ma60, 100.0 * i.close / NULLIF(i.ma60,0) AS disp60,
  NULL,
  i.ma20 + 2*i.sd20 AS bb_up,
  (i.close > i.ma20 + 2*i.sd20) AS bb_break,
  NULL,
  (i.close > i.hh20) AS hh20_break,
  (i.close - i.ll20) / NULLIF(i.hh20 - i.ll20,0) AS pos20,
  100.0 * i.atr20 / NULLIF(i.close,0) AS atr20_pct,
  0, i.ret1, 0, 0, NULL,
  f.t1_date, f.t1_open,
  -- 집행 가능성: 시가 상한가 갇힘 / 결측 / 장기 공백
  CASE WHEN f.t1_date IS NULL THEN 0
       WHEN f.t1_open = f.t1_high AND f.t1_open = f.t1_low
            AND f.t1_open >= i.close * 1.29 THEN 0
       WHEN DATEDIFF(f.t1_date, i.trading_date) > 5 THEN 0
       ELSE 1 END,
  CASE WHEN f.t1_date IS NULL THEN 'NO_BAR'
       WHEN f.t1_open = f.t1_high AND f.t1_open = f.t1_low
            AND f.t1_open >= i.close * 1.29 THEN 'LIMIT_UP_OPEN'
       WHEN DATEDIFF(f.t1_date, i.trading_date) > 5 THEN 'HALTED'
       ELSE 'NONE' END,
  f.fh5 /NULLIF(f.t1_open,0) - 1,
  f.fh10/NULLIF(f.t1_open,0) - 1,
  f.fh20/NULLIF(f.t1_open,0) - 1,
  f.fh40/NULLIF(f.t1_open,0) - 1
FROM srb_derived.d_ind i
JOIN fwd f ON f.instrument_id=i.instrument_id AND f.trading_date=i.trading_date
WHERE i.ignite_flag = 1;
