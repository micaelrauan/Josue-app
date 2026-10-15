import { icon } from './icons.js';
import { studioMarkup, mountStudio } from './studio.js';
import { configureSeparation, separateTrack, checkEngine, resumeSeparation, isSeparating } from './separation-ui.js';

const view = document.querySelector('#view');
const audioInput = document.querySelector('#audio-input');
const nav = document.querySelector('#main-nav');
const toast = document.querySelector('#toast');
const state = { page: 'home', tracks: [], setlists: [], selectedSetlist: null, current: null, query: '', sort: 'newest', player: null };
const products = [
  { page: 'play', title: 'Play', description: 'Aprenda, pratique e organize suas músicas.', color: '#2ee6ef', icon: 'play' },
  { page: 'studio', title: 'Studio', description: 'Trabalhe com áudio e faixas em um só lugar.', color: '#48d7a1', icon: 'studio' },
  { page: 'mastering', title: 'Masterização', description: 'Prepare a versão final da sua música.', color: '#bf86ee', icon: 'mastering' },
  { page: 'voice', title: 'Voice Studio', description: 'Explore projetos de voz e gravação.', color: '#f693ac', icon: 'voice' },
  { page: 'lyrics', title: 'Lyric Writer', description: 'Escreva, edite e organize letras.', color: '#63aafa', icon: 'lyrics' },
];

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
  document.querySelectorAll('[data-page]').forEach(el => el.classList.toggle('active', el.dataset.page === (state.page === 'player' ? 'studio' : state.page)));
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
function home() { return `<div class="page home-page"><div class="product-strip">${products.map(p => `<button class="product-card" data-page="${p.page}" style="--art-color:${p.color}"><div class="card-art"><span class="art-lines"></span><span class="art-icon">${icon(p.icon,88)}</span></div><div class="product-content"><div class="small-icon">${icon(p.icon,21)}</div><strong>${p.title}</strong><p>${p.description}</p></div></button>`).join('')}</div><div class="section-head"><h2>Arquivos</h2>${toolbar()}</div>${state.tracks.length ? trackRows(filteredTracks()) : '<div class="empty-box"><strong>Você ainda não tem arquivos!</strong><p>Comece com uma música do seu computador. Seus arquivos ficam salvos somente neste navegador.</p><button class="primary" data-action="upload">' + icon('plus',18) + ' Iniciar um projeto</button></div>'}</div>`; }
function play() { if (!state.tracks.length) return `<div class="page"><div class="play-empty"><h1>Faça upload da sua primeira música</h1><p>Reproduza, pratique junto e organize suas músicas em um só lugar.</p><button class="primary" data-action="upload">${icon('plus',18)} Fazer upload de música</button></div></div>`; return `<div class="page"><div class="page-heading"><div><h1>Biblioteca</h1><p>Suas músicas salvas neste navegador</p></div><button class="primary" data-action="upload">${icon('plus',18)} Nova música</button></div><div class="section-head"><h2>Músicas</h2>${toolbar()}</div>${trackRows(filteredTracks())}</div>`; }
function upload() { return `<div class="page upload-page"><h1>Separar faixas por instrumentos</h1><p>Escolha uma música. No Studio, selecione 4 ou 6 faixas e clique em Separar instrumentos.</p><div class="dropzone" id="dropzone" role="button" tabindex="0" aria-label="Selecionar arquivos de áudio"><span class="drop-plus">${icon('plus',22)}</span><span class="drop-copy"><strong>Solte ou selecione sua música aqui</strong><small>MP3, WAV, FLAC, M4A e outros · até 250 MB por música</small></span></div><p class="upload-explanation">4 faixas: vocais, bateria, baixo e outros instrumentos.<br>6 faixas: acrescenta guitarra e piano (experimental).<br>O áudio é processado neste computador. Em CPU, a separação pode levar vários minutos.</p></div>`; }
function studioHome() { return `<div class="page"><div class="page-heading"><div><h1>Studio</h1><p>Abra uma música para ajustar os instrumentos e visualizar as formas de onda.</p></div><button class="primary" data-action="upload">${icon('plus',17)} Nova música</button></div><div class="section-head"><h2>Seus projetos</h2>${toolbar()}</div>${trackRows(filteredTracks())}</div>`; }
function setlist() { const list = state.setlists.find(item => item.id === state.selectedSetlist); if (!list) return '<div class="page">Setlist não encontrada.</div>'; return `<div class="page"><div class="setlist-header"><div><h1>${escapeHtml(list.name)}</h1><p class="track-meta">${list.trackIds.length} músicas</p></div><div class="setlist-actions"><button class="secondary" id="rename-setlist">Renomear</button><button class="secondary" id="delete-setlist">${icon('trash',16)} Excluir</button></div></div><div class="section-head"><h2>Músicas</h2>${toolbar()}</div>${trackRows(filteredTracks(list.trackIds))}</div>`; }
function feature(title, lead, detail, action) { return `<div class="page feature-page"><h1>${title}</h1><p class="feature-lead">${lead}</p><div class="feature-panel"><h2>${detail}</h2><p>Use seus arquivos locais para continuar. Os recursos de IA do serviço original dependem da infraestrutura do Moises e não estão presentes nesta recriação.</p><button class="primary" data-action="${action}">${icon('plus',18)} ${action === 'upload' ? 'Adicionar música' : 'Abrir biblioteca'}</button></div></div>`; }
function lyricsPage() { return `<div class="page feature-page"><h1>Lyric Writer</h1><p class="feature-lead">Escreva letras para suas músicas. Abra uma faixa da biblioteca para salvar uma letra junto ao áudio.</p><div class="feature-panel"><h2>Suas músicas</h2>${trackRows(state.tracks)}</div></div>`; }
function downloads() { return `<div class="page feature-page"><h1>Downloads</h1><p class="feature-lead">Suas músicas estão guardadas no armazenamento local deste navegador. Abra uma música e use o botão de download para exportar o arquivo original.</p><div class="feature-panel">${trackRows(state.tracks)}</div></div>`; }

