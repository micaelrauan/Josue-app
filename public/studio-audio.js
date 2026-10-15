export function waveformPeaks(buffer, bins = 4096) {
  const count = Math.min(bins, buffer.length);
  const result = new Float32Array(count);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * buffer.length / count), end = Math.floor((i + 1) * buffer.length / count);
    let peak = 0;
    for (const channel of channels) for (let j = start; j < end; j++) peak = Math.max(peak, Math.abs(channel[j]));
    result[i] = peak;
  }
  return result;
}

// Every source uses one AudioContext clock, one start time and one seek offset.
export class StudioAudio {
  constructor(context, settings) {
    this.context = context;
    this.settings = settings;
    this.buffers = [];
    this.channels = [];
    this.sources = [];
    this.master = context.createGain();
    this.master.connect(context.destination);
    this.master.gain.value = settings.master ?? 0.8;
    this.position = 0;
    this.duration = 0;
    this.rate = 1;
    this.playing = false;
    this.loop = null;
    this.disposed = false;
    this.generation = 0;
    this.semitones = 0;
    this.tuning = 440;
    this.bpm = 120;
    this.metronome = { enabled: false, volume: .6, pan: 0, beats: 4 };
    this.clicks = new Set();
    this.nextBeat = 0;
  }
  async enablePitch() {
    if(!this.context.audioWorklet) return false;
    await this.context.audioWorklet.addModule('/studio-pitch.js');
    if(this.disposed)return false;
    this.pitch = new AudioWorkletNode(this.context,'studio-pitch',{outputChannelCount:[2]});
    this.master.disconnect();this.master.connect(this.pitch);this.pitch.connect(this.context.destination);this.updatePitch();return true;
  }
  updatePitch(){this.pitch?.parameters.get('factor').setValueAtTime(2**(this.semitones/12)*(this.tuning/440)/this.rate,this.context.currentTime);}
  setPitch(semitones,tuning=440){this.semitones=semitones;this.tuning=tuning;this.updatePitch();}
  addBuffer(index, buffer) {
    this.buffers[index] = buffer;
    this.duration = Math.max(this.duration, buffer.duration);
    const gain = this.context.createGain(), pan = this.context.createStereoPanner();
    gain.connect(pan); pan.connect(this.master);
    this.channels[index] = { gain, pan };
    this.updateMix();
  }
  get time() {
    let position = this.position + (this.playing ? Math.max(0, this.context.currentTime - this.startedAt) * this.rate : 0);
    if (this.loop && position >= this.loop.end) position = this.loop.start + (position - this.loop.start) % (this.loop.end - this.loop.start);
    return Math.min(this.duration, position);
  }
  updateMix() {
    const solo = this.settings.channels.some(channel => channel.solo);
    this.channels.forEach((nodes, i) => {
      const channel = this.settings.channels[i];
      const audible = solo ? channel.solo : !channel.muted;
      nodes.gain.gain.setTargetAtTime(audible ? channel.volume : 0, this.context.currentTime, 0.015);
      nodes.pan.pan.setTargetAtTime(channel.pan, this.context.currentTime, 0.015);
    });
    this.master.gain.setTargetAtTime(this.settings.master, this.context.currentTime, 0.015);
  }
  async play(countIn = 0) {
    if (this.playing || this.disposed || !this.duration) return;
    const generation = this.generation;
    await this.context.resume();
    if (this.disposed || this.playing || generation !== this.generation) return;
    if (this.position >= this.duration) this.position = 0;
    if (this.loop && (this.position < this.loop.start || this.position >= this.loop.end)) this.position = this.loop.start;
    this.start(countIn);
  }
  start(countIn = 0) {
    const beatDuration=60/this.bpm/this.rate;
    this.startedAt = this.context.currentTime + 0.03 + countIn*beatDuration;
    for(let i=0;i<countIn;i++)this.clickAt(this.context.currentTime+.03+i*beatDuration,i===0,true);
    this.nextBeat=Math.ceil(this.position/(60/this.bpm)-.0001);
    this.sources = this.buffers.map((buffer, index) => {
      if (!buffer || this.position >= buffer.duration) return null;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = this.rate;
      source.connect(this.channels[index].gain);
      if (this.loop) { source.loop = true; source.loopStart = this.loop.start; source.loopEnd = this.loop.end; }
      source.start(this.startedAt, this.position);
      return source;
    });
    this.playing = true;
  }
  pause() {
    this.position = this.time;
    this.playing = false;
    this.generation++;
    this.sources.forEach(source => { if (source) { try { source.stop(); } catch {} source.disconnect(); } });
    this.sources = [];
    for(const oscillator of this.clicks){try{oscillator.stop();}catch{}}
    this.clicks.clear();
  }
  seek(time) {
    const wasPlaying = this.playing;
    this.pause(); this.position = Math.max(0, Math.min(this.duration, time));
    if (this.loop && this.position >= this.loop.end) this.position = this.loop.start;
    if (wasPlaying) this.start();
  }
  setRate(rate) {
    const wasPlaying = this.playing;
    this.pause(); this.rate = rate;
    this.updatePitch();
    if (wasPlaying) this.start();
  }
  setLoop(start, end) {
    const wasPlaying = this.playing;
    this.pause();
    this.loop = Number.isFinite(start) && Number.isFinite(end) && end > start ? { start: Math.max(0,start), end: Math.min(this.duration,end) } : null;
    if (this.loop && (this.position < this.loop.start || this.position >= this.loop.end)) this.position = this.loop.start;
    if (wasPlaying) this.start();
  }
  destroy() {
    this.pause(); this.disposed = true;
    this.channels.forEach(({ gain, pan }) => { gain.disconnect(); pan.disconnect(); });
    this.master.disconnect(); this.pitch?.disconnect(); this.buffers = []; this.channels = [];
    this.context.close().catch(() => {});
  }
  clickAt(when,accent=false,force=false){
    if(!force&&!this.metronome.enabled)return;
    const oscillator=this.context.createOscillator(),gain=this.context.createGain(),pan=this.context.createStereoPanner();
    oscillator.frequency.value=accent?1200:850;gain.gain.setValueAtTime(Math.max(.0001,this.metronome.volume)*.25,when);gain.gain.exponentialRampToValueAtTime(.0001,when+.045);pan.pan.value=this.metronome.pan;
    oscillator.connect(gain);gain.connect(pan);pan.connect(this.context.destination);oscillator.start(when);oscillator.stop(when+.05);this.clicks.add(oscillator);
    oscillator.onended=()=>{this.clicks.delete(oscillator);oscillator.disconnect();gain.disconnect();pan.disconnect();};
  }
  tickMetronome(){
    if(!this.playing||this.context.currentTime<this.startedAt)return;
    const beatDuration=60/this.bpm,current=this.time,beat=Math.floor(current/beatDuration);
    if(this.lastMetronomeTime!==undefined&&current<this.lastMetronomeTime)this.nextBeat=Math.ceil(current/beatDuration);
    this.lastMetronomeTime=current;
    if(this.nextBeat<beat)this.nextBeat=beat;
    const at=this.nextBeat*beatDuration;
    if(at<Math.min(this.duration,current+.12*this.rate)){
      this.clickAt(this.context.currentTime+Math.max(.003,(at-current)/this.rate),this.nextBeat%this.metronome.beats===0);this.nextBeat++;
    }
  }
}
