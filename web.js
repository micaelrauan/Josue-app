import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppServer } from './server.js';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const installedEngineRoot = process.platform === 'darwin'
  ? join(homedir(), 'Library', 'Application Support', 'JosueApp', 'engine')
  : process.platform === 'win32' && process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'JosueApp', 'engine')
    : null;
const engineRoot = process.env.JOSUE_ENGINE_ROOT
  ? resolve(process.env.JOSUE_ENGINE_ROOT)
  : installedEngineRoot && existsSync(join(installedEngineRoot, '.venv'))
    ? installedEngineRoot
    : projectRoot;
const port = process.env.PORT === undefined ? 4173 : Number(process.env.PORT);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('PORT deve ser um número entre 0 e 65535.');
  process.exitCode = 1;
} else {
  const server = createAppServer({
    root: join(projectRoot, 'public'),
    dataRoot: join(projectRoot, '.data'),
    venvRoot: join(engineRoot, '.venv'),
    modelsRoot: join(engineRoot, '.models'),
  });
  server.on('error', error => {
    console.error(`Não foi possível iniciar a versão web: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Josué App web: http://127.0.0.1:${server.address().port}/`);
  });
}
