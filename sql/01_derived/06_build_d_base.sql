-- 06: 대조군 (점화 아닌 날의 동일 구조 표본) — d_feat와 컬럼 동일
USE srb_derived;

DROP TABLE IF EXISTS d_base;
CREATE TABLE d_base LIKE d_feat;

DROP TEMPORARY TABLE IF EXISTS b_cand;
CREATE TEMPORARY TABLE b_cand (
  instrument_id BIGINT UNSIGNED NOT NULL, cond_date DATE NOT NULL,
  session_no INT NOT NULL, close BIGINT UNSIGNED, amount BIGINT UNSIGNED,
  ret1 DECIMAL(10,6), amt20 BIGINT UNSIGNED,
  ma20 DECIMAL(16,4), ma60 DECIMAL(16,4), sd20 DECIMAL(16,4), atr20 DECIMAL(16,4),
  hh20 BIGINT UNSIGNED, ll20 BIGINT UNSIGNED, bbw_prev DECIMAL(12,6),
  prior20 SMALLINT, prev_session INT NULL,
  PRIMARY KEY (instrument_id, cond_date), KEY ix_sess (session_no)
) ENGINE=InnoDB;

INSERT INTO b_cand
SELECT i.instrument_id, i.trading_date, c.session_no,
  i.close, i.amount, i.ret1, i.amt20, i.ma20, i.ma60, i.sd20, i.atr20,
  i.hh20, i.ll20, i.bbw_prev,
  (SELECT COUNT(*) FROM (SELECT 1 FROM d_ind p
     WHERE p.instrument_id=i.instrument_id AND p.trading_date<i.trading_date LIMIT 20) t),
  (SELECT k.session_no FROM d_ind p JOIN trading_calendar k ON k.trading_date=p.trading_date
     WHERE p.instrument_id=i.instrument_id AND p.trading_date<i.trading_date
     ORDER BY p.trading_date DESC LIMIT 1)
FROM d_ind i
JOIN trading_calendar c ON c.trading_date=i.trading_date
WHERE i.ignite_flag=0 AND i.amt20 IS NOT NULL
  AND MOD(CRC32(CONCAT(i.instrument_id,'|',i.trading_date)),134)=0;

DROP TEMPORARY TABLE IF EXISTS b_fwd;
CREATE TEMPORARY TABLE b_fwd (
  instrument_id BIGINT UNSIGNED NOT NULL, cond_date DATE NOT NULL,
  bars_5 SMALLINT, bars_10 SMALLINT, bars_20 SMALLINT, bars_40 SMALLINT,
  fh5 BIGINT UNSIGNED, fh10 BIGINT UNSIGNED, fh20 BIGINT UNSIGNED, fh40 BIGINT UNSIGNED,
  PRIMARY KEY (instrument_id, cond_date)
) ENGINE=InnoDB;

INSERT INTO b_fwd
SELECT c.instrument_id, c.cond_date,
  SUM(k.session_no<=c.session_no+5),  SUM(k.session_no<=c.session_no+10),
  SUM(k.session_no<=c.session_no+20), SUM(k.session_no<=c.session_no+40),
  MAX(CASE WHEN k.session_no<=c.session_no+5  THEN i.high END),
  MAX(CASE WHEN k.session_no<=c.session_no+10 THEN i.high END),
  MAX(CASE WHEN k.session_no<=c.session_no+20 THEN i.high END),
  MAX(CASE WHEN k.session_no<=c.session_no+40 THEN i.high END)
FROM b_cand c
JOIN trading_calendar k ON k.session_no BETWEEN c.session_no+1 AND c.session_no+40
JOIN d_ind i ON i.instrument_id=c.instrument_id AND i.trading_date=k.trading_date
GROUP BY c.instrument_id, c.cond_date;

DROP TEMPORARY TABLE IF EXISTS b_anchor;
CREATE TEMPORARY TABLE b_anchor (
  instrument_id BIGINT UNSIGNED NOT NULL, cond_date DATE NOT NULL,
  anchor_date DATE NULL, anchor_open BIGINT UNSIGNED NULL,
  reason ENUM('NONE','LIMIT_UP_OPEN','HALTED','NO_BAR') NOT NULL DEFAULT 'NONE',
  PRIMARY KEY (instrument_id, cond_date)
) ENGINE=InnoDB;

INSERT INTO b_anchor
SELECT c.instrument_id, c.cond_date, nc.trading_date, a.open,
  CASE WHEN nc.trading_date IS NULL THEN 'NO_BAR'
       WHEN a.open IS NULL OR a.open=0 OR a.amount=0 THEN 'HALTED'
       WHEN a.open=a.high AND a.open=a.low AND a.open >= c.close*1.29 THEN 'LIMIT_UP_OPEN'
       ELSE 'NONE' END
