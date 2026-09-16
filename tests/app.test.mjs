import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';

test('HTTP startup, health, web assets and API validation', async t => {
  const server = createApp().listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', databaseChecked: false });
  assert.equal((await fetch(`${base}/api/stack`)).status, 400);
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /importmap/);
  const chart = await fetch(`${base}/vendor/lightweight-charts.mjs`);
  assert.equal(chart.status, 200);
  assert.match(chart.headers.get('content-type'), /javascript/);
});
