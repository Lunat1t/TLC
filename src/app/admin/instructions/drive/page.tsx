"use client"

import Link from "next/link"
import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react"
import { FileText, Upload, X } from "lucide-react"
import "./drive.css"

function formatSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

export default function InstructionDrivePage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  function selectFile(nextFile?: File) {
    if (!nextFile) return
    setError("")
    setNotice("")
    if (nextFile.type !== "application/pdf" && !nextFile.name.toLowerCase().endsWith(".pdf")) {
      setError("Выберите файл PDF.")
      return
    }
    if (nextFile.size > 100_000_000) {
      setError("Размер PDF должен быть не больше 100 000 000 байт.")
      return
    }
    setFile(nextFile)
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0])
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    selectFile(event.dataTransfer.files?.[0])
  }

  function removeFile() {
    if (uploading) return
    setFile(null)
    setError("")
    if (inputRef.current) inputRef.current.value = ""
  }

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file || uploading) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const title = String(form.get("title") || "").trim()
    const kit = String(form.get("kit") || "")
    if (!title) {
      setError("Укажите название инструкции.")
      return
    }

    setError("")
    setNotice("")
    setProgress(0)
    setUploading(true)
    try {
      const sessionResponse = await fetch("/api/admin/instructions/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, kit, size: file.size }),
        cache: "no-store",
      })
      const sessionBody = await sessionResponse.json().catch(() => null)
      if (!sessionResponse.ok) {
        const code = sessionBody?.error?.code
        throw new Error(code === "unauthenticated" || code === "forbidden"
          ? "Страница открыта без входа, но сохранение требует подтверждённых прав учителя."
          : sessionBody?.error?.message || "Не удалось начать загрузку PDF.")
      }

      const sessionUrl = new URL(String(sessionBody?.sessionUrl || ""))
      if (sessionUrl.origin !== "https://www.googleapis.com" || !sessionUrl.pathname.startsWith("/upload/drive/v3/files")) {
        throw new Error("Google Drive вернул неверный адрес сессии загрузки.")
      }

      const uploaded = await new Promise<{ id: string }>((resolve, reject) => {
        const request = new XMLHttpRequest()
        request.open("PUT", sessionUrl.toString())
        request.timeout = 10 * 60 * 1000
        request.setRequestHeader("Content-Type", "application/pdf")
        request.upload.onprogress = (progressEvent) => {
          if (progressEvent.lengthComputable) setProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100))
        }
        request.onload = () => {
          const responseBody = (() => { try { return JSON.parse(request.responseText) } catch { return null } })()
          if (request.status >= 200 && request.status < 300 && typeof responseBody?.id === "string") {
            resolve({ id: responseBody.id })
          } else reject(new Error("Google Drive не завершил загрузку. Проверьте соединение и попробуйте ещё раз."))
        }
        request.onerror = () => reject(new Error("Не удалось передать файл в Google Drive. Проверьте подключение и CORS-доступ."))
        request.ontimeout = () => reject(new Error("Загрузка заняла слишком много времени. Попробуйте ещё раз."))
        request.send(file)
      })

      const completeResponse = await fetch("/api/admin/instructions/upload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, kit, fileId: uploaded.id, uploadId: sessionBody.uploadId, size: file.size }),
        cache: "no-store",
      })
      const completeBody = await completeResponse.json().catch(() => null)
      if (!completeResponse.ok) throw new Error(completeBody?.error?.message || "Файл загружен, но не удалось сохранить черновик.")
      setProgress(100)
      setNotice(`Инструкция «${completeBody?.draft?.title || title}» сохранена как черновик.`)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ""
      formElement.reset()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить инструкцию.")
    } finally {
      setUploading(false)
    }
  }

  return <main className="teacher-upload-page">
    <Link className="teacher-upload-back" href="/instructions">← К инструкциям</Link>
    <section className="teacher-upload-card">
      <header className="teacher-upload-heading">
        <span className="teacher-upload-kicker">ПАНЕЛЬ УЧИТЕЛЯ</span>
        <h1>Добавить инструкцию</h1>
        <p>Укажите модель и выберите PDF-файл.</p>
      </header>

      <form className="teacher-upload-form" onSubmit={submitUpload}>
        <label className="teacher-upload-field">
          Название инструкции
          <input name="title" required maxLength={120} placeholder="Например, Робот-исследователь" />
        </label>

        <label className="teacher-upload-field">
          Набор LEGO
          <select name="kit" defaultValue="spike">
            <option value="spike">SPIKE Prime</option>
            <option value="ev3">LEGO EV3</option>
          </select>
        </label>

        <div
          className="teacher-upload-dropzone"
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              inputRef.current?.click()
            }
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        >
          <Upload aria-hidden="true" size={28} />
          <strong>Перетащите PDF сюда</strong>
          <span>или <span className="teacher-upload-browse">выберите файл</span></span>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" onClick={(event) => event.stopPropagation()} onChange={onFileChange} aria-label="Выбрать PDF инструкцию" />
        </div>

        <p className="teacher-upload-hint">PDF до 100 000 000 байт</p>
        {error && <p className="teacher-upload-error" role="alert">{error}</p>}
        {notice && <p className="teacher-upload-success" role="status">{notice}</p>}

        {file && <div className="teacher-upload-file">
          <span className="teacher-upload-file-icon"><FileText aria-hidden="true" size={21} /></span>
          <span className="teacher-upload-file-copy"><strong>{file.name}</strong><small>{formatSize(file.size)}</small></span>
          <button type="button" className="teacher-upload-remove" aria-label="Убрать файл" onClick={removeFile} disabled={uploading}><X size={19} /></button>
        </div>}

        {uploading && <div className="teacher-upload-progress" aria-live="polite"><div><span>{progress >= 100 ? "Проверяю PDF и сохраняю черновик…" : "Загружаю PDF в Google Drive…"}</span><span>{progress}%</span></div><progress max={100} value={progress} /></div>}
        <p className="teacher-upload-notice">PDF сохраняется в закрытую папку «Черновики» Google Drive. Черновик появится в TLC после успешной загрузки.</p>
        <button className="teacher-upload-submit" type="submit" disabled={!file || uploading}>{uploading ? "Загружаю…" : "Добавить инструкцию"}</button>
      </form>
    </section>
  </main>
}
