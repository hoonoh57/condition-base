-- Single test account. Run once using an account allowed to grant privileges.
-- Replace srb_test/localhost with the DB_USER and MySQL account host in use.
-- The account must already exist; no other role users are created.
GRANT SELECT ON market_data.* TO 'srb_test'@'localhost';
GRANT ALL PRIVILEGES ON srb_core.* TO 'srb_test'@'localhost';
GRANT ALL PRIVILEGES ON srb_derived.* TO 'srb_test'@'localhost';
GRANT ALL PRIVILEGES ON srb_lab.* TO 'srb_test'@'localhost';
