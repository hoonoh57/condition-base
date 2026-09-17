-- 05: 경로 진단 (고가가 며칠째인지, 20세션 뒤 종가는 어디인지)
USE srb_derived;

CREATE TABLE IF NOT EXISTS d_path (
  instrument_id BIGINT UNSIGNED NOT NULL,
  cond_date DATE NOT NULL,
  mfe20_day SMALLINT NULL,
  ret20 DECIMAL(8,4) NULL,
  PRIMARY KEY (instrument_id, cond_date)
) ENGINE=InnoDB;
TRUNCATE TABLE d_path;

INSERT INTO d_path
SELECT x.instrument_id, x.cond_date, x.off_,
       (SELECT i2.close/NULLIF(x.anchor_open,0)-1
        FROM trading_calendar k2
        JOIN d_ind i2 ON i2.instrument_id=x.instrument_id AND i2.trading_date=k2.trading_date
        WHERE k2.session_no=x.session_no+20)
FROM (
  SELECT f.instrument_id, f.cond_date, f.anchor_open, c.session_no,
         k.session_no-c.session_no off_,
         ROW_NUMBER() OVER (PARTITION BY f.instrument_id, f.cond_date
                            ORDER BY i.high DESC, k.session_no) rn
  FROM d_feat f
  JOIN trading_calendar c ON c.trading_date=f.cond_date
  JOIN trading_calendar k ON k.session_no BETWEEN c.session_no+1 AND c.session_no+20
  JOIN d_ind i ON i.instrument_id=f.instrument_id AND i.trading_date=k.trading_date
  WHERE f.mfe_20 IS NOT NULL
) x
WHERE x.rn=1;
