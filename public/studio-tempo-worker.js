import { estimateTempo } from './studio-tempo.js';

self.onmessage = ({ data }) => {
  self.postMessage(estimateTempo(data.samples, data.sampleRate));
};
