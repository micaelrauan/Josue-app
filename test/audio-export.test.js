import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, readFile, writeFile, readdir, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAudioExportService } from '../audio-export.js';
import { createSeparationService } from '../separation.js';
import { encodeWav } from '../public/studio-utils.js';

async function withServer(handler,run){const server=createServer(async(req,res)=>{if(!await handler(req,res,new URL(req.url,'http://localhost')))res.writeHead(404).end();});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await run(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(r=>server.close(r));}}
test('conversion API validates requests, selects codecs and cleans temporary files (mock encoder)',async()=>{
  const root=await mkdtemp(join(tmpdir(),'studio-export-')),calls=[];
  const launch=(path,args)=>{const child=new EventEmitter();child.stderr=new PassThrough();child.kill=()=>{};calls.push(args);setTimeout(async()=>{try{if(!args.includes('-version')){const input=await readFile(args[args.indexOf('-i')+1]);assert.equal(input.toString('ascii',0,4),'RIFF');await writeFile(args.at(-1),'encoded fixture');}child.emit('close',0);}catch(error){child.emit('error',error);}},5);return child;};
  try{await withServer(createAudioExportService({launch,ffmpegPath:'mock-ffmpeg',root}),async base=>{
    assert.equal((await (await fetch(base+'/api/audio-export/status')).json()).available,true);
    const wav=encodeWav({length:20,numberOfChannels:1,sampleRate:44100,getChannelData:()=>new Float32Array(20)});
    assert.equal((await fetch(base+'/api/audio-export?format=exe',{method:'POST',body:wav})).status,400);
    assert.equal((await fetch(base+'/api/audio-export?format=mp3',{method:'POST',body:wav,headers:{origin:'https://other.test'}})).status,403);
    assert.equal((await fetch(base+'/api/audio-export?format=mp3',{method:'POST',body:'invalid'})).status,400);
    for(const format of ['mp3','m4a']){const response=await fetch(base+'/api/audio-export?format='+format,{method:'POST',body:wav});assert.equal(response.status,200);assert.equal(await response.text(),'encoded fixture');}
    assert.ok(calls.some(args=>args.includes('libmp3lame')));assert.ok(calls.some(args=>args.includes('aac')));
  });assert.deepEqual(await readdir(root),[]);}finally{await rmdir(root);}
});
test('synchronous process denial becomes an unavailable engine rather than a server 500',async()=>{
  const launch=()=>{throw Object.assign(Error('denied'),{code:'EPERM'});};
  await withServer(createAudioExportService({launch,ffmpegPath:'mock'}),async base=>{const response=await fetch(base+'/api/audio-export/status');assert.equal(response.status,200);assert.equal((await response.json()).available,false);});
  await withServer(createSeparationService({launch,python:process.execPath}),async base=>{const response=await fetch(base+'/api/separations/status');assert.equal(response.status,200);assert.equal((await response.json()).available,false);});
});
