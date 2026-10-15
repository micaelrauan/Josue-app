export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const timeLabel = value => `${Math.floor(Math.max(0,value || 0)/60)}:${String(Math.floor(Math.max(0,value || 0)%60)).padStart(2,'0')}`;
export function parseTimedText(text) {
  const rows=[];
  for(const line of text.split(/\r?\n/)) {
    const stamps=[...line.matchAll(/\[(\d+):(\d{2}(?:\.\d+)?)\]/g)];
    const content=line.replace(/\[\d+:\d{2}(?:\.\d+)?\]/g,'').trim();
    for(const match of stamps) if(Number(match[2])<60) rows.push({time:Number(match[1])*60+Number(match[2]),text:content});
  }
  return rows.sort((a,b)=>a.time-b.time);
}
export function transposeChord(chord, semitones) {
  const notes=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const flats={Db:'C#',Eb:'D#',Gb:'F#',Ab:'G#',Bb:'A#'};
  return chord.replace(/(^|\/)([A-G][#b]?)/g,(_,prefix,note)=>prefix+notes[(notes.indexOf(flats[note]||note)+semitones%12+12)%12]);
}
export function guitarDiagram(chord){
  const open={C:[-1,3,2,0,1,0],Cm:[-1,3,5,5,4,3],D:[-1,-1,0,2,3,2],Dm:[-1,-1,0,2,3,1],E:[0,2,2,1,0,0],Em:[0,2,2,0,0,0],F:[1,3,3,2,1,1],G:[3,2,0,0,0,3],A:[-1,0,2,2,2,0],Am:[-1,0,2,2,1,0],B:[-1,2,4,4,4,2],Bm:[-1,2,4,4,3,2]};
  const match=chord.trim().match(/^([A-G][#b]?)(m|maj7|m7|7|sus4)?$/);
  if(!match)return '';
  const root=transposeChord(match[1],0),suffix=match[2]||'',notes=['E','F','F#','G','G#','A','A#','B','C','C#','D','D#'];
  const shapes={'':[0,2,2,1,0,0],m:[0,2,2,0,0,0],7:[0,2,0,1,0,0],m7:[0,2,0,0,0,0],maj7:[0,2,1,1,0,0],sus4:[0,2,2,2,0,0]};
  const fret=notes.indexOf(root),positions=open[root+suffix]||shapes[suffix].map(n=>n+fret),positive=positions.filter(n=>n>0),base=Math.max(...positive)>4?Math.min(...positive):1;
  return `<svg class="studio-guitar-diagram" viewBox="0 0 180 190" role="img" aria-label="Diagrama de ${escapeHtml(chord)}"><title>${escapeHtml(chord)}</title>${Array.from({length:6},(_,i)=>`<path d="M${30+i*24} 28v120" stroke="#777"/>`).join('')}${Array.from({length:6},(_,i)=>`<path d="M30 ${28+i*24}h120" stroke="#999" stroke-width="${i===0&&base===1?4:1}"/>`).join('')}${positions.map((n,i)=>n>0?`<circle cx="${30+i*24}" cy="${40+(n-base)*24}" r="8" fill="#eee"/>`:`<text x="${30+i*24}" y="18" text-anchor="middle" fill="#bbb" font-size="13">${n===0?'○':'×'}</text>`).join('')}${base>1?`<text x="8" y="45" fill="#aaa" font-size="12">${base}</text>`:''}${['E','A','D','G','B','E'].map((n,i)=>`<text x="${30+i*24}" y="175" text-anchor="middle" fill="#aaa" font-size="11">${n}</text>`).join('')}</svg>`;
}
export function encodeWav(buffer) {
  const channels=buffer.numberOfChannels, length=buffer.length;
  const data=new ArrayBuffer(44+length*channels*2), view=new DataView(data);
  const str=(offset,text)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};
  str(0,'RIFF');view.setUint32(4,data.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*channels*2,true);view.setUint16(32,channels*2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,length*channels*2,true);
  const samples=Array.from({length:channels},(_,i)=>buffer.getChannelData(i));let offset=44;
  for(let i=0;i<length;i++)for(const channel of samples){const sample=Math.max(-1,Math.min(1,channel[i]));view.setInt16(offset,Math.round(sample*(sample<0?32768:32767)),true);offset+=2;}
  return new Blob([data],{type:'audio/wav'});
}
// ZIP store mode: a single download for all stems, with no library dependency.
export async function zipFiles(files) {
  const chunks=[],directory=[];let offset=0,centralSize=0;
  const crc32=bytes=>{let crc=-1;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^-1)>>>0;};
  for(const file of files){
    const name=new TextEncoder().encode(file.name),bytes=new Uint8Array(await file.blob.arrayBuffer()),crc=crc32(bytes);
    const header=new Uint8Array(30+name.length),h=new DataView(header.buffer);
    h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint32(14,crc,true);h.setUint32(18,bytes.length,true);h.setUint32(22,bytes.length,true);h.setUint16(26,name.length,true);header.set(name,30);
    const entry=new Uint8Array(46+name.length),d=new DataView(entry.buffer);
    d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint32(16,crc,true);d.setUint32(20,bytes.length,true);d.setUint32(24,bytes.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);entry.set(name,46);
    chunks.push(header,bytes);directory.push(entry);offset+=header.length+bytes.length;centralSize+=entry.length;
  }
  const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);
  return new Blob([...chunks,...directory,end],{type:'application/zip'});
}
export function downloadBlob(blob,name) {
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name.replace(/[<>:"/\\|?*]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
