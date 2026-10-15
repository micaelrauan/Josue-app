import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, join, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSeparationService } from './separation.js';
import { createAudioExportService } from './audio-export.js';
import { createYouTubeImportService } from './youtube-import.js';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

export function createAppServer({ root = join(projectRoot, 'public'), dataRoot = resolve('.data'), venvRoot = resolve('.venv'), modelsRoot = resolve('.models'), python = process.env.SEPARATION_PYTHON || join(venvRoot, 'Scripts', 'python.exe') } = {}) {
const separation = createSeparationService({ dataRoot: join(dataRoot, 'separations'), python, worker: join(projectRoot, 'tools', 'separate_audio.py'), modelsRoot });
const audioExport = createAudioExportService({ root: join(dataRoot, 'exports'), venvRoot });
const youtubeImport = createYouTubeImportService({ python, dataRoot: join(dataRoot, 'youtube') });
return createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (await separation(req, res, url)) return;
  if (await audioExport(req, res, url)) return;
  if (await youtubeImport(req, res, url)) return;
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
  const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not a file');
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Arquivo não encontrado');
  }
});
}

