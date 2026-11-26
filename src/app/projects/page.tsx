"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Download, FileCode2, MoreHorizontal, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react"
import "../home.css"
import "./projects.css"
import { useAccountProjects } from "@/components/lab/account-projects"
import { HubIllustration } from "@/components/lab/hub-illustrations"
import {
  HUBS,
  importProject,
  makeProject,
  projectName,
  type HubType,
  type RobotProject,
} from "@/lib/projects"
import { countLabel, filterProjects, type HubFilter, type ProjectSort } from "@/lib/project-list"

function createId() {
  return globalThis.crypto?.randomUUID?.() || `project-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date)
}

export default function ProjectsPage() {
  const router = useRouter()
  const library = useAccountProjects()
  const projects = library.projects
  const rawRef = React.useRef<string | null>(null)
  React.useEffect(() => { rawRef.current = library.raw }, [library.raw])

  const [query, setQuery] = React.useState("")
  const [hub, setHub] = React.useState<HubFilter>("all")
  const [sort, setSort] = React.useState<ProjectSort>("updated")
  const [notice, setNotice] = React.useState<{ text: string; error: boolean } | null>(null)
  const [menuId, setMenuId] = React.useState<string | null>(null)
  const [renameId, setRenameId] = React.useState<string | null>(null)
  const [renameValue, setRenameValue] = React.useState("")
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const pickerRef = React.useRef<HTMLDialogElement>(null)
  const renameRef = React.useRef<HTMLDialogElement>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => { if (pickerOpen) pickerRef.current?.showModal(); else pickerRef.current?.close() }, [pickerOpen])
  React.useEffect(() => { if (renameId) renameRef.current?.showModal(); else renameRef.current?.close() }, [renameId])
  React.useEffect(() => {
    if (!menuId) return
    const close = () => setMenuId(null)
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") close() }
    window.addEventListener("pointerdown", close)
    window.addEventListener("keydown", escape)
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", escape) }
  }, [menuId])

  const shown = React.useMemo(() => filterProjects(projects, { query, hub, sort }), [projects, query, hub, sort])

  async function commit(next: RobotProject[]) {
    rawRef.current = await library.save(next, rawRef.current)
  }
  function fail(error: unknown, fallback: string) {
    setNotice({ text: error instanceof Error ? error.message : fallback, error: true })
  }

  async function create(type: HubType) {
    if (busy) return
    if (!library.ready) { setNotice({ text: library.error || "Дождитесь загрузки программ.", error: true }); return }
    setBusy(true)
    try {
      const created = makeProject("Новая программа", type, createId())
      await commit([...projects, created])
      setPickerOpen(false)
      router.push(`/editor?id=${encodeURIComponent(created.id)}`)
    } catch (error) { fail(error, "Не удалось сохранить проект.") } finally { setBusy(false) }
  }

  async function rename(e: React.FormEvent) {
    e.preventDefault()
    const target = projects.find(p => p.id === renameId)
    if (!target) return
    try {
      const name = projectName(renameValue)
      await commit(projects.map(p => p.id === target.id ? { ...p, name, updatedAt: new Date().toISOString() } : p))
      setRenameId(null)
      setNotice({ text: "Название проекта сохранено.", error: false })
    } catch (error) { fail(error, "Не удалось переименовать проект.") }
  }

  async function remove(project: RobotProject) {
    if (!window.confirm(`Удалить проект «${project.name}»?`)) return
    try {
      await commit(projects.filter(p => p.id !== project.id))
      setNotice({ text: "Проект удалён.", error: false })
    } catch (error) { fail(error, "Не удалось удалить проект.") }
  }

  function exportProject(project: RobotProject) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `${project.name.replace(/[\\/:*?"<>|]/g, "-")}.robotproj.json`
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    try {
      if (file.size > 1_000_000) throw new Error("Файл проекта слишком большой.")
      const imported = importProject(await file.text(), createId())
      await commit([...projects, imported])
      setNotice({ text: `Проект «${imported.name}» открыт и сохранён.`, error: false })
    } catch (error) { fail(error, "Не удалось открыть файл.") }
  }

  return (
    <div className="home-shell">
      <div className="home-content">
        <main className="home-main projects-main">
          <header className="projects-head">
            <div>
              <h1>Проекты</h1>
              <p>{countLabel(projects.length)}{shown.length !== projects.length ? ` · найдено ${shown.length}` : ""}</p>
            </div>
            <div className="projects-actions">
              <button type="button" className="home-new-button" onClick={() => setPickerOpen(true)}><Plus size={19} aria-hidden="true" /> Новый проект</button>
              <button type="button" className="home-import" onClick={() => fileRef.current?.click()}><Upload size={17} aria-hidden="true" /> Открыть файл</button>
              <input ref={fileRef} type="file" accept=".json,.robotproj.json,application/json" onChange={importFile} hidden />
            </div>
          </header>

          {library.error && !library.ready && <p role="alert" className="home-notice home-notice-error">{library.error}</p>}
          {notice && <p role="status" className={`home-notice ${notice.error ? "home-notice-error" : "home-notice-success"}`}>{notice.text}</p>}

          <div className="projects-tools">
            <label className="projects-search">
              <Search size={17} aria-hidden="true" />
              <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Найти проект" aria-label="Найти проект" maxLength={64} />
            </label>
            <div className="projects-chips" role="group" aria-label="Тип робота">
              {([["all", "Все"], ["spike", HUBS.spike], ["ev3", HUBS.ev3]] as const).map(([value, label]) => (
                <button key={value} type="button" className="projects-chip" aria-pressed={hub === value} onClick={() => setHub(value)}>{label}</button>
              ))}
            </div>
            <label className="projects-sort">
              <span>Сортировка</span>
              <select value={sort} onChange={e => setSort(e.target.value as ProjectSort)}>
                <option value="updated">Недавно изменённые</option>
                <option value="created">Новые сверху</option>
                <option value="name">По названию</option>
              </select>
            </label>
          </div>

          <ul className="projects-grid" aria-label="Список проектов">
            {!library.ready && projects.length === 0 ? (
              <li className="home-empty">Загружаем проекты…</li>
            ) : projects.length === 0 ? (
              <li className="home-empty">Здесь появятся ваши проекты. Создайте первый, чтобы начать.</li>
            ) : shown.length === 0 ? (
              <li className="home-empty">Ничего не найдено. Измените запрос или фильтр.</li>
            ) : shown.map(project => (
              <li key={project.id} className="projects-card">
                <Link prefetch={false} href={`/editor?id=${encodeURIComponent(project.id)}`} className="projects-card-link" title={`Открыть проект ${project.name}`}>
                  <span className={`projects-card-icon is-${project.hub}`} aria-hidden="true"><FileCode2 size={26} /></span>
                  <span className="projects-card-copy">
                    <strong>{project.name}</strong>
                    <small>{HUBS[project.hub]}</small>
                    <small>Изменён {formatDate(project.updatedAt)}</small>
                  </span>
                </Link>
                <div className="projects-card-menu" onPointerDown={e => e.stopPropagation()}>
                  <button type="button" className="home-project-menu" aria-haspopup="menu" aria-expanded={menuId === project.id} aria-label={`Действия с проектом ${project.name}`} onClick={() => setMenuId(menuId === project.id ? null : project.id)}><MoreHorizontal size={18} aria-hidden="true" /></button>
                  {menuId === project.id && (
                    <div className="projects-menu" role="menu">
                      <button role="menuitem" type="button" onClick={() => { setMenuId(null); setRenameValue(project.name); setRenameId(project.id) }}><Pencil size={15} aria-hidden="true" /> Переименовать</button>
                      <button role="menuitem" type="button" onClick={() => { setMenuId(null); exportProject(project) }}><Download size={15} aria-hidden="true" /> Скачать файл</button>
                      <button role="menuitem" type="button" className="is-danger" onClick={() => { setMenuId(null); void remove(project) }}><Trash2 size={15} aria-hidden="true" /> Удалить</button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </main>
      </div>

      <dialog ref={pickerRef} className="program-picker" aria-labelledby="projects-picker-title" onCancel={e => { if (busy) e.preventDefault(); else setPickerOpen(false) }} onClose={() => setPickerOpen(false)}>
        <div className="program-picker-head">
          <h2 id="projects-picker-title">Выберите робота</h2>
          <button type="button" className="program-picker-close" disabled={busy} onClick={() => setPickerOpen(false)} aria-label="Закрыть выбор робота"><X size={20} aria-hidden="true" /></button>
        </div>
        <div className="program-picker-grid">
          {(["ev3", "spike"] as const).map(type => (
            <button type="button" key={type} autoFocus={type === "ev3"} disabled={busy} className="program-picker-card" onClick={() => void create(type)}>
              <span className="program-picker-stage" aria-hidden="true"><HubIllustration hub={type} /></span>
              <span className="program-picker-label">{HUBS[type]}</span>
            </button>
          ))}
        </div>
      </dialog>

      <dialog ref={renameRef} className="program-picker" aria-labelledby="projects-rename-title" onCancel={() => setRenameId(null)} onClose={() => setRenameId(null)}>
        <form onSubmit={rename} className="projects-rename">
          <h2 id="projects-rename-title">Название проекта</h2>
          <input autoFocus required maxLength={64} value={renameValue} onChange={e => setRenameValue(e.target.value)} aria-label="Название проекта" />
          <div className="program-picker-footer">
            <button type="button" className="program-picker-cancel" onClick={() => setRenameId(null)}>Отмена</button>
            <button type="submit" className="home-new-button">Сохранить</button>
          </div>
        </form>
      </dialog>
    </div>
  )
}
