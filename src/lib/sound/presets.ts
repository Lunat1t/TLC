import * as Raw from "../../../public/sound-presets.js"

export interface SoundPreset {
  id: string
  name: string
  notes: readonly (readonly number[])[]
}

export interface SoundStep {
  /** Герцы; 0 — пауза. */
  freq: number
  ms: number
}

export const DEFAULT_SOUND_ID = Raw.DEFAULT_SOUND_ID as string
export const DEFAULT_SOUND_VOLUME = Raw.DEFAULT_SOUND_VOLUME as number
export const SOUND_PRESETS = Raw.SOUND_PRESETS as unknown as readonly SoundPreset[]
export const findSoundPreset = Raw.findSoundPreset as unknown as (id: string) => SoundPreset | null
export const soundSteps = Raw.soundSteps as (id: string) => SoundStep[]

export function presetSeconds(preset: SoundPreset): number {
  return preset.notes.reduce((sum, note) => sum + note[2], 0) / 1000
}
