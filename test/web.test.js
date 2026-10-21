import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test('web entry point serves the app and API on a local port', async () => {
  const child = spawn(process.execPath, [join(root, 'web.js')], {
    cwd: root,
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const base = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('A versão web não iniciou.')), 10000);
      const finish = (error, url) => {
        clearTimeout(timer);
        child.stdout.off('data', onData);
        child.off('error', onError);
        child.off('exit', onExit);
        error ? reject(error) : resolve(url);
      };
      const onData = chunk => {
        output += chunk;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+\//);
        if (match) finish(null, match[0]);
      };
      const onError = error => finish(error);
      const onExit = code => finish(new Error(`A versão web encerrou com código ${code}.`));
      child.stdout.on('data', onData);
      child.on('error', onError);
      child.on('exit', onExit);
    });
    const [home, script, missingJob] = await Promise.all([
      fetch(base),
      fetch(new URL('app.js', base)),
      fetch(new URL('api/separations/not-a-job', base)),
    ]);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Josué App/);
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /text\/javascript/);
    assert.equal(missingJob.status, 404);
    assert.match((await missingJob.json()).error, /Processamento/);
  } finally {
    child.kill();
  }
});