function render() {
  document.body.classList.toggle('studio-active', state.page === 'player');
  document.querySelector('.studio-project-tab')?.remove();
  if (state.page === 'player' && state.player) {
    const tab = document.createElement('span');
    tab.className = 'studio-project-tab';
    tab.textContent = state.player.track.name;
    document.querySelector('.titlebar-plus').before(tab);
  }
  const pages = { home, play, upload, setlist, lyrics: lyricsPage, downloads, studio: studioHome, mastering: () => feature('Masterização','Finalize áudio e prepare versões para compartilhar.','Projetos de áudio','upload'), voice: () => feature('Voice Studio','Organize gravações de voz junto às suas músicas.','Projetos de voz','upload') };
  view.innerHTML = state.page === 'player' ? playerPage() : (pages[state.page] || home)();
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
}
audioInput.addEventListener('change', e => importFiles(e.target.files).catch(err => showToast(`Falha ao importar: ${err.message}`)));

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
document.querySelector('.sidebar-bottom').addEventListener('click', e => { const button = e.target.closest('[data-page]'); if (button) go(button.dataset.page); });
document.querySelector('#new-setlist').addEventListener('click', createSetlist);
view.addEventListener('click', async e => {
  const pageButton = e.target.closest('[data-page]'); if (pageButton) { go(pageButton.dataset.page); return; }
  const action = e.target.closest('[data-action]')?.dataset.action; if (action === 'upload') { go('upload'); return; } if (action === 'library') { go('play'); return; }
  const trackButton = e.target.closest('[data-track]'); if (trackButton) { await openPlayer(trackButton.dataset.track); return; }
  if (e.target.closest('#dropzone')) { audioInput.click(); return; }
  if (e.target.closest('#sort')) { state.sort = state.sort === 'newest' ? 'name' : 'newest'; render(); return; }
  if (e.target.closest('#rename-setlist')) { const list = state.setlists.find(x => x.id === state.selectedSetlist); modal('Renomear setlist', list.name, name => { if (!name) return; list.name = name; saveSetlists(); updateNav(); render(); }); return; }
  if (e.target.closest('#delete-setlist')) { const list = state.setlists.find(x => x.id === state.selectedSetlist); if (confirm(`Excluir a setlist “${list.name}”? As músicas serão mantidas.`)) { state.setlists = state.setlists.filter(x => x.id !== list.id); saveSetlists(); go('play'); } return; }
});
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
