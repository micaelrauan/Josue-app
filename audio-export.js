import { spawn } from 'node:child_process';
import { readdir, mkdir, writeFile, readFile, unlink, rmdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function createAudioExportService({launch=spawn,ffmpegPath,root=resolve('.data/exports'),venvRoot=resolve('.venv')}={}){
  let busy=false;
  const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(body));};
  async function executable(){
    if(ffmpegPath)return ffmpegPath;
    const candidates = process.platform === 'win32'
      ? [join(venvRoot, 'Lib', 'site-packages', 'imageio_ffmpeg', 'binaries')]
      : (await readdir(join(venvRoot, 'lib')).catch(() => [])).filter(n => n.startsWith('python')).map(n => join(venvRoot, 'lib', n, 'site-packages', 'imageio_ffmpeg', 'binaries'));
    for (const directory of candidates) {
      const names = await readdir(directory).catch(() => []);
      const name = names.find(n => /^ffmpeg/i.test(n) && (process.platform !== 'win32' || n.endsWith('.exe')));
      if (name) return join(directory, name);
    }
    return null;
  }
  function run(path,args,timeout){
    return new Promise((resolveResult,reject)=>{
      let child;try{child=launch(path,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});}catch(error){reject(error);return;}
      let diagnostic='',settled=false;
      const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolveResult();};
      const timer=setTimeout(()=>{child.kill();finish(Error('O conversor excedeu o tempo limite.'));},timeout);
      child.stderr?.on('data',chunk=>diagnostic=(diagnostic+chunk).slice(-1500));
      child.on('error',error=>finish(error));child.on('close',code=>finish(code===0?null:Error(diagnostic||'O conversor falhou.')));
    });
  }
  return async(req,res,url)=>{
    if(!url.pathname.startsWith('/api/audio-export'))return false;
    try{
      const ffmpeg=await executable();
      if(req.method==='GET'&&url.pathname==='/api/audio-export/status'){
        if(!ffmpeg){json(res,200,{available:false,message:'Instale o motor local para habilitar MP3 e M4A.'});return true;}
        try{await run(ffmpeg,['-version'],10000);json(res,200,{available:true});}catch{json(res,200,{available:false,message:'O servidor não conseguiu iniciar o FFmpeg. Reinicie npm run dev no seu terminal.'});}return true;
      }
      if(req.method!=='POST'||url.pathname!=='/api/audio-export'){json(res,404,{error:'Rota não encontrada.'});return true;}
      if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){json(res,403,{error:'Origem não permitida.'});return true;}
      const format=url.searchParams.get('format');if(!['mp3','m4a'].includes(format)){json(res,400,{error:'Formato inválido.'});return true;}
      if(!ffmpeg){json(res,503,{error:'FFmpeg não instalado.'});return true;}
      if(busy){json(res,409,{error:'Aguarde a exportação em andamento.'});return true;}
      busy=true;const folder=join(root,randomUUID()),input=join(folder,'input.wav'),output=join(folder,`output.${format}`);
      let encoded;
      try{
        const chunks=[];let size=0;
        for await(const chunk of req){size+=chunk.length;if(size>450*1024*1024){json(res,413,{error:'O limite para conversão é 450 MB.'});return true;}chunks.push(chunk);}
        const wav=Buffer.concat(chunks);if(wav.length<44||wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE'){json(res,400,{error:'Envie áudio WAV válido.'});return true;}
        await mkdir(folder,{recursive:true});await writeFile(input,wav);
        const codec=format==='mp3'?['-c:a','libmp3lame','-b:a','192k']:['-c:a','aac','-b:a','192k','-movflags','+faststart'];
        await run(ffmpeg,['-nostdin','-hide_banner','-loglevel','error','-y','-i',input,'-vn',...codec,output],180000);
        encoded=await readFile(output);
      }finally{
        // Only these two known files in the UUID directory are removed, never recursive deletion.
        busy=false;await unlink(input).catch(()=>{});await unlink(output).catch(()=>{});await rmdir(folder).catch(()=>{});
      }
      res.writeHead(200,{'Content-Type':format==='mp3'?'audio/mpeg':'audio/mp4','Cache-Control':'no-store'}).end(encoded);
    }catch{if(!res.headersSent)json(res,500,{error:'Não foi possível converter o áudio. Reinicie o servidor no seu terminal ou exporte em WAV.'});else res.end();}
    return true;
  };
}
