import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createYouTubeImportService, validYouTubeUrl } from '../youtube-import.js';

test('YouTube URL validation accepts videos and rejects arbitrary hosts or playlists', () => {
  assert.equal(validYouTubeUrl('https://youtu.be/abcdefghijk'), true);
  assert.equal(validYouTubeUrl('https://music.youtube.com/watch?v=abcdefghijk'), true);
  assert.equal(validYouTubeUrl('https://www.youtube.com/shorts/abcdefghijk'), true);
  assert.equal(validYouTubeUrl('https://youtube.com.evil.test/watch?v=abcdefghijk'), false);
  assert.equal(validYouTubeUrl('http://youtube.com/watch?v=abcdefghijk'), false);
  assert.equal(validYouTubeUrl('file:///secret'), false);
  assert.equal(validYouTubeUrl('https://youtube.com/playlist?list=abc'), false);
});

test('link import serves audio and enforces origin, duration and link limits', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'josue-youtube-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const python = join(directory, 'python.exe');
  await writeFile(python, 'fixture');
  let duration = 180;
  const launch = (_python, args) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
    setTimeout(async () => {
      const output = args[args.indexOf('--output') + 1];
      await writeFile(output.replace('%(id)s.%(ext)s', 'abcdefghijk.m4a'), 'fixture audio');
      child.stdout.write(JSON.stringify({ title: 'Minha música', duration }) + '\n');
      child.emit('close', 0);
    }, 5);
    return child;
  };
  const service = createYouTubeImportService({ python, dataRoot: join(directory, 'downloads'), launch });
  const server = createServer(async (req, res) => service(req, res, new URL(req.url, 'http://localhost')));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (url, headers = {}) => fetch(`${base}/api/youtube/import`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ url }) });
  assert.equal((await post('https://evil.test/watch?v=abcdefghijk')).status, 400);
  assert.equal((await post('https://youtu.be/abcdefghijk', { Origin: 'https://evil.test' })).status, 403);
  const success = await post('https://youtu.be/abcdefghijk');
  assert.equal(success.status, 200);
  assert.equal(decodeURIComponent(success.headers.get('x-track-title')), 'Minha música');
  assert.equal(success.headers.get('content-type'), 'audio/mp4');
  assert.equal(await success.text(), 'fixture audio');
  duration = 1201;
  const longVideo = await post('https://youtu.be/abcdefghijk');
  assert.equal(longVideo.status, 422);
  assert.match((await longVideo.json()).error, /20 minutos/);
});
