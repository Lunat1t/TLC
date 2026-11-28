"use client"
import * as React from "react"
import { Pause, Play } from "lucide-react"
import { soundLibrary, type SoundInfo } from "@/lib/sound/library"

export function formatSeconds(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

/** Плеер библиотеки: пуск, пауза и перемотка одного звука. */
export function SoundPlayerBar({ sound }: { sound: SoundInfo }) {
  const audioRef = React.useRef<HTMLAudioElement>(null)
  const [url, setUrl] = React.useState("")
  const [playing, setPlaying] = React.useState(false)
  const [time, setTime] = React.useState(0)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    let active = true
    let created = ""
    setUrl("")
    setTime(0)
    setPlaying(false)
    setError("")
    soundLibrary.data(sound.id).then(
      data => {
        if (!active) return
        if (!data) return setError("Записи нет на этом устройстве.")
        created = URL.createObjectURL(new Blob([data], { type: "audio/wav" }))
        setUrl(created)
      },
      () => { if (active) setError("Не удалось открыть звук.") }
    )
    return () => {
      active = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [sound.id])

  // Пока звук играет, ползунок движется плавно, а не рывками события timeupdate.
  React.useEffect(() => {
    if (!playing) return
    let frame = requestAnimationFrame(function tick() {
      setTime(audioRef.current?.currentTime ?? 0)
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) audio.play().catch(() => setError("Браузер не смог проиграть звук."))
    else audio.pause()
  }

  return (
    <div className="flex shrink-0 flex-col gap-1" role="group" aria-label={`Плеер: ${sound.name}`}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={!url}
          aria-label={playing ? "Пауза" : "Слушать"}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--bs-action)] text-[var(--bs-on-action)] disabled:opacity-50"
        >
          {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">{sound.name}</p>
          <input
            type="range"
            min={0}
            max={sound.duration}
            step={0.01}
            value={Math.min(time, sound.duration)}
            disabled={!url}
            aria-label="Перемотка"
            aria-valuetext={`${formatSeconds(time)} из ${formatSeconds(sound.duration)}`}
            onChange={e => {
              const next = Number(e.target.value)
              setTime(next)
              if (audioRef.current) audioRef.current.currentTime = next
            }}
            className="w-full accent-[var(--bs-action)]"
          />
        </div>
        <span className="shrink-0 text-xs font-bold tabular-nums">
          {formatSeconds(time)} / {formatSeconds(Math.max(1, sound.duration))}
        </span>
      </div>
      {error && <p role="alert" className="text-xs font-bold text-[#991b1b]">{error}</p>}
      <audio
        ref={audioRef}
        src={url || undefined}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setTime(sound.duration)
        }}
      />
    </div>
  )
}
