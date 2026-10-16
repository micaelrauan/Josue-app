import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { access, mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const MAX_BYTES = 250 * 1024 * 1024;
const MAX_BODY = 4096;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be']);
const EXTENSIONS = { m4a: 'audio/mp4', webm: 'audio/webm', mp3: 'audio/mpeg', opus: 'audio/ogg' };

export function canonicalYouTubeUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password || url.port) return null;
    let id;
    if (url.hostname.endsWith('youtu.be')) {
      id = /^\/([\w-]{11})\/?$/.exec(url.pathname)?.[1];
    } else if (url.pathname === '/watch' && url.searchParams.getAll('v').length === 1) {
      id = url.searchParams.get('v');
    } else {
      id = /^\/(?:shorts|live)\/([\w-]{11})\/?$/.exec(url.pathname)?.[1];
    }
    return /^[\w-]{11}$/.test(id || '') ? `https://www.youtube.com/watch?v=${id}` : null;
  } catch { return null; }
}

export function validYouTubeUrl(value) { return canonicalYouTubeUrl(value) !== null; }

function downloadError(stderr) {
  if (/duration/i.test(stderr)) return 'O limite é de 20 minutos por música.';
  if (/private video|video is private/i.test(stderr)) return 'Este vídeo é privado e não pode ser importado.';
  if (/sign in|confirm you.re not a bot|cookies/i.test(stderr)) return 'O YouTube pediu uma verificação de acesso. Tente outro vídeo público.';
  if (/video unavailable|video is unavailable|has been removed|does not exist|not available in your country/i.test(stderr)) return 'Este vídeo está indisponível no YouTube. Confira se ele abre no navegador.';
  if (/requested format is not available|no formats found/i.test(stderr)) return 'O vídeo não ofereceu um formato de áudio compatível.';
  if (/unable to connect|unable to download webpage|proxy|timed out|network is unreachable|connection refused/i.test(stderr)) return 'Não foi possível conectar ao YouTube. Verifique a conexão e tente novamente.';
  return 'Não foi possível baixar o áudio. Confira se o vídeo abre no navegador e tente novamente.';
}

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

export function createYouTubeImportService({ python, dataRoot = join(tmpdir(), 'josue-youtube'), node = process.execPath, launch = spawn } = {}) {
  let busy = false;
  return async function handle(req, res, url) {
    if (url.pathname !== '/api/youtube/import') return false;
    if (req.method !== 'POST') { json(res, 405, { error: 'Método não permitido.' }); return true; }
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { json(res, 403, { error: 'Origem não permitida.' }); return true; }
    if (busy) { json(res, 409, { error: 'Outra música está sendo importada. Aguarde.' }); return true; }
    let body = '';
    try {
      for await (const chunk of req) {
        body += chunk.toString('utf8');
        if (body.length > MAX_BODY) { json(res, 413, { error: 'Link muito longo.' }); return true; }
      }
      const link = JSON.parse(body).url;
      const videoUrl = typeof link === 'string' ? canonicalYouTubeUrl(link.trim()) : null;
      if (!videoUrl) { json(res, 400, { error: 'Cole o link de um vídeo do YouTube.' }); return true; }
      try { await access(python); } catch { json(res, 503, { error: 'Importação por link indisponível. Execute o instalador novamente para preparar o motor.' }); return true; }
      busy = true;
      await mkdir(dataRoot, { recursive: true });
      const directory = await mkdtemp(join(dataRoot, 'download-'));
      try {
        const args = ['-m', 'yt_dlp', '--ignore-config', '--no-playlist', '--no-cache-dir', '--no-progress',
          '--format', 'bestaudio[ext=m4a]/bestaudio', '--match-filters', 'duration <= 1200 & !is_live',
          '--max-filesize', '250M', '--js-runtimes', `node:${node}`, '--no-simulate',
          '--print', 'after_move:%(.{id,title,duration,is_live,live_status})j',
          '--output', join(directory, '%(id)s.%(ext)s'), '--', videoUrl];
        const result = await new Promise((resolve, reject) => {
          let output = '', error = '', finished = false;
          const child = launch(python, args, { windowsHide: true, env: { ...process.env, PYTHONUTF8: '1', ELECTRON_RUN_AS_NODE: '1' } });
          const timer = setTimeout(() => { child.kill(); finish(new Error('O download demorou demais. Tente novamente.')); }, 5 * 60 * 1000);
          function finish(failure, value) { if (finished) return; finished = true; clearTimeout(timer); failure ? reject(failure) : resolve(value); }
          child.stdout.on('data', chunk => { output = (output + chunk.toString()).slice(-16000); });
          child.stderr.on('data', chunk => { error = (error + chunk.toString()).slice(-4000); });
          child.on('error', () => finish(new Error('Não foi possível iniciar o importador. Execute o instalador novamente.')));
          child.on('close', code => finish(code === 0 ? null : new Error(downloadError(error)), output));
        });
        let metadata;
        try { metadata = JSON.parse(result.trim().split('\n').at(-1)); }
        catch { throw new Error('O importador não conseguiu ler os dados do vídeo. Tente novamente.'); }
        if (!metadata || !/^[\w-]{11}$/.test(metadata.id || '')) throw new Error('O importador não devolveu os dados do vídeo. Tente novamente.');
        if (metadata.is_live || metadata.live_status === 'is_live') throw new Error('Transmissões ao vivo não podem ser importadas.');
        if (metadata.duration > 1200) throw new Error('O limite é de 20 minutos por música.');
        const files = (await readdir(directory)).filter(name => /^[\w-]{11}\.(m4a|webm|mp3|opus)$/.test(name));
        if (files.length !== 1) throw new Error('O vídeo não forneceu áudio compatível. Tente outro link.');
        const file = join(directory, files[0]);
        const info = await stat(file);
        if (!info.size || info.size > MAX_BYTES) throw new Error('O limite é de 250 MB por música.');
        const extension = files[0].split('.').at(-1);
        res.writeHead(200, { 'Content-Type': EXTENSIONS[extension], 'Content-Length': info.size,
          'X-Track-Title': encodeURIComponent(String(metadata.title || 'Música do YouTube').slice(0, 180)),
          'X-Audio-Extension': extension, 'Cache-Control': 'no-store' });
        const stream = createReadStream(file);
        stream.on('error', () => res.destroy());
        stream.on('close', () => rm(directory, { recursive: true, force: true }).catch(() => {}));
        stream.pipe(res);
      } catch (error) {
        await rm(directory, { recursive: true, force: true }).catch(() => {});
        if (!res.headersSent) json(res, 422, { error: error.message || 'Falha ao importar o áudio.' });
      } finally { busy = false; }
    } catch {
      busy = false;
      if (!res.headersSent) json(res, 400, { error: 'Não foi possível ler o link.' });
    }
    return true;
  };
}
