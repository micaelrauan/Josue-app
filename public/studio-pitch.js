// Two overlapping delay grains transpose a stereo mix without changing its clock.
// This lightweight effect can color transients; it is not Moises' proprietary DSP.
class StudioPitch extends AudioWorkletProcessor {
  static get parameterDescriptors(){return [{name:'factor',defaultValue:1,minValue:.2,maxValue:5,automationRate:'k-rate'}];}
  constructor(){super();this.size=32768;this.buffers=[new Float32Array(this.size),new Float32Array(this.size)];this.cursor=0;this.phase=0;this.window=Math.round(sampleRate*.065);}
  process(inputs,outputs,parameters){
    const input=inputs[0],output=outputs[0],factor=parameters.factor[0];
    for(let i=0;i<output[0].length;i++){
      const p=this.phase,q=(p+.5)%1,w=.5-.5*Math.cos(p*Math.PI*2);
      for(let ch=0;ch<output.length;ch++){
        const ring=this.buffers[ch%2],sample=input[ch]?.[i]??input[0]?.[i]??0;ring[this.cursor]=sample;
        const read=phase=>{const delay=32+(factor>=1?1-phase:phase)*this.window;const at=(this.cursor-delay+this.size)%this.size,lo=Math.floor(at);return ring[lo]*(1-at+lo)+ring[(lo+1)%this.size]*(at-lo);};
        output[ch][i]=Math.abs(factor-1)<.0001?sample:read(p)*w+read(q)*(1-w);
      }
      this.cursor=(this.cursor+1)%this.size;this.phase=(this.phase+Math.abs(1-factor)/this.window)%1;
    }
    return true;
  }
}
registerProcessor('studio-pitch',StudioPitch);
