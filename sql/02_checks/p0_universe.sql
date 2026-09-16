CREATE TABLE IF NOT EXISTS srb_derived.universe_snapshot (
 as_of DATE NOT NULL, instrument_id BIGINT UNSIGNED NOT NULL,
 amt20 BIGINT UNSIGNED NOT NULL, rnk INT NOT NULL,
 PRIMARY KEY (as_of,instrument_id)
) ENGINE=InnoDB;

DELETE FROM srb_derived.universe_snapshot;
INSERT INTO srb_derived.universe_snapshot (as_of,instrument_id,amt20,rnk)
WITH months AS (
 SELECT MAX(trading_date) as_of FROM srb_derived.trading_calendar
 GROUP BY YEAR(trading_date),MONTH(trading_date)
), ranked AS (
 SELECT m.as_of,i.instrument_id,i.amt20,
 ROW_NUMBER() OVER (PARTITION BY m.as_of ORDER BY i.amt20 DESC,i.instrument_id) rnk
 FROM months m JOIN srb_derived.d_ind i ON i.trading_date=m.as_of
 WHERE i.amt20 IS NOT NULL
)
SELECT as_of,instrument_id,amt20,rnk FROM ranked WHERE rnk<=@universe_top_n;
