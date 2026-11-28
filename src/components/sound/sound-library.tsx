"use client"
import * as React from "react"
import { createPortal } from "react-dom"
import { Check, Play, Square, X } from "lucide-react"
import { SOUND_PRESETS, findSoundPreset, presetSeconds } from "@/lib/sound/presets"

export type SoundPreview = (soundId: string, volume: number) => Promise<{ ok: boolean; error?: string }>

/**
 * Библиотека звуков робота. Нажатие на звук выделяет его, «Слушать на роботе»
 * играет через динамик хаба, «Выбрать» отдаёт звук блоку.
 */
export function SoundLibraryDialog({
  selectedId,
  volume,
  onPreview,
  onStopPreview,
  onSelect,
  onClose,
}: {
  selectedId: string
  volume: number
  onPreview: SoundPreview
  onStopPreview: () => void
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const [currentId, setCurrentId] = React.useState(selectedId)
  const [query, setQuery] = React.useState("")
  const [playing, setPlaying] = React.useState(false)
  const [error, setError] = React.useState("")
  const dialogRef = React.useRef<HTMLDialogElement>(null)
  // Ответ прерванного прослушивания не должен менять кнопку нового.
  const attempt = React.useRef(0)

  React.useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const current = findSoundPreset(currentId) ?? SOUND_PRESETS[0]
  const needle = query.trim().toLocaleLowerCase("ru")
  const sounds = SOUND_PRESETS.filter(sound => sound.name.toLocaleLowerCase("ru").includes(needle))

  const stopPreview = () => {
    attempt.current++
    setPlaying(false)
    onStopPreview()
  }

  const preview = async () => {
    const own = ++attempt.current
    setError("")
    setPlaying(true)
    const result = await onPreview(current.id, volume)
    if (own !== attempt.current) return
    setPlaying(false)
    if (!result.ok) setError(result.error ?? "Не удалось проиграть звук.")
  }

  // Окно живёт в body, а не на холсте, но события React всё равно всплывают к блоку:
  // без остановки клавиши и нажатия двигали бы или удаляли блок под окном.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-label="Библиотека звуков"
      onClose={onClose}
      onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) onClose() }}
      onPointerDown={stop}
      onKeyDown={stop}
      onWheel={stop}
      className="m-auto w-[min(440px,calc(100vw-16px))] max-h-[calc(100dvh-16px)] overflow-hidden rounded-md border border-[#1d1b1a73] bg-white p-0 text-[#252221] shadow-2xl backdrop:bg-[#201e1d]/50"
    >
      {/* На низком экране телефона (альбомная ориентация) прокручивается всё окно. */}
      <div className="flex max-h-[calc(100dvh-18px)] flex-col gap-3 overflow-y-auto overscroll-contain p-4">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Звуки робота</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="grid size-10 place-items-center rounded-lg hover:bg-[#faf5ec]">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => (playing ? stopPreview() : void preview())}
          className="flex min-h-[44px] w-full shrink-0 items-center justify-center gap-2 rounded-full border border-[#1d1b1a73] bg-white px-4 text-sm font-extrabold"
        >
          {playing ? <Square size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          {playing ? "Стоп" : `Слушать «${current.name}» на роботе`}
        </button>
        {error && <p role="alert" className="shrink-0 text-xs font-bold text-[#991b1b]">{error}</p>}
        <button
          type="button"
          onClick={() => onSelect(current.id)}
          className="min-h-[44px] w-full shrink-0 rounded-full bg-[var(--bs-action)] px-4 text-sm font-extrabold text-[var(--bs-on-action)]"
        >
          Выбрать этот звук
        </button>
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Найти звук"
          aria-label="Найти звук"
          className="min-h-[40px] shrink-0 rounded-lg border border-[#1d1b1a73] bg-white px-3 text-sm font-bold"
        />
        <div className="min-h-[180px] flex-1 overflow-y-auto overscroll-contain">
          {sounds.length ? (
            <ul className="flex flex-col gap-1">
              {sounds.map(sound => (
                <li key={sound.id}>
                  <button
                    type="button"
                    aria-pressed={sound.id === current.id}
                    onClick={() => {
                      if (playing) stopPreview()
                      setError("")
                      setCurrentId(sound.id)
                    }}
                    className={`flex min-h-[40px] w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-bold ${
                      sound.id === current.id ? "bg-[#f3e8d4]" : "bg-[#faf5ec]"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{sound.name}</span>
                    {sound.id === selectedId && <Check size={14} aria-label="Выбран в блоке" className="shrink-0" />}
                    <span className="shrink-0 text-xs tabular-nums opacity-70">{presetSeconds(sound).toLocaleString("ru", { maximumFractionDigits: 1 })} с</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs font-semibold opacity-70">Ничего не найдено.</p>
          )}
        </div>
      </div>
    </dialog>,
    document.body
  )
}
