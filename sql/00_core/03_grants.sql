-- Administrator-run MySQL 8 roles. Users/passwords are provisioned separately.
-- Assign with GRANT 'srb_reader_role' TO 'actual_user'@'actual_host';
-- then SET DEFAULT ROLE 'srb_reader_role' TO 'actual_user'@'actual_host'.
CREATE ROLE IF NOT EXISTS 'srb_reader_role','srb_build_role','srb_lab_role','srb_prom_role';
GRANT SELECT ON market_data.* TO 'srb_reader_role','srb_build_role','srb_lab_role';
GRANT SELECT ON srb_core.* TO 'srb_reader_role','srb_lab_role';
GRANT SELECT ON srb_derived.* TO 'srb_reader_role','srb_lab_role';
GRANT SELECT ON srb_lab.* TO 'srb_reader_role';
GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,ALTER,DROP,INDEX,CREATE TEMPORARY TABLES
 ON srb_derived.* TO 'srb_build_role';
GRANT SELECT,INSERT,UPDATE,DELETE ON srb_lab.* TO 'srb_lab_role';
GRANT SELECT,INSERT ON srb_core.* TO 'srb_prom_role';
