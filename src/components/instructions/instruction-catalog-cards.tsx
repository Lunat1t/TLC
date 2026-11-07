"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, type FormEvent } from "react"
import { useAccess } from "@/components/auth/access-provider"
import { driveDownloadPath } from "@/lib/instructions/drive-links"
import type { CatalogCard } from "@/lib/instructions/types"
import "./instruction-catalog-admin.css"

type EditorData = {
  id: string | null
  title: string
  summary: string
  kit: "spike" | "ev3"
  topics: string[]
  fileId: string
  coverUrl: string | null
}

const blankEditor: EditorData = { id: null, title: "", summary: "", kit: "spike", topics: [], fileId: "", coverUrl: null }

export function InstructionCatalogCards({ items }: { items: CatalogCard[] }) {
  const router = useRouter()
  const { canPublish, ready } = useAccess()
  const [selected, setSelected] = useState<CatalogCard | null>(null)
  const [editor, setEditor] = useState<EditorData | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  useEffect(() => {
    if (!selected && !editor) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || saving) return
      if (editor) setEditor(null)
      else setSelected(null)
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [editor, saving, selected])

  async function editCard(id: string) {
    setError(""); setNotice(""); setLoadingId(id)
    try {
      const response = await fetch(`/api/admin/instructions/${encodeURIComponent(id)}`, { cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error?.message || "Не удалось загрузить карточку.")
      setEditor({
        id: body.instruction.id, title: body.instruction.title, summary: body.instruction.summary || "",
        kit: body.instruction.kit, topics: body.instruction.topics || [], fileId: body.fileId || "", coverUrl: body.coverUrl || null,
      })
      setSelected(null)
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить карточку.")
      return false
    }
    finally { setLoadingId(null) }
  }

  function createCard() {
    setError(""); setNotice(""); setEditor({ ...blankEditor })
  }

  async function saveCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor) return
    const form = new FormData(event.currentTarget)
    form.set("topics", JSON.stringify(String(form.get("topics") || "").split(",").map((topic) => topic.trim()).filter(Boolean)))
    setSaving(true); setError(""); setNotice("")
    try {
      const response = await fetch(editor.id ? `/api/admin/instructions/${encodeURIComponent(editor.id)}` : "/api/admin/instructions/link", {
        method: editor.id ? "PATCH" : "POST", body: form,
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error?.message || "Не удалось сохранить карточку.")
      setEditor(null)
      setNotice(editor.id ? "Изменения карточки сохранены." : "Инструкция добавлена в каталог.")
      router.refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить карточку.") }
    finally { setSaving(false) }
  }

  return <>
    {ready && canPublish && <div className="instruction-admin-toolbar"><span>Управление каталогом</span><button type="button" onClick={createCard}>Добавить инструкцию</button></div>}
    {notice && <p className="instruction-admin-notice" role="status">{notice}</p>}
    {error && !editor && !selected && <p className="instruction-admin-error" role="alert">{error}</p>}
    <div className="instruction-grid">
      {items.map((item, index) => {
        const coverUrl = item.coverAssetId
          ? `/api/instruction-media/${item.id}/${item.coverAssetId}`
          : item.hasPdf ? `/api/instructions/${encodeURIComponent(item.slug)}/preview` : null
        const content = <>
          <div className="instruction-cover">{coverUrl ? <img src={coverUrl} alt="" width={720} height={480} loading={index < 2 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "auto"} decoding="async" /> : <span aria-hidden="true">◈</span>}</div>
          <div className="instruction-card-copy"><h2>{item.title}</h2><p>{item.summary}</p><div className="instruction-topics">{item.topics.map((topic) => <span key={topic}>{topic}</span>)}</div></div>
        </>
        return <div className="instruction-admin-shell" key={item.id}>
          <button type="button" className="instruction-card" onClick={() => { setError(""); setSelected(item) }} aria-label={`Открыть инструкцию: ${item.title}`}>
            {content}
          </button>
        </div>
      })}
    </div>

    {selected && (() => {
      const downloadUrl = driveDownloadPath(selected.slug, selected.hasPdf)
      const coverUrl = selected.coverAssetId
        ? `/api/instruction-media/${selected.id}/${selected.coverAssetId}`
        : selected.hasPdf ? `/api/instructions/${encodeURIComponent(selected.slug)}/preview` : null
      return <div className="instruction-admin-backdrop instruction-card-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setSelected(null) }}>
        <section className="instruction-card-dialog" role="dialog" aria-modal="true" aria-labelledby="instruction-card-dialog-title">
          <button type="button" className="instruction-card-dialog-close" onClick={() => setSelected(null)} aria-label="Закрыть">×</button>
          <div className="instruction-card-dialog-cover">
            {coverUrl ? <img src={coverUrl} alt={selected.title} /> : <span aria-hidden="true">◈</span>}
          </div>
          <div className="instruction-card-dialog-content">
            <h2 id="instruction-card-dialog-title">{selected.title}</h2>
            {error && <p className="instruction-admin-error" role="alert">{error}</p>}
            <div className="instruction-card-dialog-actions">
              {downloadUrl
                ? <a href={downloadUrl} rel="noreferrer" referrerPolicy="no-referrer">Скачать PDF</a>
                : <button type="button" disabled>PDF недоступен</button>}
              {ready && canPublish && <button type="button" className="instruction-card-edit-action" onClick={() => void editCard(selected.id)} disabled={loadingId === selected.id}>
                {loadingId === selected.id ? "Открываю…" : "Изменить"}
              </button>}
            </div>
          </div>
        </section>
      </div>
    })()}

    {editor && <div className="instruction-admin-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditor(null) }}>
      <section className="instruction-admin-dialog" role="dialog" aria-modal="true" aria-labelledby="instruction-admin-title">
        <header className="instruction-admin-dialog-heading">
          <div><span>УПРАВЛЕНИЕ ИНСТРУКЦИЯМИ</span><h2 id="instruction-admin-title">{editor.id ? "Изменить инструкцию" : "Добавить инструкцию"}</h2></div>
          <button type="button" onClick={() => setEditor(null)} disabled={saving} aria-label="Закрыть">×</button>
        </header>
        <form className="instruction-admin-form" onSubmit={saveCard}>
          <label>Название<input name="title" defaultValue={editor.title} required maxLength={120} placeholder="Например, LEGO SPIKE 0297" /></label>
          <label>Набор LEGO<select name="kit" defaultValue={editor.kit}><option value="spike">SPIKE Prime</option><option value="ev3">LEGO EV3</option></select></label>
          <label>Описание<textarea name="summary" defaultValue={editor.summary} maxLength={1000} rows={3} placeholder="Коротко опишите модель или сборку" /></label>
          <label>Темы<input name="topics" defaultValue={editor.topics.join(", ")} maxLength={500} placeholder="робот, механизм, SPIKE Prime" /><small>Разделяйте темы запятыми.</small></label>
          <label>Ссылка на PDF в Google Drive<input name="url" type="url" required defaultValue={editor.fileId ? `https://drive.google.com/file/d/${editor.fileId}/view` : ""} placeholder="https://drive.google.com/file/d/…/view" /></label>
          {editor.coverUrl && <div className="instruction-admin-current-cover"><span>Текущая обложка</span><img src={editor.coverUrl} alt="Текущая обложка инструкции" /></div>}
          <label>Новая обложка — необязательно<input name="cover" type="file" accept="image/jpeg,image/png,image/webp" /><small>Загрузите JPG, PNG или WebP до 3 МБ. Если заменить PDF и не выбрать изображение, обложка создастся из первой страницы PDF.</small></label>
          <label className="instruction-admin-rights"><input type="checkbox" name="rights" required /><span>Подтверждаю право на публикацию инструкции и обложки.</span></label>
          {error && <p className="instruction-admin-error" role="alert">{error}</p>}
          <footer><button type="button" className="instruction-admin-cancel" onClick={() => setEditor(null)} disabled={saving}>Отмена</button><button type="submit" disabled={saving}>{saving ? "Сохраняю…" : editor.id ? "Сохранить изменения" : "Опубликовать инструкцию"}</button></footer>
        </form>
      </section>
    </div>}
  </>
}
