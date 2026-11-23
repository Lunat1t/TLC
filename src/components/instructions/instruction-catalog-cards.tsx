"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, type FormEvent } from "react"
import { useAccess } from "@/components/auth/access-provider"
import { driveDownloadPath } from "@/lib/instructions/drive-links"
import type { CatalogCard } from "@/lib/instructions/types"
import "./instruction-catalog-admin.css"

type EditorData = {
  id: string
  title: string
  summary: string
  kit: "spike" | "ev3"
  topics: string[]
  fileId: string
  coverUrl: string | null
}

type CatalogProps = {
  items: CatalogCard[]
  nextCursor: string | null
  kit: string
  query: string
  totalCount: number | null
}

export function InstructionCatalogCards({ items, nextCursor, kit, query, totalCount }: CatalogProps) {
  const router = useRouter()
  const { canPublish, ready } = useAccess()
  const [cards, setCards] = useState(items)
  const [cursor, setCursor] = useState(nextCursor)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState("")

  useEffect(() => {
    setCards(items)
    setCursor(nextCursor)
    setMoreError("")
  }, [items, nextCursor])

  async function loadMore() {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    setMoreError("")
    try {
      const params = new URLSearchParams({ cursor })
      if (kit) params.set("kit", kit)
      if (query) params.set("q", query)
      const response = await fetch("/api/instructions?" + params.toString(), { cache: "no-store" })
      const body = await response.json()
      if (!response.ok || !Array.isArray(body.items)) {
        throw new Error(body.error?.message || "Не удалось загрузить следующие инструкции.")
      }
      setCards((previous) => {
        const seen = new Set(previous.map((item) => item.id))
        return [...previous, ...((body.items as CatalogCard[]).filter((item) => !seen.has(item.id)))]
      })
      setCursor(typeof body.nextCursor === "string" ? body.nextCursor : null)
    } catch (cause) {
      setMoreError(cause instanceof Error ? cause.message : "Не удалось загрузить инструкции.")
    } finally {
      setLoadingMore(false)
    }
  }
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

  async function saveCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor) return
    const form = new FormData(event.currentTarget)
    form.set("topics", JSON.stringify(String(form.get("topics") || "").split(",").map((topic) => topic.trim()).filter(Boolean)))
    setSaving(true); setError(""); setNotice("")
    try {
      const response = await fetch(`/api/admin/instructions/${encodeURIComponent(editor.id)}`, { method: "PATCH", body: form })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error?.message || "Не удалось сохранить карточку.")
      setEditor(null)
      setNotice("Изменения карточки сохранены.")
      router.refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить карточку.") }
    finally { setSaving(false) }
  }

  return <>
    {notice && <p className="instruction-admin-notice" role="status">{notice}</p>}
    {error && !editor && !selected && <p className="instruction-admin-error" role="alert">{error}</p>}
    <div className={"instruction-grid" + (kit === "spike" ? " instruction-grid--spike" : "")}>
      {cards.map((item, index) => {
        const coverUrl = item.coverAssetId
          ? `/api/instruction-media/${item.id}/${item.coverAssetId}`
          : item.hasPdf ? `/api/instructions/${encodeURIComponent(item.slug)}/preview` : null
        const code = item.title.match(/\((\d{4})\)/)?.[1]
        const content = <>
          <div className="instruction-cover">
            <div className="instruction-cover-placeholder" aria-hidden="true">
              <span className="instruction-cover-placeholder-icon">◈</span>
              <span>{item.kit === "spike" ? "SPIKE Prime" : "LEGO EV3"}</span>
            </div>
            {coverUrl && <img src={coverUrl} alt="" width={720} height={480} loading={index < 2 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "auto"} decoding="async" onError={(event) => { event.currentTarget.style.display = "none" }} />}
          </div>
          {item.kit === "spike"
            ? <><h2 className="instruction-card-title">{item.title}</h2><div className="instruction-card-meta"><strong>{code ? "№ " + code : "SPIKE Prime"}</strong><span>{item.hasPdf ? "PDF" : "Сборка"}</span></div></>
            : <div className="instruction-card-copy"><h2>{item.title}</h2><p>{item.summary}</p><div className="instruction-topics">{item.topics.map((topic) => <span key={topic}>{topic}</span>)}</div></div>}
        </>
        return <div className="instruction-admin-shell" key={item.id}>
          <button type="button" className="instruction-card" onClick={() => { setError(""); setSelected(item) }} aria-label={`Открыть инструкцию: ${item.title}`}>
            {content}
          </button>
        </div>
      })}
    </div>
    <footer className="instruction-catalog-pagination">
      <p aria-live="polite">{"Показано " + cards.length + (totalCount !== null ? " из " + totalCount : "") + " инструкций"}</p>
      {moreError && <p role="alert" className="instruction-admin-error">{moreError}</p>}
      {cursor && <button type="button" className="instruction-load-more" onClick={() => void loadMore()} disabled={loadingMore}>
        {loadingMore ? "Загружаем…" : "Показать ещё 20"}
      </button>}
    </footer>

    {selected && (() => {
      const downloadUrl = driveDownloadPath(selected.slug, selected.hasPdf)
      const coverUrl = selected.coverAssetId
        ? `/api/instruction-media/${selected.id}/${selected.coverAssetId}`
        : selected.hasPdf ? `/api/instructions/${encodeURIComponent(selected.slug)}/preview` : null
      return <div className="instruction-admin-backdrop instruction-card-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setSelected(null) }}>
        <section className="instruction-card-dialog" role="dialog" aria-modal="true" aria-labelledby="instruction-card-dialog-title">
          <button type="button" className="instruction-card-dialog-close" onClick={() => setSelected(null)} aria-label="Закрыть">×</button>
          <div className="instruction-card-dialog-cover">
            <span className="instruction-modal-placeholder" aria-hidden="true">◈</span>
            {coverUrl && <img src={coverUrl} alt={selected.title} onError={(event) => { event.currentTarget.style.display = "none" }} />}
          </div>
          <div className="instruction-card-dialog-content">
            <h2 id="instruction-card-dialog-title">{selected.title}</h2>
            {error && <p className="instruction-admin-error" role="alert">{error}</p>}
            <div className="instruction-card-dialog-actions">
              {downloadUrl
                ? <><a href={`/instructions/${selected.slug}/read`}>Читать инструкцию</a><a href={downloadUrl} rel="noreferrer" referrerPolicy="no-referrer">Скачать PDF</a></>
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
          <footer><button type="button" className="instruction-admin-cancel" onClick={() => setEditor(null)} disabled={saving}>Отмена</button><button type="submit" disabled={saving}>{saving ? "Сохраняю…" : "Сохранить изменения"}</button></footer>
        </form>
      </section>
    </div>}
  </>
}
