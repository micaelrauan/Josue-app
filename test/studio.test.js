import test from 'node:test';
import assert from 'node:assert/strict';
import { StudioAudio, waveformPeaks } from '../public/studio-audio.js';
import { mixerSettings, studioMarkup } from '../public/studio.js';
import { exportFiles } from '../public/studio-view.js';
import { parseTimedText, transposeChord, guitarDiagram, encodeWav, zipFiles } from '../public/studio-utils.js';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

class Parameter {
  constructor(){this.value=0;}
  setTargetAtTime(value){this.value=value;}
  setValueAtTime(value){this.value=value;}
  exponentialRampToValueAtTime(value){this.value=value;}
}
class Node {
  connect(){}
  disconnect(){}
}
class FakeContext {
  constructor(){this.currentTime=10;this.destination={};this.scheduled=[];}
  createGain(){return Object.assign(new Node(),{gain:new Parameter()});}
  createStereoPanner(){return Object.assign(new Node(),{pan:new Parameter()});}
  createOscillator(){const context=this;return Object.assign(new Node(),{frequency:new Parameter(),start(when){(context.clicks??=[]).push({when,source:this});},stop(){this.stopped=true;}});}
  createBufferSource(){
    const context=this;
    return Object.assign(new Node(),{playbackRate:new Parameter(),start(when,offset){context.scheduled.push({when,offset,source:this});},stop(){this.stopped=true;}});
  }
  async resume(){}
  async close(){}
}
function fixture(){
  const context=new FakeContext();
  const settings={master:.8,channels:Array.from({length:4},()=>({volume:1,muted:false,solo:false,pan:0}))};
  const engine=new StudioAudio(context,settings);
  for(let i=0;i<4;i++)engine.addBuffer(i,{duration:120});
  return {context,settings,engine};
}

test('waveform uses each buffer and includes negative samples and both stereo channels',()=>{
  const buffer={length:8,numberOfChannels:2,getChannelData:i=>i===0?Float32Array.from([0,0,.2,0,0,0,0,0]):Float32Array.from([0,-.8,0,0,0,.5,0,-.9])};
  const result=waveformPeaks(buffer,4);
  assert.equal(result.length,4);
  [.8,.2,.5,.9].forEach((value,index)=>assert.ok(Math.abs(result[index]-value)<.00001));
  assert.notDeepEqual(result,waveformPeaks({...buffer,getChannelData:()=>new Float32Array(8)},4));
});
test('every source starts and seeks on the same audio clock',async()=>{
  const {engine,context}=fixture();
  await engine.play();
  assert.equal(context.scheduled.length,4);
  assert.equal(new Set(context.scheduled.map(event=>event.when)).size,1);
  assert.ok(context.scheduled.every(event=>event.offset===0));
  context.currentTime=12.03;
  assert.ok(Math.abs(engine.time-2)<.00001);
  const oldSources=[...engine.sources];
  engine.seek(42);
  assert.ok(oldSources.every(source=>source.stopped));
  assert.ok(context.scheduled.slice(-4).every(event=>event.offset===42&&Math.abs(event.when-12.06)<.000001));
  engine.destroy();
});
test('volume, pan, master, mute and solo affect the audio graph independently',()=>{
  const {engine,settings}=fixture();
  settings.channels[0].volume=.35;settings.channels[0].pan=-.4;settings.channels[1].muted=true;settings.master=.6;
  engine.updateMix();
  assert.equal(engine.channels[0].gain.gain.value,.35);
  assert.equal(engine.channels[0].pan.pan.value,-.4);
  assert.equal(engine.channels[1].gain.gain.value,0);
  assert.equal(engine.master.gain.value,.6);
  settings.channels[1].solo=true;engine.updateMix();
  assert.equal(engine.channels[1].gain.gain.value,1);
  assert.equal(engine.channels[0].gain.gain.value,0);
  settings.channels[1].solo=false;engine.updateMix();
  assert.equal(engine.channels[0].gain.gain.value,.35);
  engine.destroy();
});
test('loop and speed preserve the shared timeline through pause and resume',async()=>{
  const {engine,context}=fixture();
  engine.setLoop(2,4);await engine.play();
  assert.ok(engine.sources.every(source=>source.loop&&source.loopStart===2&&source.loopEnd===4));
  context.currentTime=13.03;
  assert.ok(Math.abs(engine.time-3)<.00001);
  engine.setRate(1.5);
  context.currentTime=14.06;
  assert.ok(Math.abs(engine.time-2.5)<.00001);
  engine.pause();const position=engine.time;
  context.currentTime=20;
  assert.equal(engine.time,position);
  await engine.play();
  assert.ok(context.scheduled.slice(-4).every(event=>Math.abs(event.offset-position)<.00001));
  engine.destroy();
});
test('original starts muted after separation and saved mix settings survive reopening',()=>{
  const track={id:'test',name:'Music',files:[{name:'Original'},{name:'Vocais',role:'stem'},{name:'Bateria',role:'stem'}]};
  const defaults=mixerSettings(track);
  assert.equal(defaults.channels[0].muted,true);
  assert.equal(defaults.channels[1].muted,false);
  track.mix={...defaults,master:.45,channels:defaults.channels.map((channel,index)=>({...channel,volume:index===1?.25:1}))};
  assert.equal(mixerSettings(track).channels[1].volume,.25);
  assert.equal(mixerSettings(track).master,.45);
  const markup=studioMarkup({...track,name:'<script>alert(1)</script>'});
  assert.ok(markup.includes('&lt;script&gt;'));
  assert.equal((markup.match(/<canvas /g)||[]).length,3);
  assert.ok(markup.indexOf('data-channel="1"')<markup.indexOf('data-channel="0"'));
});

