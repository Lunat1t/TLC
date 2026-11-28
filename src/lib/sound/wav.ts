/** Работа с отсчётами звука и форматом WAV. Чистые функции без браузерных API. */

export const SOUND_SAMPLE_RATE = 22_050

/** Сводит каналы в один усреднением. */
export function mixToMono(channels: readonly Float32Array[]): Float32Array {
  if (!channels.length) return new Float32Array(0)
  if (channels.length === 1) return channels[0]
  const mono = new Float32Array(channels[0].length)
  for (const channel of channels) {
    for (let i = 0; i < mono.length; i++) mono[i] += (channel[i] ?? 0) / channels.length
  }
  return mono
}

/** Меняет частоту дискретизации; при понижении усредняет соседние отсчёты. */
export function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to || !samples.length) return samples
  const ratio = from / to
  const out = new Float32Array(Math.max(1, Math.round(samples.length / ratio)))
  for (let i = 0; i < out.length; i++) {
    const start = Math.min(samples.length - 1, Math.floor(i * ratio))
    const end = Math.max(start + 1, Math.min(samples.length, Math.floor((i + 1) * ratio)))
    let sum = 0
    for (let j = start; j < end; j++) sum += samples[j]
    out[i] = sum / (end - start)
  }
  return out
}

/** Поднимает тихую запись до комфортной громкости. Тишину и громкий звук не трогает. */
export function normalizePeak(samples: Float32Array, target = 0.9, maxGain = 8): Float32Array {
  let peak = 0
  for (const value of samples) peak = Math.max(peak, Math.abs(value))
  if (peak < 0.01 || peak >= target) return samples
  const gain = Math.min(maxGain, target / peak)
  return samples.map(value => value * gain)
}

/** 16-битный моно WAV: открывается любым браузером, длительность и перемотка работают сразу. */
export function encodeWav(samples: Float32Array, sampleRate: number = SOUND_SAMPLE_RATE): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }
  text(0, "RIFF")
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, "WAVE")
  text(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, "data")
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, Math.round(value < 0 ? value * 0x8000 : value * 0x7fff), true)
  }
  return bytes
}
