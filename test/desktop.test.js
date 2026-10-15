import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createAppServer } from '../server.js';

test('desktop server serves the bundled UI and keeps its data paths separate', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'josue-desktop-test-'));
  const server = createAppServer({
    root: resolve('public'),
    dataRoot: join(userData, 'data'),
    venvRoot: join(userData, 'engine', '.venv'),
    modelsRoot: join(userData, 'engine', '.models'),
  });
  try {
    await new Promise(resolveReady => server.listen(0, '127.0.0.1', resolveReady));
    const base = `http://127.0.0.1:${server.address().port}`;
    const home = await fetch(base);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Josué App/);
    const status = await (await fetch(`${base}/api/separations/status`)).json();
    assert.equal(status.available, false);
  } finally {
    await new Promise(resolveClosed => server.close(resolveClosed));
    await rm(userData, { recursive: true, force: true });
  }
});
