import { sqlCommand } from './sql-runner.mjs';
await sqlCommand([
  '../sql/00_core/01_schema.sql', '../sql/00_core/02_condition_def.sql',
  '../sql/01_derived/00_inputs.sql','../sql/01_derived/01_schema.sql',
  '../sql/03_lab/01_schema.sql',
]);
