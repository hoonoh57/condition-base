import { createApp } from './app.mjs';
import { config } from './config.mjs';
import { closePool } from './db.mjs';

const server = createApp().listen(config.server.port, config.server.host, () => {
  console.log(`SRB Lab: http://${config.server.host}:${config.server.port}`);
});
server.on('error', error => {
  console.error(`[server] ${error.code ?? 'START_FAILED'}`);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(async () => { await closePool(); });
  });
}
