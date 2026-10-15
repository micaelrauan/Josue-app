import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createSeparationService } from '../separation.js';

async function serve(t, options) {
  const service = createSeparationService(options);
  const server = createServer(async (req, res) => {
    if (!await service(req, res, new URL(req.url, 'http://localhost'))) res.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('missing engine is reported and never produces fabricated stems', async t => {
  const base = await serve(t, { python: join(tmpdir(), 'missing-moises-python.exe') });
  const status = await (await fetch(`${base}/api/separations/status`)).json();
  assert.equal(status.available, false);
  const result = await fetch(`${base}/api/separations`, { method: 'POST', body: 'audio' });
  assert.equal(result.status, 503);
  assert.match((await result.json()).error, /instalador do Josué App/);
});

test('API tracks worker events and serves only its WAV stems (test double, no AI inference)', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'moises-api-test-'));
  const python = join(directory, 'engine-fixture');
  await writeFile(python, 'test double');
  let failWorker = false;
  // No model is used: this double checks queueing, progress and result delivery.
  const launch = (_executable, args) => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
    setTimeout(async () => {
      if (args[1] === '--check') { child.emit('close', 0); return; }
      if (failWorker) {
        child.stdout.write(JSON.stringify({ stage: 'error', progress: 0, message: 'Áudio inválido para separação.' }) + '\n');
        child.emit('close', 1); return;
      }
      const names = ['vocals','drums','bass','other'];
      if (args[3] === 'htdemucs_6s') names.push('guitar','piano');
      child.stdout.write(JSON.stringify({ stage: 'processing', progress: 50, message: 'Test worker' }) + '\n');
      const wav = Buffer.alloc(444); wav.write('RIFF'); wav.writeUInt32LE(436,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(2,22); wav.writeUInt32LE(44100,24); wav.writeUInt32LE(176400,28); wav.writeUInt16LE(4,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(400,40);
      for (const name of names) await writeFile(join(args[2], `${name}.wav`), wav);
      child.emit('close', 0);
    }, 10);
    return child;
  };
  const base = await serve(t, { python, launch, dataRoot: directory });
  assert.equal((await (await fetch(`${base}/api/separations/status`)).json()).available, true);
  const forbidden = await fetch(`${base}/api/separations`, { method: 'POST', headers: { Origin: 'https://example.com' }, body: 'x' });
  assert.equal(forbidden.status, 403);
  const invalid = await fetch(`${base}/api/separations?model=invalid`, { method: 'POST', body: 'x' });
  assert.equal(invalid.status, 400);
  const empty = await fetch(`${base}/api/separations`, { method: 'POST' });
  assert.equal(empty.status, 400);
  for (const model of ['htdemucs', 'htdemucs_6s']) {
    const response = await fetch(`${base}/api/separations?model=${model}`, { method: 'POST', body: 'fixture audio' });
    assert.equal(response.status, 202);
    let job = await response.json();
    const deadline = Date.now() + 10000;
    while (job.status === 'running' && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 60));
      job = await (await fetch(`${base}/api/separations/${job.id}`)).json();
    }
    assert.equal(job.status, 'completed');
    assert.equal(job.stems.length, model === 'htdemucs' ? 4 : 6);
    const wav = await fetch(`${base}${job.stems[0].url}`);
    assert.equal(wav.headers.get('content-type'), 'audio/wav');
    assert.equal(Buffer.from(await wav.arrayBuffer()).subarray(0,4).toString(), 'RIFF');
    assert.equal((await fetch(`${base}/api/separations/${job.id}/files/input.wav`)).status, 404);
  }
  failWorker = true;
  const failedResponse = await fetch(`${base}/api/separations`, { method: 'POST', body: 'invalid audio' });
  let failedJob = await failedResponse.json();
  const deadline = Date.now() + 5000;
  while (failedJob.status === 'running' && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 60));
    failedJob = await (await fetch(`${base}/api/separations/${failedJob.id}`)).json();
  }
  assert.equal(failedJob.status, 'failed');
  assert.match(failedJob.message, /inválido/);
  assert.equal(failedJob.stems.length, 0);
  assert.equal((await (await fetch(`${base}/api/separations/status`)).json()).busy, false);
});
