import { icon } from './icons.js';
import { studioMarkup, mountStudio } from './studio.js';
import { configureSeparation, separateTrack, checkEngine, resumeSeparation, isSeparating } from './separation-ui.js';

const view = document.querySelector('#view');
const audioInput = document.querySelector('#audio-input');
const nav = document.querySelector('#main-nav');
const toast = document.querySelector('#toast');
const state = { page: 'setlists', tracks: [], setlists: [], selectedSetlist: null, current: null, query: '', sort: 'newest', player: null };
const separationQueue = [];
let processingQueue = false;
let importingYoutube = false;

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function formatTime(seconds) { if (!Number.isFinite(seconds)) return '0:00'; const s = Math.max(0, Math.floor(seconds)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function showToast(message) { toast.textContent = message; toast.classList.add('visible'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('visible'), 3500); }

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('moises-local', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('tracks', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
const db = await openDb();
function store(mode) { return db.transaction('tracks', mode).objectStore('tracks'); }
function allTracks() { return new Promise((resolve, reject) => { const r = store('readonly').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
function getTrack(id) { return new Promise((resolve, reject) => { const r = store('readonly').get(id); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
function saveTrack(track) { return new Promise((resolve, reject) => { const r = store('readwrite').put(track); r.onsuccess = () => resolve(); r.onerror = () => reject(r.error); }); }
function deleteTrack(id) { return new Promise((resolve, reject) => { const r = store('readwrite').delete(id); r.onsuccess = () => resolve(); r.onerror = () => reject(r.error); }); }
function loadSetlists() { try { return JSON.parse(localStorage.getItem('moises-local-setlists') || '[]'); } catch { return []; } }
function saveSetlists() { localStorage.setItem('moises-local-setlists', JSON.stringify(state.setlists)); }
async function refreshTracks() { state.tracks = (await allTracks()).sort((a, b) => b.created - a.created); }
state.setlists = loadSetlists();
await refreshTracks();

function updateNav() {
  document.querySelectorAll('[data-page]').forEach(el => el.classList.toggle('active', el.dataset.page === (state.page === 'player' ? 'studio' : state.page === 'setlist' ? 'setlists' : state.page)));
  document.querySelector('#setlist-nav').innerHTML = state.setlists.map(item => `<button class="nav-item ${state.page === 'setlist' && state.selectedSetlist === item.id ? 'active' : ''}" data-setlist="${item.id}"><span class="nav-icon">${icon('list', 17)}</span><span class="setlist-name">${escapeHtml(item.name)}</span></button>`).join('');
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon, 17); });
}
function go(page, options = {}) {
  if (state.page === 'player' && page !== 'player') stopPlayer();
  state.page = page;
  Object.assign(state, options);
  state.query = '';
  updateNav();
  render();
  view.scrollTop = 0;
  view.focus({ preventScroll: true });
}

function toolbar() { return `<div class="tools"><label class="search">${icon('search', 17)}<input id="search" type="search" placeholder="Pesquisar" value="${escapeHtml(state.query)}" aria-label="Pesquisar músicas"></label><button class="icon-button" id="sort" title="Alterar ordem" aria-label="Alterar ordem">${icon('sort', 18)}</button></div>`; }
function trackRows(tracks) {
  if (!tracks.length) return `<div class="empty-box"><strong>Nenhuma música encontrada</strong><p>Importe um arquivo de áudio para começar sua biblioteca local.</p><button class="primary" data-action="upload">${icon('plus',18)} Importar música</button></div>`;
  return `<div class="library-list">${tracks.map(track => `<button class="library-row" data-track="${track.id}"><span class="track-cover">${icon('music',19)}</span><span><span class="track-name">${escapeHtml(track.name)}</span><br><span class="track-meta">${track.files.length} ${track.files.length === 1 ? 'faixa' : 'faixas'} · ${new Date(track.created).toLocaleDateString('pt-BR')}</span></span><span class="track-meta">${track.duration ? formatTime(track.duration) : 'Áudio local'}</span><span class="track-meta">${icon('triangle',16)}</span></button>`).join('')}</div>`;
}
function filteredTracks(ids = null) { let items = state.tracks.filter(track => (!ids || ids.includes(track.id)) && track.name.toLocaleLowerCase().includes(state.query.toLocaleLowerCase())); return items.sort((a,b) => state.sort === 'name' ? a.name.localeCompare(b.name) : b.created - a.created); }
function setlistsHome() { return `<div class="page setlists-page"><div class="page-heading"><div><h1>Setlists</h1><p>Organize as músicas que você quer tocar.</p></div><button class="primary" id="create-setlist">${icon('plus',17)} Nova setlist</button></div>${state.setlists.length ? `<div class="setlist-grid">${state.setlists.map(list => `<button class="setlist-card" data-setlist="${list.id}"><span class="setlist-card-icon">${icon('list',22)}</span><strong>${escapeHtml(list.name)}</strong><small>${list.trackIds.length} ${list.trackIds.length === 1 ? 'música' : 'músicas'}</small></button>`).join('')}</div>` : `<div class="empty-box"><strong>Crie sua primeira setlist</strong><p>Reúna as músicas em uma lista para acessar tudo rapidamente.</p><button class="secondary" id="create-setlist-empty">Criar setlist</button></div>`}</div>`; }
function upload() { return `<div class="page upload-page"><h1>Adicionar música</h1><p>Escolha um arquivo ou cole o link de um vídeo do YouTube. Depois você decide se quer separar os instrumentos.</p><div class="dropzone" id="dropzone" role="button" tabindex="0" aria-label="Selecionar arquivos de áudio"><span class="drop-plus">${icon('plus',22)}</span><span class="drop-copy"><strong>Solte ou selecione sua música aqui</strong><small>MP3, WAV, FLAC, M4A e outros · até 250 MB por música</small></span></div><form class="youtube-form" id="youtube-form"><label for="youtube-url">Link do YouTube</label><div class="youtube-fields"><input id="youtube-url" name="url" type="url" inputmode="url" autocomplete="url" placeholder="https://www.youtube.com/watch?v=..." required><button class="primary" type="submit" ${importingYoutube ? 'disabled' : ''}>${importingYoutube ? 'Importando...' : 'Importar link'}</button></div><small id="youtube-status" role="status" aria-live="polite">Vídeos de até 20 minutos e 250 MB. Use conteúdo que você tem permissão para baixar.</small></form><p class="upload-explanation">4 faixas: vocais, bateria, baixo e outros instrumentos.<br>6 faixas: acrescenta guitarra e piano (experimental).<br>O áudio é processado neste computador. Em CPU, a separação pode levar vários minutos.</p></div>`; }
function studioHome() { return `<div class="page"><div class="page-heading"><div><h1>Studio</h1><p>Abra uma música para ajustar os instrumentos e visualizar as formas de onda.</p></div><button class="primary" data-action="upload">${icon('plus',17)} Nova música</button></div><div class="section-head"><h2>Seus projetos</h2>${toolbar()}</div>${trackRows(filteredTracks())}</div>`; }
function setlist() { const list = state.setlists.find(item => item.id === state.selectedSetlist); if (!list) return '<div class="page">Setlist não encontrada.</div>'; return `<div class="page"><div class="setlist-header"><div><h1>${escapeHtml(list.name)}</h1><p class="track-meta">${list.trackIds.length} músicas</p></div><div class="setlist-actions"><button class="secondary" id="rename-setlist">Renomear</button><button class="secondary" id="delete-setlist">${icon('trash',16)} Excluir</button></div></div><div class="section-head"><h2>Músicas</h2>${list.trackIds.length ? toolbar() : ''}</div>${list.trackIds.length ? trackRows(filteredTracks(list.trackIds)) : `<div class="empty-box"><strong>Esta setlist está vazia</strong><p>Abra uma música no Studio e use “Adicionar à setlist”.</p><button class="primary" data-page="studio">Abrir Studio</button></div>`}</div>`; }

function render() {
  document.body.classList.toggle('studio-active', state.page === 'player');
  document.querySelector('.studio-project-tab')?.remove();
  if (state.page === 'player' && state.player) {
    const tab = document.createElement('span');
    tab.className = 'studio-project-tab';
    tab.textContent = state.player.track.name;
    document.querySelector('.titlebar').append(tab);
  }
  const pages = { setlists: setlistsHome, upload, setlist, studio: studioHome };
  view.innerHTML = state.page === 'player' ? playerPage() : (pages[state.page] || setlistsHome)();
  if (state.page === 'player') setupPlayerView();
}

async function importFiles(files) {
  const valid = [...files].filter(file => file.type.startsWith('audio/') || /\.(mp3|wav|flac|m4a|wma|ogg|aac)$/i.test(file.name));
  if (!valid.length) return showToast('Selecione um arquivo de áudio válido.');
  const imported = [];
  for (const file of valid) {
    const track = { id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, ''), created: Date.now(), duration: null, lyrics: '', files: [{ name: 'Original', blob: file }] };
    await saveTrack(track);
    imported.push(track.id);
  }
  await refreshTracks();
  audioInput.value = '';
  showToast(`${valid.length} ${valid.length === 1 ? 'música importada' : 'músicas importadas'} com sucesso.`);
  await openPlayer(imported[0]);
  await promptSeparation(imported);
}
audioInput.addEventListener('change', e => importFiles(e.target.files).catch(err => showToast(`Falha ao importar: ${err.message}`)));

async function processSeparationQueue() {
  if (processingQueue) return;
  processingQueue = true;
  try {
    while (separationQueue.length) {
      const { id, model } = separationQueue.shift();
      const track = await getTrack(id);
      if (track) await separateTrack(track, model);
    }
  } finally { processingQueue = false; }
}

function promptSeparation(ids) {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    backdrop.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="separation-question"><h2 id="separation-question">Separar os instrumentos?</h2><p class="dialog-description">${ids.length === 1 ? 'Sua música foi adicionada. Deseja criar faixas separadas para voz e instrumentos?' : `${ids.length} músicas foram adicionadas. Deseja separar os instrumentos de todas elas?`}</p><label class="dialog-label" for="separation-choice">Faixas</label><select id="separation-choice"><option value="htdemucs">4 faixas: voz, bateria, baixo e outros</option><option value="htdemucs_6s">6 faixas: inclui guitarra e piano</option></select><div class="dialog-actions"><button type="button" class="secondary cancel">Agora não</button><button type="button" class="primary accept">Separar instrumentos</button></div></div>`;
    document.body.append(backdrop);
    const previous = document.activeElement;
    const close = accepted => {
      if (accepted) {
        const model = backdrop.querySelector('select').value;
        separationQueue.push(...ids.map(id => ({ id, model })));
        processSeparationQueue().catch(error => showToast(error.message));
      }
      backdrop.remove();
      previous?.focus?.();
      resolve();
    };
    backdrop.querySelector('.cancel').onclick = () => close(false);
    backdrop.querySelector('.accept').onclick = () => close(true);
    backdrop.onkeydown = event => { if (event.key === 'Escape') close(false); };
    backdrop.querySelector('.accept').focus();
  });
}

async function importYoutube(form) {
  if (importingYoutube) return;
  importingYoutube = true;
  const button = form.querySelector('button');
  const status = form.querySelector('#youtube-status');
  button.disabled = true;
  button.textContent = 'Importando...';
  status.textContent = 'Baixando o áudio. Isso pode levar alguns minutos.';
  try {
    const response = await fetch('/api/youtube/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: form.elements.url.value.trim() }) });
    if (!response.ok) throw new Error((await response.json()).error || 'Não foi possível importar o link.');
    const title = decodeURIComponent(response.headers.get('X-Track-Title') || 'Música do YouTube');
    const extension = response.headers.get('X-Audio-Extension') || 'm4a';
    const blob = await response.blob();
    const file = new File([blob], `${title}.${extension}`, { type: blob.type });
    const track = { id: crypto.randomUUID(), name: title, created: Date.now(), duration: null, lyrics: '', files: [{ name: 'Original', blob: file }] };
    await saveTrack(track);
    await refreshTracks();
    showToast('Música importada com sucesso.');
    await openPlayer(track.id);
    await promptSeparation([track.id]);
  } catch (error) {
    status.textContent = error.message;
    showToast(error.message);
  } finally {
    importingYoutube = false;
    button.disabled = false;
    button.textContent = 'Importar link';
  }
}

function modal(title, value, callback) {
  const backdrop = document.createElement('div'); backdrop.className = 'dialog-backdrop';
  backdrop.innerHTML = `<form class="dialog"><h2>${escapeHtml(title)}</h2><input name="name" maxlength="60" required value="${escapeHtml(value)}" aria-label="Nome"><div class="dialog-actions"><button type="button" class="secondary cancel">Cancelar</button><button class="primary">Salvar</button></div></form>`;
  document.body.append(backdrop); const input = backdrop.querySelector('input'); input.focus(); input.select();
  backdrop.querySelector('.cancel').onclick = () => backdrop.remove();
  backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.querySelector('form').onsubmit = e => { e.preventDefault(); callback(input.value.trim()); backdrop.remove(); };
}
function createSetlist() { modal('Nova setlist', '', name => { if (!name) return; const item = { id: crypto.randomUUID(), name, trackIds: [] }; state.setlists.push(item); saveSetlists(); go('setlist', { selectedSetlist: item.id }); }); }

nav.addEventListener('click', e => { const button = e.target.closest('[data-page],[data-setlist]'); if (button?.dataset.page) go(button.dataset.page); if (button?.dataset.setlist) go('setlist', { selectedSetlist: button.dataset.setlist }); });
document.querySelector('#new-setlist').addEventListener('click', createSetlist);
view.addEventListener('click', async e => {
  if (e.target.closest('#create-setlist, #create-setlist-empty')) { createSetlist(); return; }
  const setlistButton = e.target.closest('[data-setlist]'); if (setlistButton) { go('setlist', { selectedSetlist: setlistButton.dataset.setlist }); return; }
  const pageButton = e.target.closest('[data-page]'); if (pageButton) { go(pageButton.dataset.page); return; }
  const action = e.target.closest('[data-action]')?.dataset.action; if (action === 'upload') { go('upload'); return; }
  const trackButton = e.target.closest('[data-track]'); if (trackButton) { await openPlayer(trackButton.dataset.track); return; }
  if (e.target.closest('#dropzone')) { audioInput.click(); return; }
  if (e.target.closest('#sort')) { state.sort = state.sort === 'newest' ? 'name' : 'newest'; render(); return; }
  if (e.target.closest('#rename-setlist')) { const list = state.setlists.find(x => x.id === state.selectedSetlist); modal('Renomear setlist', list.name, name => { if (!name) return; list.name = name; saveSetlists(); updateNav(); render(); }); return; }
  if (e.target.closest('#delete-setlist')) { const list = state.setlists.find(x => x.id === state.selectedSetlist); if (confirm(`Excluir a setlist “${list.name}”? As músicas serão mantidas.`)) { state.setlists = state.setlists.filter(x => x.id !== list.id); saveSetlists(); go('setlists'); } return; }
});
view.addEventListener('submit', e => { if (e.target.id === 'youtube-form') { e.preventDefault(); importYoutube(e.target); } });
view.addEventListener('input', e => { if (e.target.id === 'search') { const selection = e.target.selectionStart; state.query = e.target.value; render(); const next = document.querySelector('#search'); if (next) { next.focus(); next.setSelectionRange(selection, selection); } } });
view.addEventListener('dragover', e => { if (e.target.closest('#dropzone')) { e.preventDefault(); e.target.closest('#dropzone').classList.add('dragging'); } });
view.addEventListener('dragleave', e => e.target.closest('#dropzone')?.classList.remove('dragging'));
view.addEventListener('drop', e => { if (e.target.closest('#dropzone')) { e.preventDefault(); e.target.closest('#dropzone').classList.remove('dragging'); importFiles(e.dataTransfer.files).catch(err => showToast(err.message)); } });
view.addEventListener('keydown', e => { if (e.target.id === 'dropzone' && ['Enter',' '].includes(e.key)) { e.preventDefault(); audioInput.click(); } });

function stopPlayer(options = {}) {
  state.player?.studio?.destroy(options);
  state.player = null;
}
async function openPlayer(id) {
  stopPlayer();
  const track = state.tracks.find(item => item.id === id);
  if (!track) return;
  state.player = { track, studio: null };
  state.current = id;
  go('player');
}
function playerPage() { return state.player ? studioMarkup(state.player.track) : ''; }
function setupPlayerView() {
  const player = state.player;
  player.studio = mountStudio({ root: view, track: player.track, notify: showToast,
    onSave: track => saveTrack(track).catch(() => showToast('Não foi possível salvar os ajustes. Verifique o espaço do navegador.')),
    onAction: (action, value) => studioAction(player.track, action, value).catch(error => showToast(error.message)),
  });
  resumeSeparation(player.track);
}
async function studioAction(track, action, value) {
  if (action === 'back') return go('studio');
  if (action === 'separate') return separateTrack(track);
  if (action === 'check-engine') return checkEngine();
  if (action === 'download') {
    const file = track.files[value], link = document.createElement('a');
    link.href = URL.createObjectURL(file.blob);
    link.download = file.filename || file.blob.name || `${track.name}-${file.name}.wav`;
    link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1500);
  }
  if (action === 'add-file') {
    track.files.push({ name: value.name.replace(/\.[^.]+$/, ''), blob: value });
    await saveTrack(track);
    await openPlayer(track.id);
  }
  if (action === 'setlist') {
    modal('Adicionar à setlist', state.setlists[0]?.name || '', name => {
      if (!name) return;
      let list = state.setlists.find(item => item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
      if (!list) { list = { id: crypto.randomUUID(), name, trackIds: [] }; state.setlists.push(list); }
      if (!list.trackIds.includes(track.id)) list.trackIds.push(track.id);
      saveSetlists(); updateNav(); showToast('Música adicionada à setlist.');
    });
  }
  if (action === 'remove') {
    if (isSeparating(track.id)) return showToast('Aguarde a separação terminar antes de excluir a música.');
    if (!confirm(`Excluir \u201c${track.name}\u201d da biblioteca local?`)) return;
    stopPlayer(); await deleteTrack(track.id);
    state.setlists.forEach(list => list.trackIds = list.trackIds.filter(id => id !== track.id));
    saveSetlists(); await refreshTracks(); go('studio'); showToast('Música excluída.');
  }
}
window.addEventListener('beforeunload', stopPlayer);
configureSeparation({
  currentTrack: () => state.page === 'player' ? state.player?.track : null,
  save: saveTrack,
  load: async id => state.player?.track.id === id ? state.player.track : await getTrack(id),
  notify: showToast,
  completed: async track => {
    const reopen = state.page === 'player' && state.current === track.id;
    if (reopen) stopPlayer({ save: false });
    await refreshTracks();
    if (reopen && state.page === 'player' && state.current === track.id) await openPlayer(track.id);
  },
});
updateNav();render();
