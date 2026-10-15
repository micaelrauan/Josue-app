import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createSeparationService } from './separation.js';
import { createAudioExportService } from './audio-export.js';

const root = resolve('public');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT || 4174);
const separation = createSeparationService();
const audioExport = createAudioExportService();

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (await separation(req, res, url)) return;
  if (await audioExport(req, res, url)) return;
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

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`A porta ${port} já está em uso. Abra http://127.0.0.1:${port} no navegador ou encerre o servidor anterior antes de iniciar outro. As músicas salvas no navegador pertencem ao endereço exato em que foram importadas.`);
    process.exitCode = 1;
    return;
  }
  console.error(`Não foi possível iniciar o servidor: ${error.message}`);
  process.exitCode = 1;
});

server.on('listening', () => console.log(`Josué App: http://127.0.0.1:${server.address().port}`));
server.listen(port, '127.0.0.1');
