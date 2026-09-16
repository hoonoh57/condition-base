import mysql from 'mysql2/promise';
import { config } from './config.mjs';
import { schemaSql } from './schema.mjs';

// One account and one lazy pool for setup, reads, builds and research writes.
function pool() {
  let instance;
  function get() {
    if (instance) return instance;
    instance = mysql.createPool({
      host: config.db.host, port: config.db.port,
      user: config.db.user, password: config.db.password,
      timezone: config.db.timezone, connectionLimit: config.db.poolLimit,
      namedPlaceholders: true, dateStrings: true, multipleStatements: false,
      supportBigNumbers: true, bigNumberStrings: true,
      decimalNumbers: true, connectTimeout: 5000,
    });
    return instance;
  }
  return {
    getConnection: async () => {
      const connection = await get().getConnection();
      return {
        query: (sql, args) => connection.query(schemaSql(sql, config.db), args),
        execute: (sql, args) => connection.execute(schemaSql(sql, config.db), args),
        beginTransaction: () => connection.beginTransaction(),
        commit: () => connection.commit(), rollback: () => connection.rollback(),
        release: () => connection.release(),
      };
    },
    query: (sql, args) => get().query(schemaSql(sql, config.db), args),
    execute: (sql, args) => get().execute(schemaSql(sql, config.db), args),
    end: async () => { if (instance) { await instance.end(); instance = undefined; } },
  };
}

export const dbPool = pool();
export async function closePool() {
  await dbPool.end();
}
