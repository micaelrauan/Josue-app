const jobs = new Map();
let engine = { available: false, message: 'Verificando o motor de separação...' };
let checking = false;
let hooks;
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function configureSeparation(callbacks) { hooks = callbacks; checkEngine(); }
export function isSeparating(id) { return Boolean(jobs.get(id)?.running); }
export function separationPanel(track) {
  const job = jobs.get(track.id);
  const running = job?.running;
  const separated = track.files.some(file => file.role === 'stem');
  return `<section class="separation-panel" id="separation-panel" data-track-id="${track.id}" aria-label="Separação de instrumentos"><div><h2>${separated ? 'Instrumentos separados' : 'Separar vocais e instrumentos'}</h2><p>${escape(job?.message || (separated ? 'Ouça cada instrumento no mixer ou baixe as faixas em WAV.' : engine.message))}</p>${running ? `<progress max="100" value="${job.progress || 0}" aria-label="Progresso da separação"></progress><span class="track-meta">${job.progress || 0}% · O processamento continua enquanto você navega.</span>` : ''}${!engine.available && !running ? '' : ''}</div><div class="separation-actions"><label>Instrumentos<select id="separation-model" ${running ? 'disabled' : ''}><option value="htdemucs">4 faixas: vocais, bateria, baixo e outros</option><option value="htdemucs_6s" ${track.separationModel === 'htdemucs_6s' ? 'selected' : ''}>6 faixas: inclui guitarra e piano</option></select></label><button class="primary" id="separate-track" ${running || !engine.available ? 'disabled' : ''}>${running ? 'Separando...' : separated ? 'Separar novamente' : 'Separar instrumentos'}</button>${!running ? '<button class="text-button" id="check-separation">Verificar motor</button>' : ''}</div></section>`;
}
function repaint(track) { const panel = document.querySelector('#separation-panel'); if (panel?.dataset.trackId === track.id) panel.outerHTML = separationPanel(track); }
export async function checkEngine() {
  if (checking) return;
  checking = true;
  try {
    const response = await fetch('/api/separations/status');
    if (!response.ok) throw new Error('Reinicie o servidor com npm run dev para ativar a separação.');
    engine = await response.json();
  } catch (error) { engine = { available: false, message: error.message }; }
  finally { checking = false; const track = hooks?.currentTrack(); if (track) repaint(track); }
}
export async function separateTrack(track) {
  if (jobs.get(track.id)?.running) return;
  const model = document.querySelector('#separation-model')?.value || 'htdemucs';
  jobs.set(track.id, { running: true, progress: 0, message: 'Enviando o áudio para o motor neste computador...' }); repaint(track);
  try {
    const response = await fetch(`/api/separations?model=${model}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: track.files[0].blob });
    const job = await response.json();
    if (!response.ok) throw new Error(job.error || 'Não foi possível iniciar a separação.');
    track.separationJob = job.id; track.separationModel = model;
    await hooks.save(track);
    await watch(track, job.id);
  } catch (error) { failure(track, error); }
}
export function resumeSeparation(track) {
  if (!track.separationJob || jobs.has(track.id)) return;
  jobs.set(track.id, { running: true, progress: 0, message: 'Retomando acompanhamento da separação...' }); repaint(track);
  watch(track, track.separationJob).catch(error => failure(track, error));
}
function failure(track, error) { jobs.set(track.id, { running: false, message: error.message }); repaint(track); hooks.notify(error.message); }
async function watch(track, id) {
  while (true) {
    const response = await fetch(`/api/separations/${id}`);
    const job = await response.json();
    if (!response.ok) throw new Error(job.error || 'Não foi possível acompanhar a separação.');
    if (job.status === 'failed') { delete track.separationJob; await hooks.save(track); throw new Error(job.message); }
    jobs.set(track.id, { running: true, progress: job.progress, message: job.message }); repaint(track);
    if (job.status === 'completed') {
      const stems = [];
      for (const stem of job.stems) {
        const result = await fetch(stem.url);
        if (!result.ok) throw new Error('Não foi possível carregar uma das faixas. Tente acompanhar novamente.');
        stems.push({ name: stem.name, filename: stem.filename, blob: await result.blob(), role: 'stem' });
      }
      const trackId = track.id;
      track = await hooks.load(trackId);
      if (!track) { jobs.delete(trackId); return; }
      track.files = [...track.files.filter(file => file.role !== 'stem'), ...stems];
      delete track.mix;
      delete track.separationJob;
      await hooks.save(track);
      jobs.delete(track.id);
      await hooks.completed(track);
      hooks.notify('Instrumentos separados. Use M para silenciar e S para ouvir uma faixa sozinha.');
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
}
