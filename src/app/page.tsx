"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Download, FolderOpen, Plus, Upload, MoreHorizontal, UserRound } from "lucide-react"
import "./home.css"
import {
  loadAuthState,
  signOutFromSupabase,
  syncSessionFromSupabase,
  type AuthState,
} from "@/lib/auth"
import {
  HUBS,
  importProject,
  loadProjects,
  makeProject,
  projectName,
  saveEditorProjects,
  STORAGE_KEY,
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
  const [projects, setProjects] = React.useState<RobotProject[]>([])
  const [auth, setAuth] = React.useState<AuthState>(() => loadAuthState(null))
  const [notice, setNotice] = React.useState<{
    text: string
    isError: boolean
  } | null>(null)

  const [newOpen, setNewOpen] = React.useState(false)
  const [newName, setNewName] = React.useState("")
  const [newHub, setNewHub] = React.useState<HubType>("spike")
  const [formError, setFormError] = React.useState<string | null>(null)

  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [renameOpen, setRenameOpen] = React.useState(false)
  const [renameValue, setRenameValue] = React.useState("")
  const [renameError, setRenameError] = React.useState<string | null>(null)

  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const storageRawRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    try {
      storageRawRef.current = window.localStorage.getItem(STORAGE_KEY)
      setProjects(loadProjects(window.localStorage))
      setAuth(loadAuthState(window.localStorage))
      void syncSessionFromSupabase(window.localStorage).then((synced) => {
        setAuth(synced)
      })
    } catch {
      setNotice({
        text: "Список проектов не удалось прочитать. Проверьте хранилище браузера.",
        isError: true,
      })
    }
  }, [])

  const selectedProject = React.useMemo(
    () => projects.find((p) => p.id === selectedId) || null,
    [projects, selectedId]
  )

  async function commit(next: RobotProject[]) {
    storageRawRef.current = await saveEditorProjects(window.localStorage, next, storageRawRef.current, navigator.locks)
    setProjects(next)
  }

  function openNewModal() {
    setNewName("")
    setFormError(null)
    setNewOpen(true)
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault()
    try {
      const created = makeProject(newName, newHub, createId())
      await commit([...projects, created])
      setNewOpen(false)
      setNotice({ text: `Проект «${created.name}» создан.`, isError: false })
      router.push(`/editor?id=${encodeURIComponent(created.id)}`)
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Не удалось сохранить проект."
      )
    }
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
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [projects]
  )

  return (
    <div className="home-shell">
      <div className="home-content">
        <header className="home-header">
          <div className="home-header-actions">
            {auth.user ? <span className="home-profile"><UserRound size={18} aria-hidden="true" /><span>{auth.user.nickname}</span></span> : <Link href="/login" className="home-profile"><UserRound size={18} aria-hidden="true" /><span>Войти</span></Link>}
            {auth.user && <button type="button" className="home-signout" onClick={async () => {
              const next = await signOutFromSupabase(window.localStorage)
              setAuth(next)
              setNotice({ text: "Вы вышли из аккаунта.", isError: false })
            }}>Выйти</button>}
          </div>
        </header>

        <main className="home-main">
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
            <h1>Мои проекты</h1>
            <span>{countLabel(projects.length)}</span>
          </div>
          <nav className="home-project-list" aria-label="Список проектов">
            {sortedProjects.length === 0 ? (
              <p className="home-empty">Здесь появятся ваши проекты. Создайте первый, чтобы начать.</p>
            ) : sortedProjects.map((project) => (
              <div key={project.id} className="home-project-item">
                <Link href={`/editor?id=${encodeURIComponent(project.id)}`} className="home-project-row" title={`Открыть проект ${project.name}`}>
                  <FolderOpen size={19} aria-hidden="true" />
                  <span className="home-project-copy"><strong>{project.name}</strong><small>{HUBS[project.hub]} · {formatDate(project.updatedAt)}</small></span>
                </Link>
                <button type="button" onClick={() => setSelectedId(project.id)} className="home-project-menu" aria-label={`Действия с проектом ${project.name}`} title="Действия с проектом"><MoreHorizontal size={18} aria-hidden="true" /></button>
              </div>
            ))}
          </nav>
          {notice && <p role="status" className={`home-notice ${notice.isError ? "home-notice-error" : "home-notice-success"}`}>{notice.text}</p>}
        </main>
      </div>

      {newOpen && (
        <div className="fixed inset-0 z-50 bg-[var(--home-overlay)] backdrop-blur-xs grid place-items-center p-4">
          <div className="w-full max-w-[480px] rounded-[23px] bg-white p-7 shadow-2xl">
            <form onSubmit={handleCreateProject}>
              <p className="text-xs font-bold text-[var(--home-blue)] mb-2">
                Новый проект
              </p>
              <h2 className="text-[28px] font-black text-[var(--home-ink)] mb-5">
                Что будем создавать?
              </h2>
              <div className="grid gap-2">
                <Label htmlFor="projectName">Название проекта</Label>
                <Input
                  id="projectName"
                  maxLength={64}
                  required
                  autoFocus
                  placeholder="Например, мой робот"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>

              <fieldset className="mt-6 grid gap-2.5">
                <legend className="text-sm font-bold text-[var(--home-ink)] mb-2.5">
                  Выберите робота
                </legend>
                {(["spike", "ev3"] as const).map((h) => (
                  <label
                    key={h}
                    className={`flex items-center gap-3 p-3 rounded-[13px] border cursor-pointer min-h-[75px] ${
                      newHub === h
                        ? "border-[var(--home-blue)] bg-[var(--home-cyan-soft)] "
                        : "border-[var(--home-line)]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="hub"
                      value={h}
                      checked={newHub === h}
                      onChange={() => setNewHub(h)}
                      className="w-4 h-4 accent-[var(--home-blue)]"
                    />
                    <span
                      className={`grid place-items-center w-12 h-12 rounded-[13px] text-[28px] font-black ${
                        h === "spike"
                          ? "bg-[var(--home-cyan-soft)] text-[var(--home-blue)]"
                          : "bg-[var(--home-ev3-soft)] text-[var(--home-ev3)]"
                      }`}
                    >
                      {h === "spike" ? "▦" : "▣"}
                    </span>
                    <span className="flex flex-col">
                      <strong className="text-[15px] text-[var(--home-ink)]">
                        {HUBS[h]}
                      </strong>
                      <small className="text-xs text-[var(--home-muted)]">
                        {h === "spike" ? "Хаб с портами A–F" : "Хаб с портами A–D"}
                      </small>
                    </span>
                  </label>
                ))}
              </fieldset>

              {formError && (
                <p className="text-[13px] text-[var(--home-error)] mt-3">{formError}</p>
              )}

              <div className="flex justify-end gap-2.5 mt-7">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNewOpen(false)}
                >
                  Отмена
                </Button>
                <Button type="submit">Создать проект</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedProject && !renameOpen && (
        <div className="fixed inset-0 z-50 bg-[var(--home-overlay)] backdrop-blur-xs grid place-items-center p-4">
          <div className="w-full max-w-[480px] rounded-[23px] bg-white p-7 shadow-2xl">
            <p className="text-xs font-bold text-[var(--home-blue)] mb-2">
              ПРОЕКТ
            </p>
            <h2 className="text-[28px] font-black text-[var(--home-ink)] mb-2 break-words">
              {selectedProject.name}
            </h2>
            <p className="text-sm text-[var(--home-muted)] mb-4">
              {HUBS[selectedProject.hub]} · создан{" "}
              {formatDate(selectedProject.createdAt)}
            </p>
            <p className="p-3.5 rounded-xl bg-[var(--home-rail)] text-[var(--home-muted)] text-sm">
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
                className="inline-flex items-center justify-center rounded-full bg-[var(--home-dark)] text-white min-h-[50px] px-6 py-3 text-sm font-extrabold hover:bg-[var(--home-blue)]"
              >
                Открыть редактор
              </Link>
            </div>
          </div>
        </div>
      )}

      {selectedProject && renameOpen && (
        <div className="fixed inset-0 z-50 bg-[var(--home-overlay)] backdrop-blur-xs grid place-items-center p-4">
          <div className="w-full max-w-[480px] rounded-[23px] bg-white p-7 shadow-2xl">
            <form onSubmit={handleRenameProject}>
              <p className="text-xs font-bold text-[var(--home-blue)] mb-2">
                ПРОЕКТ
              </p>
              <h2 className="text-[28px] font-black text-[var(--home-ink)] mb-5">
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
