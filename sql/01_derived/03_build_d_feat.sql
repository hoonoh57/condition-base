USE srb_derived;
TRUNCATE TABLE trading_calendar;
INSERT INTO trading_calendar (trading_date, session_no)
SELECT trading_date, ROW_NUMBER() OVER (ORDER BY trading_date)
FROM (SELECT DISTINCT trading_date FROM d_ind) days;
TRUNCATE TABLE d_feat;

INSERT INTO d_feat (
 instrument_id, cond_date, ret1, close, amt20, amt_rank_mkt,
 ma60, disp60, ma60_xup_age, bb_up, bb_break, bbw_pct_prev,
 hh20_break, pos20, atr20_pct, days_since_ignite, ignite_ret,
 excl_halt, excl_delisted, mktcap_krw, halt_gap_days, delisted_age_days, status_known,
 anchor_date, anchor_open, executable, nonexec_reason,
 mfe_5, mfe_10, mfe_20, mfe_40, mfe_end_5, mfe_end_10, mfe_end_20, mfe_end_40
)
WITH raw AS (
 SELECT i.*, d.open, c.session_no,
  ROW_NUMBER() OVER w AS obs_no,
  LAG(c.session_no) OVER w AS prev_session,
  RANK() OVER (PARTITION BY i.trading_date ORDER BY i.amount DESC) AS amt_rank,
  LAG(i.trading_date,120) OVER w AS history_start,
  CASE WHEN i.close > i.ma60 AND i.prev_close <= i.ma60_prev THEN c.session_no END AS cross_session,
  LEAD(c.session_no,5) OVER w AS end_session_5,
  LEAD(c.session_no,10) OVER w AS end_session_10,
  LEAD(c.session_no,20) OVER w AS end_session_20,
  LEAD(c.session_no,40) OVER w AS end_session_40,
  LEAD(i.trading_date,5) OVER w AS end_5,
  LEAD(i.trading_date,10) OVER w AS end_10,
  LEAD(i.trading_date,20) OVER w AS end_20,
  LEAD(i.trading_date,40) OVER w AS end_40,
  MAX(i.high) OVER (w ROWS BETWEEN 1 FOLLOWING AND 5 FOLLOWING) AS fh5,
  MAX(i.high) OVER (w ROWS BETWEEN 1 FOLLOWING AND 10 FOLLOWING) AS fh10,
  MAX(i.high) OVER (w ROWS BETWEEN 1 FOLLOWING AND 20 FOLLOWING) AS fh20,
  MAX(i.high) OVER (w ROWS BETWEEN 1 FOLLOWING AND 40 FOLLOWING) AS fh40
 FROM d_ind i
 JOIN market_data.korean_equity_daily d ON d.instrument_id=i.instrument_id AND d.trading_date=i.trading_date
 JOIN trading_calendar c ON c.trading_date=i.trading_date
 WINDOW w AS (PARTITION BY i.instrument_id ORDER BY i.trading_date)
), history AS (
 SELECT raw.*,
  MAX(cross_session) OVER w AS last_cross,
  MAX(CASE WHEN ignite_flag=1 THEN session_no END)
    OVER (w ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_ignite
 FROM raw WINDOW w AS (PARTITION BY instrument_id ORDER BY trading_date)
), candidates AS (
 SELECT h.*,
  (SELECT CASE WHEN COUNT(b.bbw)=120 THEN 100.0*SUM(b.bbw <= h.bbw_prev)/COUNT(b.bbw) END
   FROM d_ind b WHERE b.instrument_id=h.instrument_id
    AND b.trading_date >= h.history_start AND b.trading_date < h.trading_date) AS bbw_pct,
  (SELECT s.shares_outstanding FROM shares_history s WHERE s.instrument_id=h.instrument_id
    AND s.effective_date <= h.trading_date AND s.known_date <= h.trading_date
    ORDER BY s.effective_date DESC, s.known_date DESC LIMIT 1) AS shares,
  (SELECT s.status FROM status_history s WHERE s.instrument_id=h.instrument_id
    AND s.effective_date <= h.trading_date AND s.known_date <= h.trading_date
    ORDER BY s.effective_date DESC, s.known_date DESC LIMIT 1) AS known_status,
  (SELECT MAX(s.effective_date) FROM status_history s WHERE s.instrument_id=h.instrument_id
    AND s.status='DELISTED' AND s.effective_date <= h.trading_date
    AND s.known_date <= h.trading_date) AS delisted_on
 FROM history h WHERE h.ignite_flag=1
), anchored AS (
 SELECT h.*, nc.trading_date AS next_date, a.open AS next_open,
  CASE WHEN nc.trading_date IS NULL THEN 'NO_BAR'
       WHEN a.open IS NULL OR a.open=0 OR a.amount=0 THEN 'HALTED'
       WHEN a.open=a.high AND a.open=a.low AND a.open >= h.close*1.29 THEN 'LIMIT_UP_OPEN'
       ELSE 'NONE' END AS reason
 FROM candidates h
 LEFT JOIN trading_calendar nc ON nc.session_no=h.session_no+1
 LEFT JOIN market_data.korean_equity_daily a ON a.instrument_id=h.instrument_id AND a.trading_date=nc.trading_date
)
SELECT instrument_id,trading_date,ret1,close,amt20,amt_rank,
 ma60,100.0*close/NULLIF(ma60,0),session_no-last_cross,
 ma20+2*sd20,close > ma20+2*sd20,bbw_pct,
 CASE WHEN obs_no>20 THEN close>hh20 END,
 CASE WHEN obs_no>20 THEN (CAST(close AS DECIMAL(20,0))-ll20)
   /NULLIF(CAST(hh20 AS DECIMAL(20,0))-ll20,0) END,
 100.0*atr20/NULLIF(close,0),session_no-prev_ignite,ret1,
 CASE WHEN amount=0 OR known_status='HALTED' THEN 1 ELSE 0 END,
 CASE WHEN known_status IS NULL THEN NULL ELSE known_status='DELISTED' END,
 shares*CAST(close AS DECIMAL(20,0)), GREATEST(COALESCE(session_no-prev_session-1,0),0),
 DATEDIFF(trading_date,delisted_on),known_status IS NOT NULL,
 next_date,next_open,reason='NONE',reason,
 CASE WHEN reason='NONE' AND end_session_5=session_no+5 THEN fh5/NULLIF(next_open,0)-1 END,
 CASE WHEN reason='NONE' AND end_session_10=session_no+10 THEN fh10/NULLIF(next_open,0)-1 END,
 CASE WHEN reason='NONE' AND end_session_20=session_no+20 THEN fh20/NULLIF(next_open,0)-1 END,
 CASE WHEN reason='NONE' AND end_session_40=session_no+40 THEN fh40/NULLIF(next_open,0)-1 END,
 CASE WHEN end_session_5=session_no+5 THEN end_5 END,
 CASE WHEN end_session_10=session_no+10 THEN end_10 END,
 CASE WHEN end_session_20=session_no+20 THEN end_20 END,
 CASE WHEN end_session_40=session_no+40 THEN end_40 END
FROM anchored;