FROM b_cand c
LEFT JOIN trading_calendar nc ON nc.session_no=c.session_no+1
LEFT JOIN market_data.korean_equity_daily a
       ON a.instrument_id=c.instrument_id AND a.trading_date=nc.trading_date;

INSERT INTO d_base (
 instrument_id, cond_date, ret1, close, amt20, amt_rank_mkt,
 ma60, disp60, ma60_xup_age, bb_up, bb_break, bbw_pct_prev,
 hh20_break, pos20, atr20_pct, days_since_ignite, ignite_ret,
 excl_halt, excl_delisted, mktcap_krw, halt_gap_days, delisted_age_days, status_known,
 anchor_date, anchor_open, executable, nonexec_reason,
 mfe_5, mfe_10, mfe_20, mfe_40, mfe_end_5, mfe_end_10, mfe_end_20, mfe_end_40
)
SELECT c.instrument_id, c.cond_date, c.ret1, c.close, c.amt20,
 (SELECT COUNT(*)+1 FROM d_ind r WHERE r.trading_date=c.cond_date AND r.amount>c.amount),
 c.ma60, 100.0*c.close/NULLIF(c.ma60,0),
 c.session_no - (SELECT MAX(k.session_no) FROM d_ind p
    JOIN trading_calendar k ON k.trading_date=p.trading_date
    WHERE p.instrument_id=c.instrument_id
      AND p.trading_date BETWEEN c.cond_date - INTERVAL 400 DAY AND c.cond_date
      AND p.close > p.ma60 AND p.prev_close <= p.ma60_prev),
 c.ma20 + 2*c.sd20, c.close > c.ma20 + 2*c.sd20,
 (SELECT CASE WHEN COUNT(t.bbw)=120 THEN 100.0*SUM(t.bbw <= c.bbw_prev)/120 END
    FROM (SELECT p.bbw FROM d_ind p WHERE p.instrument_id=c.instrument_id
          AND p.trading_date < c.cond_date ORDER BY p.trading_date DESC LIMIT 120) t),
 CASE WHEN c.prior20=20 THEN c.close > c.hh20 END,
 CASE WHEN c.prior20=20 THEN (CAST(c.close AS DECIMAL(20,0))-c.ll20)
      /NULLIF(CAST(c.hh20 AS DECIMAL(20,0))-c.ll20,0) END,
 100.0*c.atr20/NULLIF(c.close,0),
 c.session_no - (SELECT MAX(k.session_no) FROM d_ind p
    JOIN trading_calendar k ON k.trading_date=p.trading_date
    WHERE p.instrument_id=c.instrument_id
      AND p.trading_date BETWEEN c.cond_date - INTERVAL 400 DAY AND c.cond_date - INTERVAL 1 DAY
      AND p.ignite_flag=1),
 c.ret1,
 CASE WHEN c.amount=0 THEN 1 ELSE 0 END, NULL, NULL,
 GREATEST(COALESCE(c.session_no - c.prev_session - 1, 0), 0), NULL, 0,
 s.anchor_date, s.anchor_open, s.reason='NONE', s.reason,
 CASE WHEN s.reason='NONE' AND f.bars_5 =5  THEN f.fh5 /NULLIF(s.anchor_open,0)-1 END,
 CASE WHEN s.reason='NONE' AND f.bars_10=10 THEN f.fh10/NULLIF(s.anchor_open,0)-1 END,
 CASE WHEN s.reason='NONE' AND f.bars_20=20 THEN f.fh20/NULLIF(s.anchor_open,0)-1 END,
 CASE WHEN s.reason='NONE' AND f.bars_40=40 THEN f.fh40/NULLIF(s.anchor_open,0)-1 END,
 CASE WHEN f.bars_5 =5  THEN e5.trading_date  END,
 CASE WHEN f.bars_10=10 THEN e10.trading_date END,
 CASE WHEN f.bars_20=20 THEN e20.trading_date END,
 CASE WHEN f.bars_40=40 THEN e40.trading_date END
FROM b_cand c
JOIN b_anchor s ON s.instrument_id=c.instrument_id AND s.cond_date=c.cond_date
LEFT JOIN b_fwd f ON f.instrument_id=c.instrument_id AND f.cond_date=c.cond_date
LEFT JOIN trading_calendar e5  ON e5.session_no =c.session_no+5
LEFT JOIN trading_calendar e10 ON e10.session_no=c.session_no+10
LEFT JOIN trading_calendar e20 ON e20.session_no=c.session_no+20
LEFT JOIN trading_calendar e40 ON e40.session_no=c.session_no+40;

DROP TEMPORARY TABLE IF EXISTS b_cand;
DROP TEMPORARY TABLE IF EXISTS b_fwd;
DROP TEMPORARY TABLE IF EXISTS b_anchor;

SELECT COUNT(*) n_base, SUM(mfe_20 IS NOT NULL) evaluable FROM d_base;
