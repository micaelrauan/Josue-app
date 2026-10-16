import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTempo } from '../public/studio-tempo.js';

function rhythm(bpm, seconds = 40, sampleRate = 11025, offset = 0.18, hats = false) {
  const samples = new Float32Array(seconds * sampleRate);
  const beat = 60 / bpm;
  for (let time = offset; time < seconds; time += beat) {
    const start = Math.round(time * sampleRate);
    for (let i = 0; i < sampleRate * 0.08 && start + i < samples.length; i++) {
      const decay = Math.exp(-i / (sampleRate * 0.012));
      samples[start + i] += 0.8 * decay * Math.sin(2 * Math.PI * 90 * i / sampleRate);
    }
  }
  if (hats) for (let time = offset + beat / 2; time < seconds; time += beat / 2) {
    const start = Math.round(time * sampleRate);
    for (let i = 0; i < sampleRate * 0.025 && start + i < samples.length; i++) {
      samples[start + i] += 0.12 * Math.exp(-i / (sampleRate * 0.005)) * Math.sin(2 * Math.PI * 3600 * i / sampleRate);
    }
  }
  return samples;
}

test('automatic tempo detection finds BPM and beat offset in rhythmic audio', () => {
  for (const bpm of [80, 120, 174]) {
    const result = estimateTempo(rhythm(bpm), 11025);
    assert.ok(result, `No BPM found for ${bpm}`);
    assert.ok(Math.abs(result.bpm - bpm) <= 3, `${bpm} BPM detected as ${result.bpm}`);
    assert.ok(Math.abs(result.offset - 0.18) < 0.08, `${bpm} BPM offset detected as ${result.offset}`);
  }
});

test('automatic tempo detection leaves silence for manual adjustment', () => {
  assert.equal(estimateTempo(new Float32Array(11025 * 20), 11025), null);
  const tone = Float32Array.from({ length: 11025 * 20 }, (_, i) => 0.2 * Math.sin(2 * Math.PI * 440 * i / 11025));
  assert.equal(estimateTempo(tone, 11025), null);
  let seed = 12345;
  const noise = Float32Array.from({ length: 11025 * 20 }, () => { seed = (1664525 * seed + 1013904223) >>> 0; return (seed / 2 ** 32 - 0.5) * 0.2; });
  assert.equal(estimateTempo(noise, 11025), null);
});

test('eighth-note hi-hats do not double the quarter-note BPM', () => {
  const result = estimateTempo(rhythm(96, 40, 11025, 0.18, true), 11025);
  assert.ok(result);
  assert.ok(Math.abs(result.bpm - 96) <= 3, `96 BPM detected as ${result.bpm}`);
});
