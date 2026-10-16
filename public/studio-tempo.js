// Estimate tempo from changes in low- and high-frequency energy. Runs in a worker.
export function estimateTempo(samples, sampleRate) {
  if (!samples || !Number.isFinite(sampleRate) || sampleRate < 8000 || samples.length < sampleRate * 8) return null;
  const hop = Math.round(sampleRate / 100);
  const frameRate = sampleRate / hop;
  const frames = Math.min(Math.floor(samples.length / hop), Math.round(90 * frameRate));
  const lowFlux = new Float32Array(frames);
  const highFlux = new Float32Array(frames);
  let low = 0, previousLow = 0, previousHigh = 0;
  const filter = Math.min(1, 2 * Math.PI * 180 / sampleRate);
  for (let frame = 0; frame < frames; frame++) {
    let lowPower = 0, highPower = 0;
    const start = frame * hop;
    for (let i = start; i < start + hop; i++) {
      const sample = samples[i] || 0;
      low += filter * (sample - low);
      const high = sample - low;
      lowPower += low * low;
      highPower += high * high;
    }
    const lowEnergy = Math.log1p(25 * Math.sqrt(lowPower / hop));
    const highEnergy = Math.log1p(25 * Math.sqrt(highPower / hop));
    lowFlux[frame] = Math.max(0, lowEnergy - previousLow);
    highFlux[frame] = Math.max(0, highEnergy - previousHigh);
    previousLow = lowEnergy;
    previousHigh = highEnergy;
  }

  function pickPeaks(flux) {
    let sum = 0, sumSquares = 0;
    for (const value of flux) { sum += value; sumSquares += value * value; }
    const mean = sum / frames;
    const threshold = mean + 0.4 * Math.sqrt(Math.max(0, sumSquares / frames - mean * mean));
    const peaks = new Float32Array(frames);
    let count = 0, last = -10;
    for (let i = 2; i < frames - 2; i++) {
      const value = flux[i];
      if (value < threshold || value < flux[i - 1] || value <= flux[i + 1]) continue;
      if (i - last < 8) {
        if (value > peaks[last]) { peaks[last] = 0; peaks[i] = value; last = i; }
      } else { peaks[i] = value; last = i; count++; }
    }
    return { peaks, count };
  }

  const bass = pickPeaks(lowFlux), treble = pickPeaks(highFlux);
  if (Math.max(bass.count, treble.count) < 8) return null;
  const onsets = new Float32Array(frames);
  let power = 0;
  for (let i = 0; i < frames; i++) {
    onsets[i] = Math.max(bass.peaks[i] * 1.2, treble.peaks[i] * 0.75);
    power += onsets[i] * onsets[i];
  }
  if (power < 0.001) return null;

  const minLag = Math.floor(frameRate * 60 / 200);
  const maxLag = Math.ceil(frameRate * 60 / 60);
  const correlations = new Float32Array(maxLag + 2);
  let bestLag = 0, bestScore = 0, averageScore = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let matched = 0;
    for (let i = 0; i < frames - lag - 3; i++) {
      if (!onsets[i]) continue;
      matched += onsets[i] * Math.max(onsets[i + lag - 2], onsets[i + lag - 1], onsets[i + lag], onsets[i + lag + 1], onsets[i + lag + 2]);
    }
    const correlation = matched / (power * (1 - lag / frames));
    correlations[lag] = correlation;
    const bpm = 60 * frameRate / lag;
    const prior = 1 - 0.12 * Math.abs(Math.log2(bpm / 120));
    const score = correlation * prior;
    averageScore += score;
    if (score > bestScore) { bestScore = score; bestLag = lag; }
  }
  averageScore /= maxLag - minLag + 1;
  if (bestScore < 0.12 || bestScore < averageScore * 1.5) return null;

  // A fast beat can also correlate at half tempo. Keep the fast pulse when
  // attacks are present at nearly every halfway point.
  const halfLag = Math.round(bestLag / 2);
  if (halfLag >= minLag && correlations[halfLag] > correlations[bestLag] * 0.58) bestLag = halfLag;

  // Average matched onset intervals to recover fractional frame periods.
  let intervalSum = 0, intervalWeight = 0;
  for (let i = 0; i < frames - bestLag - 3; i++) {
    if (!onsets[i]) continue;
    let match = 0, matchIndex = 0;
    for (let j = i + bestLag - 2; j <= i + bestLag + 2; j++) {
      if (onsets[j] > match) { match = onsets[j]; matchIndex = j; }
    }
    if (!match) continue;
    const weight = Math.min(onsets[i], match);
    intervalSum += (matchIndex - i) * weight;
    intervalWeight += weight;
  }
  const periodFrames = intervalWeight > 0 ? intervalSum / intervalWeight : bestLag;
  const bpm = Math.round(60 * frameRate / periodFrames);

  // Use an early window so a small tempo error does not shift the phase.
  const phaseBins = 100;
  const phase = new Float32Array(phaseBins);
  const phaseFrames = Math.min(frames, Math.round(frameRate * 10));
  for (let i = 0; i < phaseFrames; i++) {
    if (!onsets[i]) continue;
    const bin = Math.round(((i % periodFrames) / periodFrames) * phaseBins) % phaseBins;
    phase[bin] += bass.peaks[i] * 1.2 + treble.peaks[i] * 0.5;
  }
  let bestPhase = 0;
  for (let i = 1; i < phaseBins; i++) if (phase[i] > phase[bestPhase]) bestPhase = i;
  const offset = bestPhase / phaseBins * 60 / bpm;
  return { bpm, offset, confidence: Math.min(1, bestScore) };
}
