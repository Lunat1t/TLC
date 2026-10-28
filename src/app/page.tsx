"use client"

import * as React from "react"
import Link from "next/link"
import { LiveOrb } from "@/components/ui/live-orb"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { loadAuthState, type AuthState } from "@/lib/auth"
import {
  HUBS,
  importProject,
  loadProjects,
  makeProject,
  projectName,
  saveProjects,
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

export default function HomePage() {
  const [hubChoice, setHubChoice] = React.useState<HubType>("spike")
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

  React.useEffect(() => {
    try {
      setProjects(loadProjects(window.localStorage))
      setAuth(loadAuthState(window.localStorage))
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

  function commit(next: RobotProject[]) {
    const clean = saveProjects(window.localStorage, next)
    setProjects(clean)
  }

  function openNewModal() {
    setNewName("")
    setNewHub(hubChoice)
    setFormError(null)
    setNewOpen(true)
  }

  function handleCreateProject(e: React.FormEvent) {
    e.preventDefault()
    try {
      const created = makeProject(newName, newHub, createId())
      commit([...projects, created])
      setNewOpen(false)
      setNotice({ text: `Проект «${created.name}» создан.`, isError: false })
      window.location.assign(`/editor.html?id=${encodeURIComponent(created.id)}`)
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Не удалось сохранить проект."
      )
    }
  }

  function handleRenameProject(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedProject) return
    try {
      const cleanName = projectName(renameValue)
      commit(
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

  function handleDeleteProject() {
    if (
      !selectedProject ||
      !window.confirm(`Удалить проект «${selectedProject.name}»?`)
    ) {
      return
    }
    commit(projects.filter((p) => p.id !== selectedProject.id))
    setSelectedId(null)
    setNotice({ text: "Проект удалён.", isError: false })
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
      commit([...projects, imported])
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
    <div className="min-h-dvh flex flex-col bg-[#f8fafb]">
      <header className="min-h-[78px] px-5 md:px-16 py-3.5 flex items-center justify-between gap-4 bg-[#02c7ea]">
        <Link
          href="/"
          className="text-[19px] font-black tracking-wide text-[#002c39]"
        >
          TLC
        </Link>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2.5 text-xs font-bold text-[#084b60]">
            <span className="hidden sm:inline">Робот</span>
            <select
              aria-label="Робот для нового проекта"
              value={hubChoice}
              onChange={(e) => setHubChoice(e.target.value as HubType)}
              className="min-h-[46px] min-w-[146px] sm:min-w-[170px] px-3.5 rounded-[13px] bg-white text-[#132932] font-extrabold shadow-[0_7px_22px_rgba(0,124,152,0.13)] focus:outline-none"
            >
              <option value="spike">SPIKE Prime</option>
              <option value="ev3">LEGO EV3</option>
            </select>
          </label>

          <Link
            href="/login"
            className="inline-flex items-center gap-2.5 min-h-[46px] pl-2 pr-4 py-1.5 rounded-full bg-[#092c37] text-white text-sm font-extrabold shadow-[0_7px_22px_rgba(0,91,112,0.16)] hover:bg-[#154453] transition-transform hover:-translate-y-0.5"
          >
            <LiveOrb
              size={30}
              variant={auth.avatar.variant}
              color={auth.avatar.color}
              eyeColor={auth.avatar.eyeColor}
              colors={auth.avatar.colors}
            />
            <span>{auth.user?.nickname || "Войти"}</span>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="min-h-[340px] grid grid-cols-1 md:grid-cols-2 items-center gap-6 px-5 md:px-16 pt-6 pb-8 bg-[#02c7ea] overflow-hidden">
          <div className="max-w-[610px] z-10">
            <p className="text-xs font-black tracking-[0.16em] text-[#08657b] mb-4">
              ПРОГРАММИРОВАНИЕ РОБОТОВ
            </p>
            <h1 className="text-[40px] sm:text-[54px] lg:text-[68px] font-black leading-[1.04] tracking-tight text-[#072733]">
              Начните со <span className="block">{HUBS[hubChoice]}</span>
            </h1>
            <p className="text-base sm:text-lg text-[#164e5e] leading-relaxed my-6 max-w-[520px]">
              Ваши проекты для роботов в одном месте. Создайте первый проект и
              выберите своё устройство.
            </p>
            <Button onClick={openNewModal} size="lg" className="gap-5">
              Создать проект <span aria-hidden="true">↗</span>
            </Button>
          </div>
          <img
            src="/robot-hero.svg"
            alt="Иллюстрация робота и деталей конструктора"
            className="w-full max-w-[560px] max-h-[320px] object-contain justify-self-center self-end drop-shadow-[0_22px_13px_rgba(0,123,146,0.19)]"
          />
        </section>

        <section className="max-w-[1460px] mx-auto px-5 md:px-16 pt-9 pb-20">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black tracking-[0.16em] text-[#008da9] mb-2">
                РАБОЧЕЕ ПРОСТРАНСТВО
              </p>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-[#12242d]">
                Мои проекты
              </h2>
              <p className="text-sm text-[#667883] mt-2.5">
                Проекты сохраняются в этом браузере. Файл проекта можно скачать
                из его карточки.
              </p>
            </div>
            <Badge variant="outline" className="px-3.5 py-2 text-[13px] self-start sm:self-auto">
              {countLabel(projects.length)}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-4 my-8">
            <button
              type="button"
              onClick={openNewModal}
              className="w-[168px] min-h-[155px] flex flex-col items-start text-left gap-1 p-4 rounded-[19px] border border-[#dce8ed] bg-white shadow-[0_6px_16px_rgba(25,54,70,0.03)] hover:-translate-y-1 hover:border-[#00abd0] hover:shadow-[0_12px_25px_rgba(0,131,165,0.12)] transition-all"
            >
              <span className="grid place-items-center w-14 h-14 mb-2 rounded-[15px] bg-[#d9f8ff] text-[#007f9e] text-[40px] font-light leading-none">
                ＋
              </span>
              <strong className="text-[15px] text-[#15313a]">
                Новый проект
              </strong>
              <small className="text-xs text-[#6a7f87]">SPIKE или EV3</small>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-[168px] min-h-[155px] flex flex-col items-start text-left gap-1 p-4 rounded-[19px] border border-[#dce8ed] bg-white shadow-[0_6px_16px_rgba(25,54,70,0.03)] hover:-translate-y-1 hover:border-[#00abd0] hover:shadow-[0_12px_25px_rgba(0,131,165,0.12)] transition-all"
            >
              <span className="grid place-items-center w-14 h-14 mb-2 rounded-[15px] bg-[#edf2f4] text-[#6a8792] text-[40px] font-light leading-none">
                ▱
              </span>
              <strong className="text-[15px] text-[#15313a]">
                Открыть файл
              </strong>
              <small className="text-xs text-[#6a7f87]">Импорт проекта</small>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.robotproj.json,application/json"
              onChange={handleFileImport}
              hidden
            />
          </div>

          {sortedProjects.length === 0 ? (
            <div className="border border-dashed border-[#c8d8df] rounded-[22px] min-h-[192px] flex flex-col items-center justify-center text-center text-[#667f89] bg-white/60 p-6">
              <div className="text-[38px] leading-none text-[#96c9d5]">◇</div>
              <h3 className="mt-3 mb-1 text-[#38535d] text-lg font-bold">
                Проектов пока нет
              </h3>
              <p className="text-sm">Нажмите «Новый проект», чтобы начать.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {sortedProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setSelectedId(project.id)}
                  className="min-h-[174px] border border-[#dce8ed] rounded-[19px] p-4 flex flex-col items-start text-left bg-white shadow-[0_6px_16px_rgba(25,54,70,0.03)] hover:-translate-y-1 hover:border-[#00abd0] hover:shadow-[0_12px_25px_rgba(0,131,165,0.12)] transition-all"
                >
                  <span
                    className={`grid place-items-center w-12 h-12 mb-3 rounded-[13px] text-[28px] font-black ${
                      project.hub === "spike"
                        ? "bg-[#d9f8ff] text-[#007f9e]"
                        : "bg-[#fff1df] text-[#db8730]"
                    }`}
                  >
                    {project.hub === "spike" ? "▦" : "▣"}
                  </span>
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0087a0]">
                    {HUBS[project.hub]}
                  </span>
                  <strong className="text-lg text-[#16313b] mt-1 mb-2 break-words">
                    {project.name}
                  </strong>
                  <small className="text-xs text-[#788d95] mt-auto">
                    {formatDate(project.updatedAt)}
                  </small>
                </button>
              ))}
            </div>
          )}

          {notice && (
            <p
              role="status"
              className={`rounded-xl px-4 py-3 mt-6 font-bold text-sm ${
                notice.isError
                  ? "bg-[#fff1ee] text-[#a9352e]"
                  : "bg-[#e0f8e8] text-[#19613b]"
              }`}
            >
              {notice.text}
            </p>
          )}
        </section>
      </main>

      {newOpen && (
        <div className="fixed inset-0 z-50 bg-[#0b2c3a]/55 backdrop-blur-xs grid place-items-center p-4">
          <div className="w-full max-w-[480px] rounded-[23px] border border-[#d9e5e9] bg-white p-7 shadow-2xl">
            <form onSubmit={handleCreateProject}>
              <p className="text-xs font-black tracking-[0.16em] text-[#008da9] mb-2">
                НОВЫЙ ПРОЕКТ
              </p>
              <h2 className="text-[28px] font-black text-[#172f39] mb-5">
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
                <legend className="text-sm font-bold text-[#172f39] mb-2.5">
                  Выберите робота
                </legend>
                {(["spike", "ev3"] as const).map((h) => (
                  <label
                    key={h}
                    className={`flex items-center gap-3 p-3 rounded-[13px] border cursor-pointer min-h-[75px] ${
                      newHub === h
                        ? "border-[#00aacd] bg-[#f0fcff] shadow-[inset_0_0_0_1px_#00aacd]"
                        : "border-[#d5e4e9]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="hub"
                      value={h}
                      checked={newHub === h}
                      onChange={() => setNewHub(h)}
                      className="w-4 h-4 accent-[#009cbd]"
                    />
                    <span
                      className={`grid place-items-center w-12 h-12 rounded-[13px] text-[28px] font-black ${
                        h === "spike"
                          ? "bg-[#d9f8ff] text-[#007f9e]"
                          : "bg-[#fff1df] text-[#db8730]"
                      }`}
                    >
                      {h === "spike" ? "▦" : "▣"}
                    </span>
                    <span className="flex flex-col">
                      <strong className="text-[15px] text-[#172f39]">
                        {HUBS[h]}
                      </strong>
                      <small className="text-xs text-[#6d838b]">
                        {h === "spike" ? "Хаб с портами A–F" : "Хаб с портами A–D"}
                      </small>
                    </span>
                  </label>
                ))}
              </fieldset>

              {formError && (
                <p className="text-[13px] text-[#b43d33] mt-3">{formError}</p>
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
        <div className="fixed inset-0 z-50 bg-[#0b2c3a]/55 backdrop-blur-xs grid place-items-center p-4">
          <div className="w-full max-w-[480px] rounded-[23px] border border-[#d9e5e9] bg-white p-7 shadow-2xl">
            <p className="text-xs font-black tracking-[0.16em] text-[#008da9] mb-2">
              ПРОЕКТ
            </p>
            <h2 className="text-[28px] font-black text-[#172f39] mb-2 break-words">
              {selectedProject.name}
            </h2>
            <p className="text-sm text-[#657d86] mb-4">
              {HUBS[selectedProject.hub]} · создан{" "}
              {formatDate(selectedProject.createdAt)}
            </p>
            <p className="p-3.5 rounded-xl bg-[#edf9fc] text-[#3a6875] text-sm">
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
                  href="/controller.html"
                  className="mr-auto text-[13px] font-bold text-[#007e9d] hover:underline"
                >
                  Открыть прежний пульт Socer
                </a>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedId(null)}
              >
                Закрыть
              </Button>
              <a
                href={`/editor.html?id=${encodeURIComponent(selectedProject.id)}`}
                className="inline-flex items-center justify-center rounded-full bg-[#092c37] text-white min-h-[50px] px-6 py-3 text-sm font-extrabold hover:bg-[#18495a]"
              >
                Открыть редактор
              </a>
            </div>
          </div>
        </div>
      )}

      {selectedProject && renameOpen && (
        <div className="fixed inset-0 z-50 bg-[#0b2c3a]/55 backdrop-blur-xs grid place-items-center p-4">
          <div className="w-full max-w-[480px] rounded-[23px] border border-[#d9e5e9] bg-white p-7 shadow-2xl">
            <form onSubmit={handleRenameProject}>
              <p className="text-xs font-black tracking-[0.16em] text-[#008da9] mb-2">
                ПРОЕКТ
              </p>
              <h2 className="text-[28px] font-black text-[#172f39] mb-5">
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
                <p className="text-[13px] text-[#b43d33] mt-3">{renameError}</p>
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
