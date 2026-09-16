-- p0_universe.sql : 분봉 백필 유니버스 재정의
CREATE TABLE IF NOT EXISTS srb_derived.universe_snapshot (
  as_of DATE NOT NULL, instrument_id BIGINT UNSIGNED NOT NULL,
  amt20 BIGINT UNSIGNED NOT NULL, rnk SMALLINT NOT NULL,
  PRIMARY KEY (as_of, instrument_id)
) ENGINE=InnoDB;

INSERT IGNORE INTO srb_derived.universe_snapshot
SELECT as_of, instrument_id, amt20, rnk FROM (
  SELECT LAST_DAY(trading_date) AS as_of, instrument_id, amt20,
         RANK() OVER (PARTITION BY LAST_DAY(trading_date) ORDER BY amt20 DESC) rnk
  FROM srb_derived.d_ind
  WHERE trading_date = LAST_DAY(trading_date) OR trading_date = (
        SELECT MAX(trading_date) FROM srb_derived.d_ind d2
        WHERE d2.trading_date <= LAST_DAY(d_ind.trading_date))
) t WHERE rnk <= 700;
