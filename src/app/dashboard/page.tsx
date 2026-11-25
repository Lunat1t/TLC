"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Download, FolderOpen, Plus, Upload, MoreHorizontal, X } from "lucide-react"
import "../home.css"
import { LabBoard } from "@/components/lab/lab-board"
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

function createId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `project-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
}

function countLabel(count: number) {
  const ending =
    count % 10 === 1 && count % 100 !== 11
      ? "проект"
      : count % 10 >= 2 &&
          count % 10 <= 4 &&
          (count % 100 < 12 || count % 100 > 14)
        ? "проекта"
        : "проектов"
  return `${count} ${ending}`
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? ""
    : new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(date)
}

type InstallPromptEvent = Event & { prompt: () => Promise<void> }

function InstallAppButton() {
  const installPrompt = React.useRef<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = React.useState(true)

  React.useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    setInstalled(standalone)
    if ("serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {})
    }
    const onPrompt = (event: Event) => {
      event.preventDefault()
      installPrompt.current = event as InstallPromptEvent
    }
    const onInstalled = () => {
      installPrompt.current = null
      setInstalled(true)
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  if (installed) return null

  async function install() {
    if (installPrompt.current) {
      const pending = installPrompt.current
      installPrompt.current = null
      await pending.prompt()
      return
    }
    const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    window.alert(apple
      ? "В Safari нажмите «Поделиться» → «На экран Домой» → «Добавить»."
      : "Откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран».")
  }

  return <button type="button" onClick={() => void install()} className="home-install"><Download size={17} aria-hidden="true" /> Установить на главный экран</button>
}

export default function HomePage() {
  const router = useRouter()
  const [projectsOpen, setProjectsOpen] = React.useState(false)
  const projectsCloseRef = React.useRef<HTMLButtonElement>(null)
  const projectsLauncherRef = React.useRef<HTMLElement | null>(null)
  function openProjects() { projectsLauncherRef.current = document.activeElement as HTMLElement | null; setProjectsOpen(true) }
  function closeProjects() { setProjectsOpen(false); projectsLauncherRef.current?.focus() }
  React.useEffect(()=> { if (projectsOpen) projectsCloseRef.current?.focus() }, [projectsOpen])
  const library = useAccountProjects()
  const projects = library.projects
  const [copyingLocal, setCopyingLocal] = React.useState(false)
  const [autoImporting, setAutoImporting] = React.useState(false)
  const autoImportStartedRef = React.useRef<string | null>(null)
  const [notice, setNotice] = React.useState<{
    text: string
    isError: boolean
  } | null>(null)

  const [newOpen, setNewOpen] = React.useState(false)
  const newDialogRef=React.useRef<HTMLDialogElement>(null)
  React.useEffect(()=>{if(newOpen)newDialogRef.current?.showModal();else newDialogRef.current?.close()},[newOpen])
  const [creating,setCreating]=React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [renameOpen, setRenameOpen] = React.useState(false)
  const [renameValue, setRenameValue] = React.useState("")
  const [renameError, setRenameError] = React.useState<string | null>(null)

  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const draftsRef = React.useRef<HTMLDetailsElement | null>(null)
  const shouldExpandDrafts = Boolean(library.userId && library.drafts.length > 0)
  React.useEffect(() => {
    if (!shouldExpandDrafts) return
    const syncDraftsHash = () => {
      const recover = new URLSearchParams(window.location.search).get("recover") === "1"
      if (window.location.hash === "#drafts" || recover) {
        if (draftsRef.current) {
          draftsRef.current.open = true
          draftsRef.current.scrollIntoView({ block: "nearest" })
        }
      }
    }
    syncDraftsHash()
    window.addEventListener("hashchange", syncDraftsHash)
    window.addEventListener("popstate", syncDraftsHash)
    return () => {
      window.removeEventListener("hashchange", syncDraftsHash)
      window.removeEventListener("popstate", syncDraftsHash)
    }
  }, [shouldExpandDrafts])
  const storageRawRef = React.useRef<string | null>(null)
  React.useEffect(() => { storageRawRef.current = library.raw }, [library.raw])

  function downloadBackup(raw: string | null, filename = "tlc-browser-programs-backup.json") {
    if (raw === null) return
    const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }))
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  React.useEffect(() => {
    if (!library.ready || !library.userId) return
    const userId = library.userId
    if (autoImportStartedRef.current === userId) return
    let flagged = false
    try {
      flagged = sessionStorage.getItem("tlc.auto-import-local") === userId
    } catch {
      flagged = false
    }
    if (!flagged) return
    autoImportStartedRef.current = userId
    if (library.localCount === 0) {
      try { sessionStorage.removeItem("tlc.auto-import-local") } catch {}
      return
    }
    setAutoImporting(true)
    void library.copyLocalPrograms({ clearLocal: true }).then((count) => {
      try { sessionStorage.removeItem("tlc.auto-import-local") } catch {}
      if (count > 0) {
        setNotice({ text: `Перенесено в аккаунт: ${countLabel(count)}.`, isError: false })
      }
    }).catch((error) => {
      setNotice({ text: error instanceof Error ? error.message : "Не удалось перенести локальные программы.", isError: true })
    }).finally(() => {
      setAutoImporting(false)
    })
  }, [library.ready, library.userId, library.localCount, library.copyLocalPrograms])

  async function copyLocalPrograms() {
    if (copyingLocal) return
    setCopyingLocal(true)
    try {
      const count = await library.copyLocalPrograms({ clearLocal: true })
      setNotice({
        text: count > 0 ? `Перенесено в аккаунт: ${countLabel(count)}.` : "Локальные программы уже есть в аккаунте.",
        isError: false,
      })
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Не удалось перенести программы.", isError: true })
    } finally { setCopyingLocal(false) }
  }

  async function dismissLocalImport() {
    if (copyingLocal) return
    await library.dismissLocalImport()
  }

  const selectedProject = React.useMemo(
    () => projects.find((p) => p.id === selectedId) || null,
    [projects, selectedId]
  )

  async function commit(next: RobotProject[]) {
    storageRawRef.current = await library.save(next, storageRawRef.current)
  }

  function openNewModal() {
    if (!library.ready) { setNotice({ text: library.error || "Дождитесь загрузки программ.", isError: true }); return }
    setFormError(null)
    setNewOpen(true)
  }

  async function handleCreateProject(hub:HubType) {
    if(creating)return
    setCreating(true)
    try {
      const created = makeProject("Новая программа", hub, createId())
      await commit([...projects, created])
      setNewOpen(false)
      setNotice({ text: `Проект «${created.name}» создан.`, isError: false })
      router.push(`/editor?id=${encodeURIComponent(created.id)}`)
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Не удалось сохранить проект."
      )
    } finally {setCreating(false)}
  }

  async function handleRenameProject(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedProject) return
    try {
      const cleanName = projectName(renameValue)
      await commit(
        projects.map((p) =>
          p.id === selectedProject.id
            ? { ...p, name: cleanName, updatedAt: new Date().toISOString() }
            : p
        )
      )
      setRenameOpen(false)
      setNotice({ text: "Название проекта сохранено.", isError: false })
    } catch (err) {
      setRenameError(
        err instanceof Error ? err.message : "Не удалось переименовать проект."
      )
    }
  }

  async function handleDeleteProject() {
    if (
      !selectedProject ||
      !window.confirm(`Удалить проект «${selectedProject.name}»?`)
    ) {
      return
    }
    try {
      await commit(projects.filter((p) => p.id !== selectedProject.id))
      setSelectedId(null)
      setNotice({ text: "Проект удалён.", isError: false })
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : "Не удалось удалить проект.", isError: true })
    }
  }

  function handleExportProject() {
    if (!selectedProject) return
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(selectedProject, null, 2)], {
        type: "application/json",
      })
    )
    const link = document.createElement("a")
    link.href = url
    link.download = `${selectedProject.name.replace(/[\\/:*?"<>|]/g, "-")}.robotproj.json`
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    try {
      if (file.size > 1_000_000) {
        throw new Error("Файл проекта слишком большой.")
      }
      const imported = importProject(await file.text(), createId())
      await commit([...projects, imported])
      setSelectedId(imported.id)
      setNotice({
        text: `Проект «${imported.name}» открыт и сохранён.`,
        isError: false,
      })
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : "Не удалось открыть файл.",
        isError: true,
      })
    }
  }

  const sortedProjects = React.useMemo(
    () =>
      projects
        .slice()
        .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt))),
    [projects]
  )

  return (
    <div className="home-shell">
      <div className="home-content">
        <main className="home-main">
          {(library.error || !library.ready || (library.userId && (library.saving || autoImporting))) && (
            <div className="mb-4 flex flex-wrap items-center gap-3 text-sm" aria-label="Хранилище программ">
              {library.error ? (
                <span role="status">{library.error}</span>
              ) : !library.ready ? (
                <span role="status">Загружаем программы…</span>
              ) : (
                <span role="status">Сохраняем в облако…</span>
              )}
            </div>
          )}
          {library.userId && library.ready && library.localCount > 0 && !autoImporting && (
            <div
              role="region"
              aria-label="Перенос программ с этого устройства"
              className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-900"
            >
              <span>
                На этом устройстве есть {countLabel(library.localCount)}. Перенести их в ваш аккаунт?
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-[#55445a] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#302c2b] disabled:opacity-50"
                  disabled={copyingLocal}
                  onClick={() => void copyLocalPrograms()}
                >
                  {copyingLocal ? "Переносим…" : "Перенести"}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-bold text-stone-700 hover:bg-stone-100 disabled:opacity-50"
                  disabled={copyingLocal}
                  onClick={() => void dismissLocalImport()}
                >
                  Пропустить
                </button>
              </div>
            </div>
          )}
          {library.userId && library.drafts.length > 0 && <details id="drafts" ref={draftsRef} className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
            <summary>Несохранённые программы на этом устройстве ({library.drafts.length})</summary>
            <p className="my-2">Можно восстановить правки в аккаунте или скачать отдельную копию. При конфликте с другим устройством копия сохранится здесь.</p>
            {library.drafts.map(draft => {
              const program = draft.projects.find(item => item.id === draft.projectId)
              return <div key={draft.key} className="flex flex-wrap items-center gap-3 py-1">
                <strong>{program?.name || "Программа"}</strong>
                <time dateTime={draft.savedAt}>{new Date(draft.savedAt).toLocaleString("ru-RU")}</time>
                <button type="button" className="home-import" disabled={!library.ready || library.saving} onClick={async () => {
                  if (!window.confirm("Восстановить эту копию программы в текущем аккаунте? Изменения с другого устройства будут проверены перед сохранением.")) return
                  try { await library.restoreDraft(draft); setNotice({ text: "Копия восстановлена в аккаунте.", isError: false }) }
                  catch (error) { setNotice({ text: error instanceof Error ? error.message : "Не удалось восстановить копию.", isError: true }) }
                }}>Восстановить</button>
                <button type="button" className="home-import" onClick={() => downloadBackup(JSON.stringify(program || draft.projects), "tlc-recovered-program.robotproj.json")}>Скачать копию</button>
              </div>
            })}
          </details>}
          {notice && <p role="status" className={`home-notice ${notice.isError ? "home-notice-error" : "home-notice-success"}`}>{notice.text}</p>}
          <LabBoard projects={projects} onProjects={openProjects} onNewProject={openNewModal} onProjectMenu={id=>{const p=projects.find(p=>p.id===id);if(p){setSelectedId(id);setRenameValue(p.name);setRenameError(null);setRenameOpen(true)}}}  onDeleteProject={async id=>{const project=projects.find(p=>p.id===id);if(!project||!window.confirm(`Удалить программу «${project.name}»?`))return;try{await commit(projects.filter(p=>p.id!==id))}catch(e){setNotice({text:e instanceof Error?e.message:"Не удалось удалить программу.",isError:true})}}} />
          {projectsOpen && <section className="desktop-project-window" aria-label="Мои проекты"><header><strong>Мои проекты</strong><button ref={projectsCloseRef} onClick={closeProjects} aria-label="Закрыть окно проектов"><X size={20}/></button></header>
          <div className="home-main-toolbar">
            <button type="button" onClick={openNewModal} className="home-new-button">
              <Plus size={19} aria-hidden="true" /> Новый проект
            </button>
            <div className="home-secondary-actions">
              <InstallAppButton />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="home-import"><Upload size={17} aria-hidden="true" /> Открыть файл проекта</button>
              <input ref={fileInputRef} type="file" accept=".json,.robotproj.json,application/json" onChange={handleFileImport} hidden />
            </div>
          </div>
          <div className="home-projects-heading">
            <h2>Мои проекты</h2>
            <span>{countLabel(projects.length)}</span>
          </div>
          <nav className="home-project-list" aria-label="Список проектов">
            {sortedProjects.length === 0 ? (
              <p className="home-empty">Здесь появятся ваши проекты. Создайте первый, чтобы начать.</p>
            ) : sortedProjects.map((project) => (
              <div key={project.id} className="home-project-item">
                <Link prefetch={false} href={`/editor?id=${encodeURIComponent(project.id)}`} className="home-project-row" title={`Открыть проект ${project.name}`}>
                  <FolderOpen size={19} aria-hidden="true" />
                  <span className="home-project-copy"><strong>{project.name}</strong><small>{HUBS[project.hub]} · {formatDate(project.updatedAt)}</small></span>
                </Link>
                <button type="button" onClick={() => setSelectedId(project.id)} className="home-project-menu" aria-label={`Действия с проектом ${project.name}`} title="Действия с проектом"><MoreHorizontal size={18} aria-hidden="true" /></button>
              </div>
            ))}
          </nav>
          </section>}
        </main>
      </div>

      <dialog
        ref={newDialogRef}
        onCancel={(e) => {
          if (creating) e.preventDefault()
          else setNewOpen(false)
        }}
        onClose={() => setNewOpen(false)}
        aria-labelledby="program-picker-title"
        className="program-picker"
      >
        <div className="program-picker-head">
          <h2 id="program-picker-title">Выберите робота</h2>
          <button
            type="button"
            className="program-picker-close"
            disabled={creating}
            onClick={() => setNewOpen(false)}
            aria-label="Закрыть выбор робота"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="program-picker-grid">
          {(["ev3", "spike"] as const).map((hub) => (
            <button
              type="button"
              autoFocus={hub === "ev3"}
              disabled={creating}
              key={hub}
              className="program-picker-card"
              onClick={() => void handleCreateProject(hub)}
            >
              <span className="program-picker-stage" aria-hidden="true">
                <HubIllustration hub={hub} />
              </span>
              <span className="program-picker-label">{HUBS[hub]}</span>
            </button>
          ))}
        </div>
        <p className="program-picker-hint">
          Bluetooth к роботу работает в Chrome/Edge (ПК и Android); в любом браузере программу можно скачать как <code>.py</code>.
        </p>
        {formError && (
          <p role="alert" className="program-picker-error">
            {formError}
          </p>
        )}
        <div className="program-picker-footer">
          <button
            type="button"
            disabled={creating}
            onClick={() => setNewOpen(false)}
            className="program-picker-cancel"
          >
            Отмена
          </button>
        </div>
      </dialog>

      {selectedProject && !renameOpen && (
        <div className="fixed inset-0 z-[12100] bg-[var(--home-overlay)] backdrop-blur-xs grid place-items-center p-4">
          <div className="w-full max-w-[480px] rounded-md bg-white p-7 shadow-2xl">
            <p className="text-xs font-bold text-[var(--home-blue)] mb-2">
              ПРОЕКТ
            </p>
            <h2 className="text-[28px] font-bold text-[var(--home-ink)] mb-2 break-words">
              {selectedProject.name}
            </h2>
            <p className="text-sm text-[var(--home-muted)] mb-4">
              {HUBS[selectedProject.hub]} · создан{" "}
              {formatDate(selectedProject.createdAt)}
            </p>
            <p className="p-3.5 rounded-md bg-[var(--home-rail)] text-[var(--home-muted)] text-sm">
              Откройте рабочую область, чтобы размещать блоки на доске.
            </p>
            <div className="flex flex-wrap gap-2 mt-5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setRenameValue(selectedProject.name)
                  setRenameError(null)
                  setRenameOpen(true)
                }}
              >
                Переименовать
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportProject}
              >
                Скачать файл
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDeleteProject}
              >
                Удалить
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2.5 mt-7">
              {selectedProject.hub === "spike" && (
                <a
                  href={`/editor?id=${encodeURIComponent(selectedProject.id)}`}
                  className="mr-auto text-[13px] font-bold text-[var(--home-blue)] hover:underline"
                >
                  Открыть управление в редакторе
                </a>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedId(null)}
              >
                Закрыть
              </Button>
              <Link
                href={`/editor?id=${encodeURIComponent(selectedProject.id)}`}
                className="inline-flex items-center justify-center rounded-md bg-[var(--home-dark)] text-white min-h-[50px] px-6 py-3 text-sm font-bold hover:bg-[var(--home-blue)]"
              >
                Открыть редактор
              </Link>
            </div>
          </div>
        </div>
      )}

      {selectedProject && renameOpen && (
        <div className="fixed inset-0 z-[12100] bg-[var(--home-overlay)] backdrop-blur-xs grid place-items-center p-4">
          <div className="w-full max-w-[480px] rounded-md bg-white p-7 shadow-2xl">
            <form onSubmit={handleRenameProject}>
              <p className="text-xs font-bold text-[var(--home-blue)] mb-2">
                ПРОЕКТ
              </p>
              <h2 className="text-[28px] font-bold text-[var(--home-ink)] mb-5">
                Переименовать
              </h2>
              <div className="grid gap-2">
                <Label htmlFor="renameInput">Новое название</Label>
                <Input
                  id="renameInput"
                  maxLength={64}
                  required
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                />
              </div>
              {renameError && (
                <p className="text-[13px] text-[var(--home-error)] mt-3">{renameError}</p>
              )}
              <div className="flex justify-end gap-2.5 mt-7">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRenameOpen(false)}
                >
                  Отмена
                </Button>
                <Button type="submit">Сохранить</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
