/**
 * Проигрыватель звуков для запущенной программы. Работает через Web Audio:
 * после одного нажатия пользователя звуки можно включать и из программы.
 */
import { soundLibrary } from "./library.ts"

export interface SoundRequest {
  soundId: string
  /** 0–100 %. */
  volume: number
  /** Сколько раз подряд. */
  times: number
}

export interface SoundOutput {
  /** Запускает звук один раз и возвращает функцию остановки. `onEnd` вызывается в конце. */
  start(data: ArrayBuffer, gain: number, onEnd: () => void): Promise<() => void>
  /** Разрешает браузеру играть звук. Вызывать из обработчика нажатия. */
  unlock(): void
}

export function createSoundPlayer(load: (id: string) => Promise<ArrayBuffer | null>, output: SoundOutput) {
  // Один звук играет в одном экземпляре: повторный запуск начинает его заново.
  const playing = new Map<string, () => void>()

  function play(request: SoundRequest, signal?: AbortSignal): Promise<void> {
    playing.get(request.soundId)?.()
    return new Promise<void>((resolve, reject) => {
      let stopCurrent: (() => void) | null = null
      let done = false
      const finish = (error?: unknown) => {
        if (done) return
        done = true
        stopCurrent?.()
        signal?.removeEventListener("abort", cancel)
        if (playing.get(request.soundId) === cancel) playing.delete(request.soundId)
        if (error) reject(error)
        else resolve()
      }
      const cancel = () => finish()
      if (signal?.aborted) return resolve()
      signal?.addEventListener("abort", cancel, { once: true })
      playing.set(request.soundId, cancel)

      void (async () => {
        const data = await load(request.soundId)
        if (!data) throw new Error("Записи нет на этом устройстве. Выберите другой звук.")
        let left = Math.max(1, Math.round(request.times))
        const gain = Math.max(0, Math.min(100, request.volume)) / 100
        const next = async () => {
          if (done) return
          // Копия: декодер браузера забирает переданный буфер себе.
          const stop = await output.start(data.slice(0), gain, () => {
            stopCurrent = null
            if (--left > 0) void next().catch(finish)
            else finish()
          })
          if (done) stop()
          else stopCurrent = stop
        }
        await next()
      })().catch(finish)
    })
  }

  return {
    play,
    unlock: () => output.unlock(),
    stopAll() { for (const stop of [...playing.values()]) stop() },
  }
}

export function webAudioOutput(): SoundOutput {
  let context: AudioContext | null = null
  const ensure = () => {
    if (!context) {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Context) throw new Error("Этот браузер не умеет играть звук.")
      context = new Context()
    }
    return context
  }
  return {
    unlock() {
      try { void ensure().resume().catch(() => {}) } catch { /* ошибка появится при воспроизведении */ }
    },
    async start(data, gain, onEnd) {
      const audio = ensure()
      if (audio.state !== "running") {
        // Без нажатия пользователя resume() может не завершиться никогда.
        await Promise.race([audio.resume(), new Promise(resolve => setTimeout(resolve, 500))])
        if ((audio.state as AudioContextState) !== "running") throw new Error("Нажмите на экран, чтобы включить звук.")
      }
      const source = audio.createBufferSource()
      source.buffer = await audio.decodeAudioData(data)
      const level = audio.createGain()
      level.gain.value = gain
      source.connect(level).connect(audio.destination)
      source.onended = onEnd
      source.start()
      return () => {
        source.onended = null
        try { source.stop() } catch { /* уже остановлен */ }
        source.disconnect()
        level.disconnect()
      }
    },
  }
}

export const soundPlayer = createSoundPlayer(id => soundLibrary.data(id), webAudioOutput())
