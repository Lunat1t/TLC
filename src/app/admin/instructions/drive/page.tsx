"use client"

import Link from "next/link"
import { useState, type FormEvent } from "react"
import "./drive.css"

export default function InstructionDrivePage() {
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setError(""); setNotice(""); setSaving(true)
    try {
      const response = await fetch("/api/admin/instructions/link", { method: "POST", body: data })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error?.message || "Не удалось сохранить инструкцию.")
      setNotice("Инструкция опубликована. Теперь её можно скачать из каталога.")
      form.reset()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить инструкцию.") }
    finally { setSaving(false) }
  }
  return <main className="teacher-upload-page">
    <Link className="teacher-upload-back" href="/instructions">← К инструкциям</Link>
    <section className="teacher-upload-card">
      <header className="teacher-upload-heading"><span className="teacher-upload-kicker">ПАНЕЛЬ УЧИТЕЛЯ</span><h1>Добавить инструкцию</h1><p>Загрузите PDF в Google Drive, откройте доступ «Все, у кого есть ссылка — Читатель» и вставьте ссылку ниже. Добавьте фото модели — оно появится в каталоге.</p></header>
      <form className="teacher-upload-form" onSubmit={submit}>
        <label className="teacher-upload-field">Название инструкции<input name="title" required maxLength={120} placeholder="Например, LEGO SPIKE 0297" /></label>
        <label className="teacher-upload-field">Набор LEGO<select name="kit" defaultValue="spike"><option value="spike">SPIKE Prime</option><option value="ev3">LEGO EV3</option></select></label>
        <label className="teacher-upload-field">Ссылка на PDF в Google Drive<input name="url" type="url" required placeholder="https://drive.google.com/file/d/…/view" /></label>
        <label className="teacher-upload-field">Превью модели<input name="cover" type="file" accept="image/jpeg,image/png,image/webp" required /><span className="teacher-upload-help">JPG, PNG или WebP, до 3 МБ. Выберите фото собранной модели.</span></label>
        <label className="teacher-upload-rights"><input type="checkbox" name="rights" required /><span>Подтверждаю право на публикацию этой инструкции.</span></label>
        {error && <p className="teacher-upload-error" role="alert">{error}</p>}
        {notice && <p className="teacher-upload-success" role="status">{notice}</p>}
        <button className="teacher-upload-submit" disabled={saving}>{saving ? "Проверяю PDF…" : "Опубликовать инструкцию"}</button>
        <Link className="teacher-upload-signin" href="/login?next=/admin/instructions/drive">Войти в аккаунт учителя</Link>
      </form>
    </section>
  </main>
}
