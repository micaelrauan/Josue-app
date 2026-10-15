import { icon } from './icons.js';
import { StudioAudio, waveformPeaks } from './studio-audio.js';
import { orderedFiles, exportFiles, mixerSettings, button } from './studio-view.js';
import { escapeHtml as escape, timeLabel as time, parseTimedText, transposeChord, guitarDiagram, encodeWav, zipFiles, downloadBlob } from './studio-utils.js';

export function mountStudio({root,track,onAction,onSave,notify}){
  const context=new AudioContext(),settings=mixerSettings(track),engine=new StudioAudio(context,settings),prefs=track.studio||{};
  const peaks=new Map(),failed=new Set();
  let exportFormat='wav',loaded=false;
  let manualScrollUntil=0;
  let disposed=false,animation,zoom=1,start=null,end=null,loop=false,saveTimer,lastPosition=-1,activePanel=null,showLyrics=false,showChords=false,exporting=false,pitchReady=false,lastRead=-1;
  const $=selector=>root.querySelector(selector),$$=selector=>root.querySelectorAll(selector);
  const persist=()=>{track.mix=settings;track.studio=prefs;clearTimeout(saveTimer);saveTimer=setTimeout(()=>{saveTimer=null;onSave(track).catch(()=>notify('Não foi possível salvar. Verifique o espaço do navegador.'));},300);};
  engine.bpm=Number(prefs.bpm)||120;
  function mix(save=true){
    engine.updateMix();const hasSolo=settings.channels.some(c=>c.solo);
    settings.channels.forEach((channel,index)=>{const row=$(`[data-channel="${index}"]`);row.classList.toggle('is-muted',hasSolo?!channel.solo:channel.muted);for(const key of ['mute','solo']){const b=row.querySelector(`[data-studio="${key}"]`),on=key==='mute'?channel.muted:channel.solo;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));}row.querySelector('.studio-pan-knob').style.setProperty('--pan-angle',`${channel.pan*135}deg`);});
    $$('input[type="range"]').forEach(range=>range.style.setProperty('--range-fill',`${(range.value-range.min)/(range.max-range.min)*100}%`));if(save)persist();
  }
  function panel(name){
    const open=$(`#panel-${name}`).hidden;$$('.studio-popover').forEach(p=>p.hidden=true);$$('[data-studio="panel"]').forEach(b=>b.setAttribute('aria-expanded','false'));
    activePanel=open?name:null;$(`#panel-${name}`).hidden=!open;$$(`[data-panel="${name}"]`).forEach(b=>b.setAttribute('aria-expanded',String(open)));
    if(open)$(`#panel-${name}`).querySelector('input,button,select')?.focus();
  }
  function drawWaves(){
    const scroller=$('#studio-scroll'),timeline=$('#studio-timeline');if(!scroller||disposed)return;
    const mobile=window.matchMedia('(max-width:700px)').matches,sectionsOpen=!$('#studio-sections').hidden;
    scroller.inert=mobile&&(showLyrics||showChords||sectionsOpen);$('#studio-reading').inert=mobile&&sectionsOpen;
    const controlWidth=parseFloat(getComputedStyle(timeline).getPropertyValue('--channel-width'))||236;
    const available=scroller.clientWidth-(parseFloat(getComputedStyle(scroller).paddingRight)||0);
    timeline.style.width=`${Math.max(available,controlWidth+Math.max(180,available-controlWidth)*zoom)}px`;
    $$('.studio-wave').forEach(wave=>{
      const index=Number(wave.dataset.index),canvas=wave.querySelector('canvas'),data=peaks.get(index);wave.setAttribute('aria-valuemax',String(engine.duration));if(!data)return;
      const ratio=Math.min(window.devicePixelRatio||1,2),width=Math.max(1,Math.floor(wave.clientWidth*ratio)),height=64*ratio;canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d');ctx.clearRect(0,0,width,height);ctx.fillStyle='#087f88';
      const bars=Math.min(data.length,width),stretch=(engine.buffers[index]?.duration||engine.duration)/(engine.duration||1);
      for(let i=0;i<bars;i++){const from=Math.floor(i*data.length/bars),to=Math.max(from+1,Math.floor((i+1)*data.length/bars));let value=0;for(let j=from;j<to;j++)value=Math.max(value,data[j]);const amplitude=Math.max(.3*ratio,Math.min(1,value)*height*.46);ctx.fillRect(i/bars*width*stretch,height/2-amplitude,Math.max(1,width*stretch/bars),amplitude*2);}
    });position(true);loopView();
  }
  function position(force=false){
    const current=engine.time,percent=engine.duration?current/engine.duration*100:0;$('#studio-current').textContent=context.currentTime<engine.startedAt&&engine.playing?String(Math.ceil((engine.startedAt-context.currentTime)*engine.bpm*engine.rate/60)):time(current);
    if(!$('#studio-seek').matches(':active'))$('#studio-seek').value=current;
    if(force||Math.abs(percent-lastPosition)>.02){$$('.studio-playhead,.studio-ruler-head').forEach(el=>el.style.left=`${percent}%`);lastPosition=percent;$('#studio-seek').style.setProperty('--range-fill',`${percent}%`);}
    if(force)$$('.studio-wave').forEach(el=>{el.setAttribute('aria-valuenow',String(current));el.setAttribute('aria-valuetext',time(current));});
    if(showLyrics||showChords){const second=Math.floor(current*4);if(second!==lastRead){lastRead=second;highlightNotes(current);}}
  }
  function transport(){const b=$('#studio-play');b.innerHTML=icon(engine.playing?'pause':'triangle',23);b.setAttribute('aria-label',engine.playing?'Pausar':'Reproduzir');}
  function loopView(){
    const valid=start!==null&&end!==null;$('#studio-loop').classList.toggle('selected',loop);$('#studio-loop').setAttribute('aria-pressed',String(loop));$('#studio-loop-trigger').classList.toggle('active',loop);
    $('#studio-loop-label').textContent=valid?`${time(start)} – ${time(end)}${loop?' · repetindo':''}`:start!==null?`Início em ${time(start)} · marque o fim`:'Nenhum trecho marcado';
    $$('.studio-loop-region').forEach(el=>{el.hidden=!valid;if(valid){el.style.left=`${start/engine.duration*100}%`;el.style.width=`${(end-start)/engine.duration*100}%`;}});
  }
  function applyLoop(){engine.setLoop(loop?start:prefs.repeat?0:null,loop?end:prefs.repeat?engine.duration:null);}
  function renderNotes(){
    const lyrics=parseTimedText(track.lyrics||''),chords=parseTimedText(track.chords||'');
    $('#studio-reading-title').textContent=showLyrics&&showChords?'Letra + Acordes':showChords?'Acordes':'Letra';
    $('#studio-reading').hidden=!showLyrics&&!showChords;$('.studio-workspace').classList.toggle('reading-open',showLyrics||showChords);
    $$('.studio-wave').forEach(wave=>{wave.tabIndex=showLyrics||showChords?-1:0;wave.setAttribute('aria-hidden',String(showLyrics||showChords));});
    $$('[data-studio="lyrics"],[data-studio="chords"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.studio==='lyrics'?showLyrics:showChords)));
    const content=$('#studio-reading-content');
    if(showLyrics){const lines=lyrics.length?lyrics:(track.lyrics||'').split('\n').filter(Boolean).map(text=>({text,time:null}));content.innerHTML=lines.length?lines.map((line,index)=>`<button class="studio-lyric-line" data-studio="note-seek" data-time="${line.time??''}" ${line.time===null?'disabled':''}>${showChords&&line.time!==null?`<span class="studio-inline-chords">${chords.filter(c=>c.time>=line.time&&c.time<(lines[index+1]?.time??Infinity)).map(c=>escape(transposeChord(c.text,engine.semitones))).join('　')}</span>`:''}${escape(line.text)}</button>`).join(''):'<div class="studio-reading-empty"><h3>Adicione a letra desta música</h3><p>Importe um LRC com tempos ou cole sua letra no editor.</p>'+button('edit-notes','Adicionar letra','plus')+'</div>';}
    else content.innerHTML=chords.length?'<div class="studio-chord-now" id="studio-chord-now"></div><div class="studio-chord-sequence">'+chords.map(c=>`<button data-studio="note-seek" data-time="${c.time}"><strong>${escape(transposeChord(c.text,engine.semitones))}</strong><small>${time(c.time)}</small></button>`).join('')+'</div>':'<div class="studio-reading-empty"><h3>Adicione os acordes</h3><p>Use acordes com tempo para acompanhar a música e transpor junto com o tom.</p>'+button('edit-notes','Editar acordes','chords')+'</div>';
    highlightNotes(engine.time);drawWaves();
  }
  function highlightNotes(current){
    const lines=[...$$('[data-studio="note-seek"]')];let active=null;for(const line of lines)if(line.dataset.time!==''&&Number(line.dataset.time)<=current)active=line;
    for(const line of lines)line.classList.toggle('current',line===active);
    if(active&&engine.playing&&Date.now()>manualScrollUntil&&$('#studio-notes-editor').hidden){const reading=$('#studio-reading'),top=active.offsetTop;if(top<reading.scrollTop+60||top+active.offsetHeight>reading.scrollTop+reading.clientHeight)reading.scrollTop=Math.max(0,top-reading.clientHeight/3);}
    const chord=$('#studio-chord-now');if(chord){const events=parseTimedText(track.chords||'');const currentChord=events.filter(c=>c.time<=current).at(-1),name=currentChord?transposeChord(currentChord.text,engine.semitones):'—';if(chord.dataset.chord!==name){chord.dataset.chord=name;chord.innerHTML=`${guitarDiagram(name)}<span>${escape(name)}</span>`;}}
  }
  function renderSections(){
    $('#studio-sections-list').innerHTML=(track.sections||[]).map((section,i)=>`<div class="studio-section-row">${button('section-seek',`<span>${escape(section.name)}</span><small>${time(section.time)}</small>`,null,`data-index="${i}"`)}${button('section-remove','','close',`data-index="${i}" aria-label="Excluir seção ${escape(section.name)}"`)}</div>`).join('')||'<p class="studio-empty-sections">Nenhuma seção marcada.</p>';
  }
  async function exportAudio(action,index){
    if(exporting)return;if(!loaded||!engine.buffers.some(Boolean))return notify('Aguarde o carregamento do áudio.');exporting=true;$('#studio-export-status').textContent='Preparando exportação...';$$('[data-studio^="export-"]').forEach(b=>b.disabled=true);
    const format=exportFormat;
    const encode=async buffer=>{const wav=encodeWav(buffer);if(format==='wav')return wav;const response=await fetch(`/api/audio-export?format=${format}`,{method:'POST',headers:{'Content-Type':'audio/wav'},body:wav});if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.error||'Conversor indisponível. Reinicie o servidor.');}return response.blob();};
    try{
      if(action==='export-channel'){if(!engine.buffers[index])throw Error('Esta faixa não foi carregada.');const blob=await encode(engine.buffers[index]);if(!disposed)downloadBlob(blob,`${track.name}-${track.files[index].name}.${format}`);}
      else if(action==='export-all'){const selected=exportFiles(track);if(selected.some(({index})=>!engine.buffers[index]))throw Error('Há faixas com erro. Reabra o projeto antes de exportar todas.');const files=[];for(const {file,index} of selected){files.push({name:`${index+1}-${file.name.replace(/[<>:"/\\|?*]/g,'_')}.${format}`,blob:await encode(engine.buffers[index])});await new Promise(r=>setTimeout(r,0));}if(disposed)return;downloadBlob(await zipFiles(files),`${track.name}-faixas.zip`);}
      else{
        if(failed.size)throw Error('Há faixas com erro. Reabra o projeto antes de exportar o mix.');
        const length=Math.ceil(engine.duration/engine.rate*44100),offline=new OfflineAudioContext(2,length,44100),master=offline.createGain();master.gain.value=settings.master;
        if(pitchReady&&(engine.rate!==1||engine.semitones!==0||engine.tuning!==440)){await offline.audioWorklet.addModule('/studio-pitch.js');const pitch=new AudioWorkletNode(offline,'studio-pitch',{outputChannelCount:[2]});pitch.parameters.get('factor').value=2**(engine.semitones/12)*(engine.tuning/440)/engine.rate;master.connect(pitch);pitch.connect(offline.destination);}else master.connect(offline.destination);
        const solo=settings.channels.some(c=>c.solo);engine.buffers.forEach((buffer,i)=>{const c=settings.channels[i];if(solo?!c.solo:c.muted)return;const source=offline.createBufferSource(),gain=offline.createGain(),pan=offline.createStereoPanner();source.buffer=buffer;source.playbackRate.value=engine.rate;gain.gain.value=c.volume;pan.pan.value=c.pan;source.connect(gain);gain.connect(pan);pan.connect(master);source.start(0);});
        const rendered=await offline.startRendering();if(disposed)return;const blob=await encode(rendered);if(!disposed)downloadBlob(blob,`${track.name}-mix.${format}`);
      }
      if(!disposed)$('#studio-export-status').textContent='Arquivo pronto. Download iniciado.';
    }catch(error){if(!disposed)$('#studio-export-status').textContent=`Não foi possível exportar: ${error.message}`;}finally{exporting=false;if(!disposed)$$('[data-studio^="export-"]').forEach(b=>b.disabled=false);}
  }
  async function click(event){
    const b=event.target.closest('[data-studio]');if(b){const action=b.dataset.studio,index=Number(b.dataset.index);
      if(action==='panel')panel(b.dataset.panel);
      else if(action==='format'){exportFormat=b.dataset.format;$$('[data-studio="format"]').forEach(el=>{el.classList.toggle('selected',el===b);el.setAttribute('aria-pressed',String(el===b));});}
      else if(action==='play'){if(engine.playing)engine.pause();else try{await engine.play(prefs.countEnabled?(prefs.count||4):0);}catch{if(!disposed)notify('Não foi possível iniciar a reprodução.');}if(!disposed)transport();}
      else if(action==='rewind'||action==='forward'){engine.seek(engine.time+(action==='rewind'?-10:10));position(true);}
      else if(action==='mute'||action==='solo'){const key=action==='mute'?'muted':'solo';settings.channels[index][key]=!settings.channels[index][key];mix();}
      else if(action==='mark-start'){start=engine.time;if(end!==null&&end<=start)end=null;loop=false;applyLoop();loopView();}
      else if(action==='mark-end'){if(start===null||engine.time<=start)return notify('Marque o início e avance até o fim do trecho.');end=engine.time;applyLoop();loopView();}
      else if(action==='loop'){if(start===null||end===null)return notify('Marque o início A e o fim B do trecho.');loop=!loop;applyLoop();loopView();}
      else if(action==='clear-loop'){start=null;end=null;loop=false;applyLoop();loopView();}
      else if(action==='add')$('#studio-stem-input').click();
      else if(action==='import-notes')$('#studio-notes-input').click();
      else if(action==='reset'){const defaults=mixerSettings({...track,mix:null});settings.master=defaults.master;settings.channels=defaults.channels;$$('.studio-volume').forEach(el=>{el.value=1;el.nextElementSibling.textContent='100%';});$$('.studio-pan-input').forEach(el=>el.value=0);$('#studio-master').value=settings.master;$('#studio-master-value').textContent='80%';mix();}
      else if(action==='metronome'){engine.metronome.enabled=!engine.metronome.enabled;b.classList.toggle('on',!engine.metronome.enabled);b.setAttribute('aria-pressed',String(!engine.metronome.enabled));b.setAttribute('aria-label',engine.metronome.enabled?'Silenciar metrônomo':'Ativar metrônomo');}
      else if(action==='step'){const el=$(`#${b.dataset.field}`);el.value=Math.max(Number(el.min),Math.min(Number(el.max),Number(el.value)+Number(b.dataset.step)));input({target:el});}
      else if(action==='tempo-reset'){engine.setRate(1);$('#studio-speed').value=1;$('#studio-bpm').value=engine.bpm;$('#studio-speed-value').textContent='1.00×';$('#studio-bpm-label').textContent=engine.bpm;}
      else if(action==='pitch-reset'){$('#studio-pitch').value=0;$('#studio-tuning').value=440;input({target:$('#studio-pitch')});}
      else if(action==='lyrics'||action==='chords'){if(action==='lyrics')showLyrics=!showLyrics;else showChords=!showChords;renderNotes();}
      else if(action==='sections'){const el=$('#studio-sections');el.hidden=!el.hidden;b.setAttribute('aria-pressed',String(!el.hidden));drawWaves();}
      else if(action==='edit-notes'){$('#studio-notes-editor').hidden=!$('#studio-notes-editor').hidden;if(!$('#studio-notes-editor').hidden)$('#studio-lyrics').focus();else renderNotes();}
      else if(action==='download-notes')downloadBlob(new Blob([track.lyrics||'','\n\n',track.chords||''],{type:'text/plain;charset=utf-8'}),`${track.name}-letra-acordes.txt`);
      else if(action==='note-seek'){if(b.dataset.time!==''){engine.seek(Number(b.dataset.time));position(true);}}
      else if(action==='section-seek'){engine.seek(track.sections[index].time);position(true);}
      else if(action==='section-remove'){track.sections.splice(index,1);persist();renderSections();}
      else if(action.startsWith('export-'))await exportAudio(action,index);
      else onAction(action,index);return;
    }
    if(event.target.closest('#separate-track'))return onAction('separate');if(event.target.closest('#check-separation'))return onAction('check-engine');
    const wave=event.target.closest('.studio-wave');if(wave){const rect=wave.getBoundingClientRect();engine.seek((event.clientX-rect.left)/rect.width*engine.duration);position(true);}
    if(!event.target.closest('.studio-popover')){$$('.studio-popover').forEach(p=>p.hidden=true);$$('[data-studio="panel"]').forEach(b=>b.setAttribute('aria-expanded','false'));activePanel=null;}
  }
  function input(event){
    const el=event.target,index=Number(el.dataset.index),n=Number(el.value);
    if(el.matches('.studio-volume')){settings.channels[index].volume=n;el.nextElementSibling.textContent=`${Math.round(n*100)}%`;mix();}
    else if(el.matches('.studio-pan-input')){settings.channels[index].pan=n;mix();}
    else if(el.id==='studio-master'){settings.master=n;$('#studio-master-value').textContent=`${Math.round(n*100)}%`;mix();}
    else if(el.id==='studio-speed'||el.id==='studio-bpm'){const rate=Math.max(.5,Math.min(2,el.id==='studio-speed'?n:n/engine.bpm));engine.setRate(rate);$('#studio-speed').value=rate;$('#studio-speed-value').textContent=`${rate.toFixed(2)}×`;$('#studio-bpm').value=Math.round(engine.bpm*rate);$('#studio-bpm-label').textContent=Math.round(engine.bpm*rate);}
    else if(el.id==='studio-base-bpm'){if(n<30||n>300)return;prefs.bpm=n;engine.bpm=n;$('#studio-bpm').value=Math.round(n*engine.rate);$('#studio-bpm-label').textContent=Math.round(n*engine.rate);engine.nextBeat=Math.ceil(engine.time/(60/n));persist();}
    else if(el.id==='studio-pitch'||el.id==='studio-tuning'||el.id==='studio-key'){
      if(el.id==='studio-key'){prefs.key=el.value;persist();}
      const semitones=Math.max(-12,Math.min(12,Number($('#studio-pitch').value))),tuning=Math.max(400,Math.min(480,Number($('#studio-tuning').value)||440));
      if(pitchReady)engine.setPitch(semitones,tuning);$('#studio-pitch-label').textContent=`${engine.semitones>0?'+':''}${engine.semitones} semitons`;$('#studio-key-label').textContent=prefs.key?transposeChord(prefs.key,engine.semitones):engine.semitones?`${engine.semitones>0?'+':''}${engine.semitones}`:'Tom';if(showChords)renderNotes();
    }
    else if(el.id==='studio-count'||el.id==='studio-count-enabled'){prefs.count=Math.max(1,Math.min(16,Number($('#studio-count').value)));prefs.countEnabled=$('#studio-count-enabled').checked;persist();}
    else if(el.id==='studio-repeat'){prefs.repeat=el.checked;applyLoop();persist();}
    else if(el.id==='studio-show-original'){$('.studio-page').classList.toggle('show-original',el.checked);drawWaves();}
    else if(el.id==='studio-metronome-volume'){engine.metronome.volume=n;el.nextElementSibling.textContent=`${Math.round(n*100)}%`;}
    else if(el.id==='studio-metronome-pan'){engine.metronome.pan=n;el.parentElement.querySelector('.studio-pan-knob').style.setProperty('--pan-angle',`${n*135}deg`);}
    else if(el.id==='studio-meter')engine.metronome.beats=n;
    else if(el.id==='studio-seek'){engine.seek(n);position(true);}
    else if(el.id==='studio-zoom'){zoom=n;$('#studio-zoom-value').textContent=`${zoom}×`;drawWaves();}
    else if(el.id==='studio-lyrics'||el.id==='studio-chords'){track[el.id==='studio-lyrics'?'lyrics':'chords']=el.value;persist();}
    if(el.type==='range')el.style.setProperty('--range-fill',`${(n-el.min)/(el.max-el.min)*100}%`);
  }
  function keydown(event){
    if(event.key==='Escape'){if(activePanel){const name=activePanel;panel(name);$(`[data-panel="${name}"]`)?.focus();}else $$('.studio-popover').forEach(p=>p.hidden=true);}
    if(event.target.closest('.studio-wave')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();engine.seek(event.key==='Home'?0:event.key==='End'?engine.duration:engine.time+(event.key==='ArrowLeft'?-5:5));position(true);}
    if(event.code==='Space'&&!['INPUT','TEXTAREA','BUTTON','SUMMARY','SELECT'].includes(event.target.tagName)){event.preventDefault();$('#studio-play').click();}
  }
  async function change(event){if(event.target.id==='studio-stem-input'&&event.target.files[0])onAction('add-file',event.target.files[0]);if(event.target.id==='studio-notes-input'&&event.target.files[0]){try{const text=await event.target.files[0].text();if(disposed)return;track.lyrics=text;$('#studio-lyrics').value=text;persist();renderNotes();}catch{notify('Não foi possível ler a letra.');}}}
  function submit(event){if(event.target.id!=='studio-section-form')return;event.preventDefault();const name=$('#studio-section-name').value.trim();if(!name)return;track.sections=[...(track.sections||[]),{name,time:engine.time}].sort((a,b)=>a.time-b.time);$('#studio-section-name').value='';renderSections();persist();}
  root.addEventListener('click',click);root.addEventListener('input',input);root.addEventListener('change',change);root.addEventListener('keydown',keydown);root.addEventListener('submit',submit);
  const manualScroll=()=>{manualScrollUntil=Date.now()+5000;};$('#studio-reading').addEventListener('wheel',manualScroll,{passive:true});$('#studio-reading').addEventListener('touchmove',manualScroll,{passive:true});
  const observer=new ResizeObserver(drawWaves);observer.observe($('#studio-scroll'));mix(false);renderSections();
  const metronomeTimer=setInterval(()=>{if(!disposed)engine.tickMetronome();},25);
  function frame(){if(disposed)return;if(engine.playing&&!engine.loop&&engine.time>=engine.duration){engine.pause();transport();}position();$('#studio-beat-indicator').classList.toggle('beat-on',engine.playing&&engine.metronome.enabled&&(engine.time%(60/engine.bpm))<.07);animation=requestAnimationFrame(frame);}animation=requestAnimationFrame(frame);
  async function load(){
    fetch('/api/audio-export/status').then(async response=>{if(!response.ok)throw Error();return response.json();}).then(status=>{if(disposed)return;$$('[data-studio="format"]').forEach(b=>b.disabled=b.dataset.format!=='wav'&&!status.available);$('#studio-codec-status').textContent=status.available?'MP3, M4A e WAV disponíveis.':status.message;}).catch(()=>{if(!disposed)$('#studio-codec-status').textContent='Reinicie npm run dev para habilitar MP3/M4A. WAV já está disponível.';});
    try{pitchReady=await engine.enablePitch();}catch{pitchReady=false;}if(disposed)return;
    $('#studio-pitch-status').textContent=pitchReady?'Ajuste local de tom. Pode alterar os transientes do áudio.':'Ajuste de tom indisponível neste navegador. A velocidade também altera a afinação.';
    if(!pitchReady){$('#studio-pitch').disabled=true;$('#studio-tuning').disabled=true;$$('[data-field="studio-pitch"]').forEach(b=>b.disabled=true);}
    for(const {file,index} of orderedFiles(track)){
      if(disposed)return;try{const buffer=await context.decodeAudioData(await file.blob.arrayBuffer());if(disposed)return;engine.addBuffer(index,buffer);peaks.set(index,waveformPeaks(buffer,16384));$(`.studio-wave[data-index="${index}"] .studio-wave-label`).hidden=true;}catch{if(disposed)return;failed.add(index);const wave=$(`.studio-wave[data-index="${index}"]`);wave.classList.add('wave-error');wave.querySelector('.studio-wave-label').textContent='Não foi possível ler este áudio';}
      $('#studio-status').textContent=`Carregando faixas: ${peaks.size+failed.size} de ${track.files.length}`;$('#studio-duration').textContent=time(engine.duration);$('#studio-seek').max=engine.duration;drawWaves();await new Promise(r=>setTimeout(r,0));
    }
    if(disposed)return;loaded=true;$('#studio-play').disabled=peaks.size===0;$('#studio-status').textContent=failed.size?`${peaks.size} faixas prontas · ${failed.size} com erro`:`${peaks.size} faixas · salvas neste navegador`;if(prefs.repeat)applyLoop();if(engine.duration&&track.duration!==engine.duration){track.duration=engine.duration;persist();}
  }
  load().catch(()=>{if(!disposed)notify('Não foi possível preparar as faixas. Reabra o projeto.');});
  return {destroy({save=true}={}){disposed=true;cancelAnimationFrame(animation);clearInterval(metronomeTimer);observer.disconnect();clearTimeout(saveTimer);if(save&&saveTimer){track.mix=settings;track.studio=prefs;onSave(track).catch(()=>notify('Não foi possível salvar a mixagem.'));}root.removeEventListener('click',click);root.removeEventListener('input',input);root.removeEventListener('change',change);root.removeEventListener('keydown',keydown);root.removeEventListener('submit',submit);$('#studio-reading').removeEventListener('wheel',manualScroll);$('#studio-reading').removeEventListener('touchmove',manualScroll);engine.destroy();}};
}
