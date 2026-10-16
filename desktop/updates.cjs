const { createHash } = require('node:crypto');
const { createReadStream, createWriteStream } = require('node:fs');
const { mkdir, rename, rm, stat } = require('node:fs/promises');
const { join } = require('node:path');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const RELEASE_URL = 'https://api.github.com/repos/micaelrauan/Josue-app/releases/latest';
const ASSET = 'JosueApp-Setup.exe';
const MAX_BYTES = 400 * 1024 * 1024;

function versionParts(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value));
  return match && match.slice(1).map(Number);
}

function newerVersion(candidate, current) {
  const next = versionParts(candidate), installed = versionParts(current);
  if (!next || !installed) return false;
  for (let i = 0; i < 3; i++) {
    if (next[i] !== installed[i]) return next[i] > installed[i];
  }
  return false;
}

async function findUpdate(currentVersion, fetchImpl = fetch) {
  const response = await fetchImpl(RELEASE_URL, { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'JosueApp-Updater' }, signal: AbortSignal.timeout(10000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub respondeu ${response.status} ao verificar atualizações.`);
  const release = await response.json();
  if (release.draft || release.prerelease || !newerVersion(release.tag_name, currentVersion)) return null;
  const asset = release.assets?.find(item => item.name === ASSET);
  if (!asset || !/^sha256:[a-f\d]{64}$/i.test(asset.digest || '') || asset.size <= 0 || asset.size > MAX_BYTES) return null;
  const url = new URL(asset.browser_download_url);
  if (url.origin !== 'https://github.com' || !url.pathname.startsWith('/micaelrauan/Josue-app/releases/download/')) return null;
  return { version: release.tag_name.replace(/^v/, ''), url: url.href, digest: asset.digest.slice(7).toLowerCase(), size: asset.size };
}

async function downloadUpdate(update, directory, fetchImpl = fetch) {
  await mkdir(directory, { recursive: true });
  const destination = join(directory, `JosueApp-Setup-${update.version}.exe`);
  try {
    if ((await stat(destination)).size === update.size) {
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(destination)) hash.update(chunk);
      if (hash.digest('hex') === update.digest) return destination;
    }
  } catch { /* Download again. */ }
  const partial = `${destination}.part`;
  await rm(partial, { force: true });
  try {
    const response = await fetchImpl(update.url, { signal: AbortSignal.timeout(10 * 60 * 1000) });
    if (!response.ok || !response.body) throw new Error('Não foi possível baixar a atualização.');
    const hash = createHash('sha256');
    let size = 0;
    const verify = new Transform({ transform(chunk, _encoding, callback) {
      size += chunk.length;
      if (size > MAX_BYTES || size > update.size) return callback(new Error('O pacote baixado excedeu o tamanho esperado.'));
      hash.update(chunk);
      callback(null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body), verify, createWriteStream(partial, { flags: 'wx' }));
    if (size !== update.size || hash.digest('hex') !== update.digest) throw new Error('A atualização não passou na verificação SHA-256.');
    await rm(destination, { force: true });
    await rename(partial, destination);
    return destination;
  } catch (error) {
    await rm(partial, { force: true }).catch(() => {});
    throw error;
  }
}

module.exports = { newerVersion, findUpdate, downloadUpdate };
