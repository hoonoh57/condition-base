-- p0_survivorship.sql
SELECT (SELECT MAX(trading_date) FROM market_data.korean_equity_daily) AS data_asof,
       COUNT(*) AS total,
       SUM(last_seen_date < (SELECT MAX(trading_date)
             FROM market_data.korean_equity_daily) - INTERVAL 10 DAY) AS vanished,
       SUM(first_seen_date > '2021-01-04') AS newly_listed
FROM market_data.market_instrument
WHERE instrument_type='EQUITY';

-- 연도별 소멸 분포: 0에 가까우면 수집 단계 생존편향
SELECT YEAR(last_seen_date) y, COUNT(*) n
FROM market_data.market_instrument
WHERE instrument_type='EQUITY'
  AND last_seen_date < (SELECT MAX(trading_date)
        FROM market_data.korean_equity_daily) - INTERVAL 10 DAY
GROUP BY y ORDER BY y;
