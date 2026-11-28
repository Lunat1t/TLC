"use client"
import * as React from "react"
import { Mic, Square } from "lucide-react"
import { soundLibrary, type SoundInfo } from "@/lib/sound/library"
import {
  MAX_RECORDING_SECONDS,
  microphoneErrorMessage,
  startRecording,
  type ActiveRecording,
} from "@/lib/sound/recorder"
import { formatSeconds } from "@/components/sound/sound-player"

type Phase = "idle" | "asking" | "recording" | "saving"

/** Кнопка записи с микрофона. Готовая запись сразу попадает в библиотеку. */
export function SoundRecorder({ onRecorded }: { onRecorded: (sound: SoundInfo) => void }) {
  const [phase, setPhase] = React.useState<Phase>("idle")
  const [seconds, setSeconds] = React.useState(0)
  const [error, setError] = React.useState("")
  const active = React.useRef<ActiveRecording | null>(null)
  const alive = React.useRef(true)

  // Закрытие окна во время записи отпускает микрофон.
  React.useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      active.current?.cancel()
      active.current = null
    }
  }, [])

  const finish = React.useCallback(async () => {
    const recording = active.current
    if (!recording) return
    active.current = null
    setPhase("saving")
    try {
      const result = await recording.stop()
      const saved = await soundLibrary.add(result)
      if (alive.current) onRecorded(saved)
    } catch (reason) {
      if (alive.current) setError(microphoneErrorMessage(reason))
    } finally {
      if (alive.current) setPhase("idle")
    }
  }, [onRecorded])

  React.useEffect(() => {
    if (phase !== "recording") return
    const started = Date.now()
    const timer = window.setInterval(() => {
      const elapsed = (Date.now() - started) / 1000
      setSeconds(elapsed)
      if (elapsed >= MAX_RECORDING_SECONDS) void finish()
    }, 200)
    return () => window.clearInterval(timer)
  }, [phase, finish])

  const start = async () => {
    setError("")
    setSeconds(0)
    setPhase("asking")
    try {
      const recording = await startRecording()
      if (!alive.current) return recording.cancel()
      active.current = recording
      setPhase("recording")
    } catch (reason) {
      if (!alive.current) return
      setError(microphoneErrorMessage(reason))
      setPhase("idle")
    }
  }

  const recording = phase === "recording"
  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <button
        type="button"
        onClick={() => void (recording ? finish() : start())}
        disabled={phase === "asking" || phase === "saving"}
        className={`flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-extrabold disabled:opacity-60 ${
          recording ? "bg-[#b91c1c] text-white" : "border border-[#1d1b1a73] bg-white text-[#252221]"
        }`}
      >
        {recording ? <Square size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
        {recording
          ? `Остановить · ${formatSeconds(seconds)} из ${formatSeconds(MAX_RECORDING_SECONDS)}`
          : phase === "asking"
            ? "Разрешите микрофон…"
            : phase === "saving"
              ? "Сохраняю…"
              : "Записать свой звук"}
      </button>
      <span className="sr-only" aria-live="polite">{recording ? "Идёт запись" : ""}</span>
      {error && <p role="alert" className="text-xs font-bold text-[#991b1b]">{error}</p>}
    </div>
  )
}
