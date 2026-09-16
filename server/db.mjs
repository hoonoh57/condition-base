import { Sequelize } from 'sequelize';

const sequelize = new Sequelize('mysql://root:secret@localhost/srb_core');

export default sequelize;