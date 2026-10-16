import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import updateModule from '../desktop/updates.cjs';

const { newerVersion, findUpdate, downloadUpdate } = updateModule;

test('updater only accepts a newer stable release with a hashed installer', async () => {
  assert.equal(newerVersion('v0.3.0', '0.2.0'), true);
  assert.equal(newerVersion('v0.1.9', '0.2.0'), false);
  assert.equal(newerVersion('v0.3.0-beta', '0.2.0'), false);
  const bytes = Buffer.from('installer fixture');
  const digest = createHash('sha256').update(bytes).digest('hex');
  const release = { tag_name: 'v0.3.0', draft: false, prerelease: false, assets: [{
    name: 'JosueApp-Setup.exe', size: bytes.length, digest: `sha256:${digest}`,
    browser_download_url: 'https://github.com/micaelrauan/Josue-app/releases/download/v0.3.0/JosueApp-Setup.exe',
  }] };
  const fakeFetch = async () => new Response(JSON.stringify(release), { status: 200 });
  const update = await findUpdate('0.2.0', fakeFetch);
  assert.equal(update.version, '0.3.0');
  assert.equal(update.digest, digest);
  assert.equal(await findUpdate('0.3.0', fakeFetch), null);
  release.assets[0].digest = null;
  assert.equal(await findUpdate('0.2.0', fakeFetch), null);
});

test('updater verifies downloaded bytes and removes a damaged partial file', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'josue-update-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bytes = Buffer.from('verified installer');
  const update = { version: '0.3.0', url: 'https://example.test/installer', size: bytes.length,
    digest: createHash('sha256').update(bytes).digest('hex') };
  const good = () => Promise.resolve(new Response(bytes));
  const installer = await downloadUpdate(update, directory, good);
  assert.deepEqual(await readFile(installer), bytes);
  await rm(installer);
  await assert.rejects(downloadUpdate(update, directory, () => Promise.resolve(new Response(Buffer.alloc(bytes.length)))), /SHA-256/);
  assert.deepEqual(await readdir(directory), []);
});
