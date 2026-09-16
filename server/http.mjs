export function fail(status, code, detail) {
  const error = new Error(code);
  Object.assign(error, { status, code, detail, expose: true });
  throw error;
}
export const route = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
export function id(value, name = 'id') {
  if (!/^[1-9]\d{0,18}$/.test(String(value ?? ''))) fail(400, 'INVALID_ID', name);
  return String(value);
}
export function number(value, min, max, name, integer = false) {
  if (value === '' || value === null || value === undefined || typeof value === 'boolean') fail(400, 'INVALID_NUMBER', name);
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) fail(400, 'INVALID_NUMBER', name);
  return n;
}
export function text(value, max, name) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, 'INVALID_TEXT', name);
  return value.trim();
}
export function date(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '') || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString().slice(0, 10) !== value) fail(400, 'INVALID_DATE');
  return value;
}
export function options(input = {}) {
  const part = input.part ?? 'IS';
  if (!['IS', 'OOS', 'VAULT'].includes(part)) fail(400, 'INVALID_PARTITION');
  const mfeWin = number(input.mfeWin ?? 20, 5, 40, 'mfeWin', true);
  if (![5, 10, 20, 40].includes(mfeWin)) fail(400, 'INVALID_MFE_WINDOW');
  return { part, mfeWin, mfeThr: number(input.mfeThr ?? .08, 0, 1, 'mfeThr') };
}
export const json = value => typeof value === 'string' ? JSON.parse(value) : value;
export async function connection(pool, fn) {
  const conn = await pool.getConnection();
  try { return await fn(conn); } finally { conn.release(); }
}
export async function transaction(pool, fn) {
  return connection(pool, async conn => {
    await conn.beginTransaction();
    try { const result = await fn(conn); await conn.commit(); return result; }
    catch (error) { try { await conn.rollback(); } catch { /* retain original error */ } throw error; }
  });
}
