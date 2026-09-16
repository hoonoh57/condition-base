import sequelize from './db';
import { conditions, stack, guards } from './conditions';

sequelize.authenticate().then(() => {
  console.log('Database connection established.');
} catch (err) {
  console.error('Unable to connect to the database:', err);
}