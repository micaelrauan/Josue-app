import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const electron = process.argv[2];
if (!electron) throw new Error('Caminho do Electron ausente. Use npm run dev:desktop.');

const backend = new Set(['server.js', 'separation.js', 'audio-export.js', 'youtube-import.js', 'package.json']);
let child;
let restarting = false;
let stopping = false;
let timer;

function start() {
  child = spawn(electron, [root], { cwd: root, stdio: 'inherit', windowsHide: false,
    env: { ...process.env, JOSUE_DEV: '1' } });
  child.on('error', error => { console.error(`Falha ao abrir Electron: ${error.message}`); shutdown(1); });
  child.on('exit', code => {
    if (restarting && !stopping) { restarting = false; start(); }
    else shutdown(code || 0);
  });
}

function restart() {
  if (stopping || restarting || !child) return;
  restarting = true;
  console.log('Código do servidor alterado. Reiniciando aplicativo...');
  child.kill();
}

function scheduleRestart() { clearTimeout(timer); timer = setTimeout(restart, 250); }
const watchers = [
  watch(root, (_event, filename) => { if (filename && backend.has(String(filename))) scheduleRestart(); }),
  watch(join(root, 'desktop'), (_event, filename) => { if (filename === 'main.cjs' || filename === 'updates.cjs') scheduleRestart(); }),
];

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  watchers.forEach(watcher => watcher.close());
  if (child && child.exitCode === null) child.kill();
  process.exitCode = code;
}

process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
start();
