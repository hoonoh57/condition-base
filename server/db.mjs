import mysql from 'mysql2/promise';
import { config } from './config.mjs';
import { schemaSql } from './schema.mjs';

// Optional roles are validated when used, so P0 needs only reader credentials.
function pool(role) {
  let instance;
  function get() {
    if (instance) return instance;
    const r = config.db.roles[role];
    if (!r?.user) throw new Error(`[db] role 미설정: ${role}`);
    instance = mysql.createPool({
      host: config.db.host, port: config.db.port,
      user: r.user, password: r.password,
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

export const readerPool = pool('reader');
export const buildPool = pool('build');
export const labPool = pool('lab');
export const promPool = pool('prom');
export const adminPool = pool('admin');
export async function closePools() {
  await Promise.all([readerPool, buildPool, labPool, promPool, adminPool].map(p => p.end()));
}
