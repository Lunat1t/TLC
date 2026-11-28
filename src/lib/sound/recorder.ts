/** Запись с микрофона. Результат — готовый WAV для библиотеки. */
import { SOUND_SAMPLE_RATE, encodeWav, mixToMono, normalizePeak, resample } from "./wav.ts"

export const MAX_RECORDING_SECONDS = 30
const MIN_RECORDING_SECONDS = 0.2

export interface RecordedSound {
  data: ArrayBuffer
  duration: number
}

export interface ActiveRecording {
  /** Заканчивает запись и возвращает WAV. */
  stop(): Promise<RecordedSound>
  /** Бросает запись и отпускает микрофон. */
  cancel(): void
}

export function microphoneErrorMessage(error: unknown): string {
  const name = error && typeof error === "object" && "name" in error ? String((error as { name: unknown }).name) : ""
  if (name === "NotAllowedError" || name === "SecurityError") return "Нет доступа к микрофону. Разрешите его в настройках браузера."
  if (name === "NotFoundError") return "Микрофон не найден."
  if (name === "NotReadableError") return "Микрофон занят другой программой."
  return error instanceof Error && error.message ? error.message : "Не удалось записать звук."
}

async function toWav(blob: Blob): Promise<RecordedSound> {
  const context = new AudioContext()
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer())
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i))
    const samples = resample(mixToMono(channels), buffer.sampleRate, SOUND_SAMPLE_RATE)
      .slice(0, MAX_RECORDING_SECONDS * SOUND_SAMPLE_RATE)
    const duration = samples.length / SOUND_SAMPLE_RATE
    if (duration < MIN_RECORDING_SECONDS) throw new Error("Запись слишком короткая. Попробуйте ещё раз.")
    return { data: encodeWav(normalizePeak(samples)).buffer, duration }
  } finally {
    void context.close()
  }
}

export async function startRecording(): Promise<ActiveRecording> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new Error("Запись работает по HTTPS в современном браузере.")
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const release = () => { for (const track of stream.getTracks()) track.stop() }
  let recorder: MediaRecorder
  const chunks: Blob[] = []
  try {
    recorder = new MediaRecorder(stream)
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
    recorder.start()
  } catch (error) {
    release()
    throw error
  }
  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }))
    recorder.onerror = () => reject(new Error("Запись прервалась."))
  })
  finished.catch(() => {})
  const halt = () => {
    if (recorder.state !== "inactive") recorder.stop()
  }
  return {
    async stop() {
      halt()
      try { return await toWav(await finished) } finally { release() }
    },
    cancel() {
      halt()
      release()
    },
  }
}