test('count-in schedules clicks before all sources and pause cancels the countdown',async()=>{
  const {engine,context}=fixture();engine.bpm=120;await engine.play(4);
  assert.equal(context.clicks.length,4);assert.equal(context.scheduled.length,4);
  assert.ok(context.clicks.every((c,i)=>Math.abs(c.when-(10.03+i*.5))<1e-6));
  assert.ok(context.scheduled.every(c=>Math.abs(c.when-12.03)<1e-6));
  context.currentTime=11;assert.equal(engine.time,0);engine.pause();
  assert.ok(context.scheduled.every(c=>c.source.stopped));assert.equal(engine.clicks.size,0);engine.destroy();
});
test('export all includes manually added instruments and excludes only the duplicated original',()=>{
  const track={files:[{name:'Original'},{name:'Vocals',role:'stem'},{name:'Backing imported'}]};
  assert.deepEqual(exportFiles(track).map(({file})=>file.name),['Vocals','Backing imported']);
  assert.equal(exportFiles({files:[{name:'Original'}]}).length,1);
});
test('metronome follows tempo and reschedules from a seek',async()=>{
  const {engine,context}=fixture();engine.metronome.enabled=true;engine.bpm=120;await engine.play();context.currentTime=10.03;engine.tickMetronome();assert.equal(context.clicks.length,1);
  engine.tickMetronome();assert.equal(context.clicks.length,1);
  engine.seek(20);context.currentTime+=.03;engine.tickMetronome();assert.equal(context.clicks.length,2);engine.destroy();
});

test('metronome aligns clicks to the detected beat offset',async()=>{
  const {engine,context}=fixture();engine.metronome.enabled=true;engine.setTempo(100,.2);await engine.play();
  context.currentTime=10.03;engine.tickMetronome();assert.equal(context.clicks?.length||0,0);
  context.currentTime=10.14;engine.tickMetronome();assert.equal(context.clicks.length,1);
  assert.ok(Math.abs(context.clicks[0].when-10.23)<.001);
  engine.destroy();
});
test('LRC timestamps and chord transposition remain aligned, including flat notes and slash bass',()=>{
  assert.deepEqual(parseTimedText('[00:12.50][00:01] Hello\n[00:04] World\n[00:70] bad'),[{time:1,text:'Hello'},{time:4,text:'World'},{time:12.5,text:'Hello'}]);
  assert.equal(transposeChord('Bbmaj7/F',2),'Cmaj7/G');assert.equal(transposeChord('Em',-2),'Dm');
  assert.ok(guitarDiagram('Em').includes('Diagrama de Em'));assert.equal(guitarDiagram('<script>'),'');
});
test('WAV export writes real interleaved PCM16 stereo and clamps clipped samples',async()=>{
  const blob=encodeWav({numberOfChannels:2,length:3,sampleRate:44100,getChannelData:i=>Float32Array.from(i?[1,0,-1]:[-2,.5,2])});
  const bytes=await blob.arrayBuffer(),v=new DataView(bytes);
  assert.equal(new TextDecoder().decode(bytes.slice(0,4)),'RIFF');assert.equal(v.getUint16(22,true),2);assert.equal(v.getUint32(24,true),44100);assert.equal(v.getUint32(40,true),12);
  assert.deepEqual(Array.from({length:6},(_,i)=>v.getInt16(44+i*2,true)),[-32768,32767,16384,0,32767,-32768]);
});
test('ZIP preserves bytes, filenames and central directory for independent stems',async()=>{
  const bytes=new Uint8Array(await (await zipFiles([{name:'vocals.wav',blob:new Blob(['abc'])},{name:'drums.wav',blob:new Blob(['xyz'])}])).arrayBuffer()),v=new DataView(bytes.buffer);
  assert.equal(v.getUint32(0,true),0x04034b50);assert.equal(v.getUint32(14,true),0x352441c2);assert.equal(new TextDecoder().decode(bytes.slice(40,43)),'abc');
  assert.equal(v.getUint32(bytes.length-22,true),0x06054b50);assert.equal(v.getUint16(bytes.length-12,true),2);
  const central=v.getUint32(bytes.length-6,true);assert.equal(v.getUint32(central,true),0x02014b50);
});
test('pitch worklet bypass is exact and one-octave transposition changes measured frequency',async()=>{
  let Processor;const scope={AudioWorkletProcessor:class{},sampleRate:48000,Float32Array,Math,registerProcessor:(_,p)=>Processor=p};
  vm.runInNewContext(await readFile(new URL('../public/studio-pitch.js',import.meta.url),'utf8'),scope);
  const render=factor=>{const p=new Processor(),samples=new Float32Array(48000);for(let offset=0;offset<48000;offset+=128){const n=Math.min(128,48000-offset),input=Float32Array.from({length:n},(_,i)=>Math.sin(2*Math.PI*440*(offset+i)/48000)),out=new Float32Array(n);p.process([[input]],[[out]],{factor:[factor]});samples.set(out,offset);if(factor===1)assert.deepEqual(out,input);}return samples;};
  render(1);const transposed=render(2);let crossings=0;for(let i=12001;i<48000;i++)if(transposed[i-1]<=0&&transposed[i]>0)crossings++;assert.ok(Math.abs(crossings/.75-880)<35,`Measured ${crossings/.75} Hz`);
});
