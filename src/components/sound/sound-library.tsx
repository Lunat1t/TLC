"use client"
import * as React from "react"
import { createPortal } from "react-dom"
import { Check, Pencil, Trash2, X } from "lucide-react"
import { MAX_SOUND_NAME, filterSounds, soundLibrary, type SoundInfo } from "@/lib/sound/library"
import { SoundPlayerBar, formatSeconds } from "@/components/sound/sound-player"
import { SoundRecorder } from "@/components/sound/sound-recorder"
import { useRecordings } from "@/components/sound/use-sounds"

/**
 * Окно библиотеки звуков: плеер, запись, готовые звуки и свои записи.
 * Нажатие на звук включает его в плеере, «Выбрать» отдаёт его блоку.
 */
export function SoundLibraryDialog({
  selectedId,
  onSelect,
  onClose,
}: {
  selectedId: string
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const { recordings, error } = useRecordings()
  const [currentId, setCurrentId] = React.useState(selectedId)
  const [query, setQuery] = React.useState("")
  const [editing, setEditing] = React.useState<{ id: string; name: string } | null>(null)
  const [deletingId, setDeletingId] = React.useState("")
  const [actionError, setActionError] = React.useState("")
  const dialogRef = React.useRef<HTMLDialogElement>(null)

  React.useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const all = [...soundLibrary.presets, ...recordings]
  const current = all.find(sound => sound.id === currentId) ?? soundLibrary.presets[0]

  const run = (action: Promise<void>) => {
    setActionError("")
    action.catch(reason => setActionError(reason instanceof Error ? reason.message : "Не получилось изменить запись."))
  }

  const row = (sound: SoundInfo) => {
    if (editing?.id === sound.id) {
      return (
        <li key={sound.id}>
          <form
            className="flex items-center gap-1"
            onSubmit={e => {
              e.preventDefault()
              run(soundLibrary.rename(sound.id, editing.name))
              setEditing(null)
            }}
          >
            <input
              autoFocus
              value={editing.name}
              maxLength={MAX_SOUND_NAME}
              aria-label="Новое название записи"
              onChange={e => setEditing({ id: sound.id, name: e.target.value })}
              className="min-h-[40px] min-w-0 flex-1 rounded-lg border border-[#1d1b1a73] bg-white px-3 text-sm font-bold"
            />
            <button type="submit" aria-label="Сохранить название" className="grid size-10 place-items-center rounded-lg bg-[#faf5ec]">
              <Check size={16} aria-hidden="true" />
            </button>
          </form>
        </li>
      )
    }
    if (deletingId === sound.id) {
      return (
        <li key={sound.id} className="flex items-center gap-2 rounded-lg bg-[#fef2f2] px-3 py-1">
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#991b1b]">Удалить «{sound.name}»?</span>
          <button
            type="button"
            onClick={() => {
              setDeletingId("")
              run(soundLibrary.remove(sound.id))
            }}
            className="min-h-[36px] rounded-lg bg-[#b91c1c] px-3 text-xs font-extrabold text-white"
          >
            Удалить
          </button>
          <button type="button" onClick={() => setDeletingId("")} className="min-h-[36px] rounded-lg bg-white px-3 text-xs font-bold">
            Отмена
          </button>
        </li>
      )
    }
    const isCurrent = sound.id === current.id
    return (
      <li key={sound.id} className={`flex items-center gap-1 rounded-lg ${isCurrent ? "bg-[#f3e8d4]" : "bg-[#faf5ec]"}`}>
        <button
          type="button"
          aria-pressed={isCurrent}
          onClick={() => setCurrentId(sound.id)}
          className="flex min-h-[40px] min-w-0 flex-1 items-center gap-2 px-3 text-left text-sm font-bold"
        >
          <span className="min-w-0 flex-1 truncate">{sound.name}</span>
          {sound.id === selectedId && <Check size={14} aria-label="Выбран в блоке" className="shrink-0" />}
          <span className="shrink-0 text-xs tabular-nums opacity-70">{formatSeconds(Math.max(1, sound.duration))}</span>
        </button>
        {sound.kind === "recording" && (
          <>
            <button
              type="button"
              aria-label={`Переименовать «${sound.name}»`}
              onClick={() => { setDeletingId(""); setEditing({ id: sound.id, name: sound.name }) }}
              className="grid size-10 shrink-0 place-items-center rounded-lg hover:bg-white"
            >
              <Pencil size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={`Удалить «${sound.name}»`}
              onClick={() => { setEditing(null); setDeletingId(sound.id) }}
              className="grid size-10 shrink-0 place-items-center rounded-lg text-[#991b1b] hover:bg-white"
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </>
        )}
      </li>
    )
  }

  const mine = filterSounds(recordings, query)
  const ready = filterSounds(soundLibrary.presets, query)
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
          <h2 className="text-lg font-bold">Библиотека звуков</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="grid size-10 place-items-center rounded-lg hover:bg-[#faf5ec]">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <SoundPlayerBar sound={current} />
        <button
          type="button"
          onClick={() => onSelect(current.id)}
          className="min-h-[44px] w-full shrink-0 rounded-full bg-[var(--bs-action)] px-4 text-sm font-extrabold text-[var(--bs-on-action)]"
        >
          Выбрать этот звук
        </button>
        <SoundRecorder onRecorded={sound => { setQuery(""); setCurrentId(sound.id) }} />
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Найти звук"
          aria-label="Найти звук"
          className="min-h-[40px] shrink-0 rounded-lg border border-[#1d1b1a73] bg-white px-3 text-sm font-bold"
        />
        {(error || actionError) && <p role="alert" className="text-xs font-bold text-[#991b1b]">{error || actionError}</p>}
        <div className="flex min-h-[180px] flex-1 flex-col gap-3 overflow-y-auto overscroll-contain">
          <section aria-label="Мои записи" className="flex flex-col gap-1">
            <h3 className="text-xs font-black uppercase tracking-wide opacity-70">Мои записи</h3>
            {mine.length ? (
              <ul className="flex flex-col gap-1">{mine.map(row)}</ul>
            ) : (
              <p className="text-xs font-semibold opacity-70">
                {recordings.length ? "Ничего не найдено." : "Пока пусто. Записи хранятся только на этом устройстве."}
              </p>
            )}
          </section>
          <section aria-label="Готовые звуки" className="flex flex-col gap-1">
            <h3 className="text-xs font-black uppercase tracking-wide opacity-70">Готовые звуки</h3>
            {ready.length ? <ul className="flex flex-col gap-1">{ready.map(row)}</ul> : <p className="text-xs font-semibold opacity-70">Ничего не найдено.</p>}
          </section>
        </div>
      </div>
    </dialog>,
    document.body
  )
}
