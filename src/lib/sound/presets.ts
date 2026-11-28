import * as Raw from "../../../public/sound-presets.js"
import { SOUND_SAMPLE_RATE } from "./wav.ts"

export type Wave = "sine" | "square" | "saw"
export type Note = readonly [from: number, to: number, seconds: number, wave?: Wave]
export interface SoundPreset {
  id: string
  name: string
  notes: readonly Note[]
}

export const DEFAULT_SOUND_ID = Raw.DEFAULT_SOUND_ID as string
export const DEFAULT_SOUND_VOLUME = Raw.DEFAULT_SOUND_VOLUME as number
export const SOUND_PRESETS = Raw.SOUND_PRESETS as unknown as readonly SoundPreset[]
export const findSoundPreset = Raw.findSoundPreset as unknown as (id: string) => SoundPreset | null

const AMPLITUDE: Record<Wave, number> = { sine: 0.6, square: 0.22, saw: 0.32 }
const FADE_SECONDS = 0.008

export function presetDuration(preset: SoundPreset): number {
  return preset.notes.reduce((sum, note) => sum + note[2], 0)
}

/** Считает отсчёты готового звука. Короткое нарастание и затухание убирают щелчки. */
export function renderPreset(preset: SoundPreset, sampleRate: number = SOUND_SAMPLE_RATE): Float32Array {
  const lengths = preset.notes.map(note => Math.round(note[2] * sampleRate))
  const out = new Float32Array(lengths.reduce((sum, length) => sum + length, 0))
  let offset = 0
  preset.notes.forEach(([from, to, , wave = "sine"], index) => {
    const length = lengths[index]
    const fade = Math.max(1, Math.min(length / 2, FADE_SECONDS * sampleRate))
    let phase = 0
    for (let i = 0; from > 0 && i < length; i++) {
      phase = (phase + (from + (to - from) * (i / length)) / sampleRate) % 1
      const raw = wave === "square" ? (phase < 0.5 ? 1 : -1) : wave === "saw" ? phase * 2 - 1 : Math.sin(phase * 2 * Math.PI)
      out[offset + i] = raw * AMPLITUDE[wave] * Math.min(1, i / fade, (length - 1 - i) / fade)
    }
    offset += length
  })
  return out
}
