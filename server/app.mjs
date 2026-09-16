import express from 'express';
import { fileURLToPath } from 'node:url';
import * as pools from './db.mjs';
import { config } from './config.mjs';
import strategies from './routes/strategies.mjs';
import stack from './routes/stack.mjs';
import bars from './routes/bars.mjs';
import ledger from './routes/ledger.mjs';
import supply from './routes/supply.mjs';
import { route } from './http.mjs';

export function createApp({ db = pools, settings = config } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.get('/api/health', route(async (req, res) => {
    if (req.query.db === '1') await db.readerPool.query('SELECT 1');
    res.json({ status: 'ok', databaseChecked: req.query.db === '1' });
  }));
  app.use('/api/strategies', strategies(db));
  app.use('/api/stack', stack(db, settings));
  app.use('/api/bars', bars(db));
  app.use('/api/ledger', ledger(db));
  app.use('/api/supply', supply(db));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
  app.get('/vendor/lightweight-charts.mjs', (_req, res) => res.sendFile(
    fileURLToPath(new URL('../node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.mjs', import.meta.url)),
  ));
  app.use(express.static(fileURLToPath(new URL('../web/', import.meta.url))));
  app.use((error, _req, res, _next) => {
    if (error.expose) return res.status(error.status).json({ error: error.code, detail: error.detail });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'INVALID_JSON' });
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'ALREADY_EXISTS' });
    if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_DB_ERROR')
      return res.status(503).json({ error: 'DATABASE_SETUP_REQUIRED' });
    if (['ER_ACCESS_DENIED_ERROR','ECONNREFUSED','ETIMEDOUT','ER_TABLEACCESS_DENIED_ERROR'].includes(error.code))
      return res.status(503).json({ error: 'DATABASE_UNAVAILABLE' });
    console.error('[api]', error.code ?? error.name);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  });
  return app;
}
