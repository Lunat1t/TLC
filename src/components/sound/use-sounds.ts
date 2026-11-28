"use client"
import * as React from "react"
import { MISSING_SOUND_NAME, soundLibrary, type SoundInfo } from "@/lib/sound/library"
import { findSoundPreset } from "@/lib/sound/presets"

/** Записи ученика; список обновляется сам после любых изменений библиотеки. */
export function useRecordings() {
  const [recordings, setRecordings] = React.useState<SoundInfo[]>([])
  const [error, setError] = React.useState("")
  React.useEffect(() => {
    let active = true
    const load = () => {
      soundLibrary.recordings().then(
        list => { if (active) { setRecordings(list); setError("") } },
        reason => { if (active) setError(reason instanceof Error ? reason.message : "Не удалось открыть записи.") }
      )
    }
    load()
    const unsubscribe = soundLibrary.subscribe(load)
    return () => { active = false; unsubscribe() }
  }, [])
  return { recordings, error }
}

export function useSoundName(id: string): string {
  const preset = findSoundPreset(id)
  const [found, setFound] = React.useState<{ id: string; name: string } | null>(null)
  React.useEffect(() => {
    if (preset) return
    let active = true
    const load = () => {
      soundLibrary.find(id).then(
        sound => { if (active) setFound({ id, name: sound?.name ?? MISSING_SOUND_NAME }) },
        () => { if (active) setFound({ id, name: MISSING_SOUND_NAME }) }
      )
    }
    load()
    const unsubscribe = soundLibrary.subscribe(load)
    return () => { active = false; unsubscribe() }
  }, [id, preset])
  return preset?.name ?? (found?.id === id ? found.name : "…")
}
