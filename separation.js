import { spawn } from 'node:child_process';
import { mkdir, access, readdir, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const labels = { vocals: 'Vocais', drums: 'Bateria', bass: 'Baixo', guitar: 'Guitarra', piano: 'Piano', other: 'Outros instrumentos' };
export function createSeparationService({ dataRoot = resolve('.data/separations'), python = process.env.SEPARATION_PYTHON || resolve(process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python3'), worker = resolve('tools/separate_audio.py'), modelsRoot = resolve('.models'), launch = spawn } = {}) {
  const jobs = new Map();
  let active = false;
  const env = { ...process.env, PYTHONUTF8: '1', TORCH_HOME: modelsRoot };
  function json(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
  async function readiness() {
    try { await access(python); } catch { return { available: false, message: 'Motor ausente. Execute o instalador do Josué App novamente e reinicie o aplicativo.' }; }
    return new Promise(resolveResult => {
      let child;
      try { child = launch(python, [worker, '--check'], { env, windowsHide: true }); }
      catch { resolveResult({ available: false, message: 'O servidor não conseguiu iniciar o Python. Reinicie npm run dev no seu terminal.' }); return; }
      const timer = setTimeout(() => { child.kill(); resolveResult({ available: false, message: 'O motor demorou para responder. Tente novamente.' }); }, 30000);
      child.on('error', () => { clearTimeout(timer); resolveResult({ available: false, message: 'Não foi possível iniciar o Python do motor de separação.' }); });
      child.on('close', code => { clearTimeout(timer); resolveResult({ available: code === 0, message: code === 0 ? 'Motor de separação pronto.' : 'Dependências incompletas. Execute o instalador do Josué App novamente.' }); });
    });
  }
  async function run(job, input, output) {
    let diagnostic = '';
    const child = launch(python, [worker, input, output, job.model], { env, windowsHide: true });
    let pending = '';
    child.stdout.on('data', chunk => {
      pending += chunk.toString();
      const lines = pending.split('\n'); pending = lines.pop();
      for (const line of lines) { try { const event = JSON.parse(line); if (event.message) job.message = event.message; if (event.stage) job.stage = event.stage; if (Number.isFinite(event.progress)) job.progress = event.progress; } catch {} }
    });
    child.stderr.on('data', chunk => {
      const text = chunk.toString(); diagnostic = (diagnostic + text).slice(-6000);
      const matches = [...text.matchAll(/(\d+)%\|/g)];
      if (matches.length && job.stage === 'processing') job.progress = Math.min(94, 10 + Math.round(Number(matches.at(-1)[1]) * .84));
    });
    let finished = false;
    const fail = message => { if (finished) return; finished = true; job.status = 'failed'; job.message = message; active = false; };
    child.on('error', () => fail('Não foi possível iniciar o motor. Execute o instalador do Josué App novamente.'));
    child.on('close', async code => {
      if (finished) return;
      if (code !== 0) { await writeFile(join(output, 'error.log'), diagnostic).catch(() => {}); fail(job.stage === 'error' ? job.message : 'Falha na separação. Verifique o áudio e a conexão para baixar o modelo na primeira execução. Detalhes em .data/separations.'); return; }
      try {
        const files = await readdir(output);
        const expected = job.model === 'htdemucs_6s' ? ['vocals','drums','bass','guitar','piano','other'] : ['vocals','drums','bass','other'];
        if (!expected.every(name => files.includes(`${name}.wav`))) throw new Error('Arquivos incompletos');
        job.stems = expected.map(name => ({ name: labels[name], filename: `${name}.wav`, url: `/api/separations/${job.id}/files/${name}.wav` }));
        job.status = 'completed'; job.progress = 100; job.message = 'Faixas separadas. Prontas para ouvir e baixar.'; finished = true; active = false;
      } catch { fail('O motor não gerou todas as faixas. Tente novamente com outro arquivo.'); }
    });
  }
  return async function handle(req, res, url) {
    if (!url.pathname.startsWith('/api/separations')) return false;
    try {
      if (req.method === 'GET' && url.pathname === '/api/separations/status') { json(res, 200, { ...await readiness(), busy: active }); return true; }
      if (req.method === 'POST' && url.pathname === '/api/separations') {
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { json(res, 403, { error: 'Origem não permitida.' }); return true; }
        if (active) { json(res, 409, { error: 'Outra música está sendo separada. Aguarde a conclusão.' }); return true; }
        active = true;
        try {
          const ready = await readiness();
          if (!ready.available) { active = false; json(res, 503, { error: ready.message }); return true; }
          const model = url.searchParams.get('model') || 'htdemucs';
          if (!['htdemucs','htdemucs_6s'].includes(model)) { active = false; json(res, 400, { error: 'Modelo inválido.' }); return true; }
          const chunks = []; let size = 0;
          for await (const chunk of req) { size += chunk.length; if (size > 250 * 1024 * 1024) { active = false; json(res, 413, { error: 'O limite é 250 MB por música.' }); return true; } chunks.push(chunk); }
          if (!size) { active = false; json(res, 400, { error: 'Envie um arquivo de áudio.' }); return true; }
          const id = randomUUID(), output = join(dataRoot, id);
          await mkdir(output, { recursive: true });
          const input = join(output, 'input.audio');
          await writeFile(input, Buffer.concat(chunks));
          const job = { id, model, status: 'running', stage: 'loading', progress: 0, message: 'Preparando o motor de separação...', stems: [] };
          jobs.set(id, job); run(job, input, output).catch(() => { job.status = 'failed'; job.message = 'Não foi possível iniciar a separação.'; active = false; });
          json(res, 202, job); return true;
        } catch (error) { active = false; throw error; }
      }
      const match = url.pathname.match(/^\/api\/separations\/([\da-f-]+)(?:\/files\/([a-z]+\.wav))?$/);
      const job = match && jobs.get(match[1]);
      if (!job) { json(res, 404, { error: 'Processamento não encontrado. Inicie a separação novamente.' }); return true; }
      if (req.method !== 'GET') { json(res, 405, { error: 'Método não permitido.' }); return true; }
      if (!match[2]) { json(res, 200, job); return true; }
      if (job.status !== 'completed' || !job.stems.some(stem => stem.filename === match[2])) { json(res, 404, { error: 'Faixa não encontrada.' }); return true; }
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Disposition': `attachment; filename="${match[2]}"` });
      const stream = createReadStream(join(dataRoot, job.id, match[2])); stream.on('error', () => res.destroy()); stream.pipe(res); return true;
    } catch { if (!res.headersSent) json(res, 500, { error: 'Falha no servidor de separação. Verifique espaço livre em disco.' }); else res.end(); return true; }
  };
}
