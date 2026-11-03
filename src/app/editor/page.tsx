"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  HUBS,
  loadProjects,
  saveProjects,
  type RobotProject,
} from "@/lib/projects"
import {
  IF_FOOT_HEIGHT,
  IF_INDENT,
  IF_MID_HEIGHT,
  IF_TOP_HEIGHT,
  MAX_SHEETS,
  addBlock,
  addSheet,
  attachChain,
  blockTotalHeight,
  chainIds,
  deleteSheet,
  generatePybricks,
  ifInnerHeight,
  layoutChains,
  moveChain,
  readSheets,
  removeBlock,
  renameSheet,
  snapTargetInfo,
  updateDrive,
  type BlockType,
  type BranchSlot,
  type MotorDirection,
  type SheetState,
  type TravelUnit,
  type WorkspaceBlock,
} from "@/lib/workspace"

function newId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `block-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
}

type DragGesture =
  | {
      kind: "pan"
      startX: number
      startY: number
      originPanX: number
      originPanY: number
    }
  | {
      kind: "block"
      id: string
      startX: number
      startY: number
      originX: number
      originY: number
      moving: string[]
      moved: boolean
      dx: number
      dy: number
    }
  | {
      kind: "palette"
      type: BlockType
      clientX: number
      clientY: number
    }

function EditorWorkspace() {
  const searchParams = useSearchParams()
  const projectId = searchParams.get("id")

  const boardRef = React.useRef<HTMLDivElement | null>(null)
  const [projects, setProjects] = React.useState<RobotProject[]>([])
  const [project, setProject] = React.useState<RobotProject | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  const [sheetState, setSheetState] = React.useState<SheetState>(() =>
    readSheets(null, "spike")
  )
  const [panX, setPanX] = React.useState(320)
  const [panY, setPanY] = React.useState(220)
  const [zoom, setZoom] = React.useState(1)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const [categoryOpen, setCategoryOpen] = React.useState(true)

  const [saveMessage, setSaveMessage] = React.useState<{
    text: string
    isError: boolean
  }>({ text: "Сохранено", isError: false })

  const [gesture, setGesture] = React.useState<DragGesture | null>(null)
  const [snapTargetSlot, setSnapTargetSlot] = React.useState<{
    id: string
    branch?: BranchSlot
  } | null>(null)
  const [justAddedId, setJustAddedId] = React.useState<string | null>(null)
  const [justSnappedIds, setJustSnappedIds] = React.useState<string[]>([])
  const [justSnappedHeadId, setJustSnappedHeadId] = React.useState<
    string | null
  >(null)

  const [bluetoothOpen, setBluetoothOpen] = React.useState(false)
  const [codeModal, setCodeModal] = React.useState<{
    open: boolean
    title: string
    code: string
  }>({ open: false, title: "", code: "" })

  const [sheetModal, setSheetModal] = React.useState<{
    open: boolean
    action: "add" | "rename" | "delete"
    name: string
    error: string | null
  }>({ open: false, action: "rename", name: "", error: null })

  const currentSheet = React.useMemo(
    () =>
      sheetState.sheets.find((s) => s.id === sheetState.activeSheetId) ||
      sheetState.sheets[0],
    [sheetState]
  )

  const blocks = currentSheet?.blocks || []

  React.useEffect(() => {
    try {
      const loaded = loadProjects(window.localStorage)
      const found = loaded.find((item) => item.id === projectId)
      if (!found) {
        setLoadError("Проект не найден. Вернитесь к списку проектов.")
        setSaveMessage({ text: "Ошибка проекта", isError: true })
        return
      }
      const initialSheets = readSheets(found.workspace, found.hub)
      const active =
        initialSheets.sheets.find(
          (s) => s.id === initialSheets.activeSheetId
        ) || initialSheets.sheets[0]

      setProjects(loaded)
      setProject(found)
      setSheetState(initialSheets)
      setLoadError(null)
      document.title = `${found.name} — TLC`

      requestAnimationFrame(() => {
        const board = boardRef.current
        const defaultX = board ? Math.round(board.clientWidth / 2) : 360
        const defaultY = board ? Math.round(board.clientHeight / 2) : 240
        setPanX(active?.view?.panX ?? defaultX)
        setPanY(active?.view?.panY ?? defaultY)
        setZoom(active?.view?.zoom ?? 1)
      })
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Проект недоступен."
      )
      setSaveMessage({ text: "Ошибка проекта", isError: true })
    }
  }, [projectId])

  const snapshotSheets = React.useCallback(
    (
      overrideBlocks?: WorkspaceBlock[],
      overrideView?: { panX: number; panY: number; zoom: number }
    ): SheetState => {
      const v = overrideView || { panX, panY, zoom }
      return {
        ...sheetState,
        sheets: sheetState.sheets.map((s) =>
          s.id === sheetState.activeSheetId
            ? {
                ...s,
                blocks: overrideBlocks ? layoutChains(overrideBlocks) : s.blocks,
                view: v,
              }
            : s
        ),
      }
    },
    [sheetState, panX, panY, zoom]
  )

  const persistSheets = React.useCallback(
    (nextState: SheetState): boolean => {
      if (!project) return false
      const updated: RobotProject = {
        ...project,
        updatedAt: new Date().toISOString(),
        workspace: nextState as unknown as Record<string, unknown>,
      }
      const nextProjects = projects.map((p) =>
        p.id === project.id ? updated : p
      )
      try {
        saveProjects(window.localStorage, nextProjects)
        setProjects(nextProjects)
        setProject(updated)
        setSheetState(nextState)
        setSaveMessage({ text: "Сохранено", isError: false })
        return true
      } catch {
        setSaveMessage({ text: "Не удалось сохранить", isError: true })
        return false
      }
    },
    [project, projects]
  )

  const saveBlocks = React.useCallback(
    (nextBlocks: WorkspaceBlock[]) => {
      const nextState = snapshotSheets(nextBlocks)
      return persistSheets(nextState)
    },
    [snapshotSheets, persistSheets]
  )

  const triggerSnapAnimation = React.useCallback(
    (nextBlocks: WorkspaceBlock[], headId: string) => {
      const ids = chainIds(nextBlocks, headId)
      setJustSnappedIds(ids)
      setJustSnappedHeadId(headId)
      window.setTimeout(() => {
        setJustSnappedIds([])
        setJustSnappedHeadId(null)
      }, 420)
    },
    []
  )

  const triggerSpawnAnimation = React.useCallback((id: string) => {
    setJustAddedId(id)
    window.setTimeout(() => {
      setJustAddedId((prev) => (prev === id ? null : prev))
    }, 400)
  }, [])

  const finishBlockMove = React.useCallback(
    (id: string, x: number, y: number, snap = true) => {
      let next = moveChain(blocks, id, x, y)
      const target = snap ? snapTargetInfo(next, id, x, y) : null
      if (target) {
        next = attachChain(next, id, target.id, target.branch)
        triggerSnapAnimation(next, id)
      }
      saveBlocks(next)
    },
    [blocks, saveBlocks, triggerSnapAnimation]
  )

  const worldFromClient = React.useCallback(
    (clientX: number, clientY: number) => {
      const rect = boardRef.current?.getBoundingClientRect()
      if (!rect) return { x: 0, y: 0 }
      return {
        x: (clientX - rect.left - panX) / zoom,
        y: (clientY - rect.top - panY) / zoom,
      }
    },
    [panX, panY, zoom]
  )

  const addBlockAtClient = React.useCallback(
    (clientX: number, clientY: number, type: BlockType = "start") => {
      if (!project) return
      const point = worldFromClient(clientX, clientY)
      try {
        const id = newId()
        const x = point.x - 135
        const y = point.y - 28
        let next = addBlock(blocks, id, x, y, type)
        const target = snapTargetInfo(next, id, x, y)
        if (target) {
          next = attachChain(next, id, target.id, target.branch)
          triggerSnapAnimation(next, id)
        } else {
          triggerSpawnAnimation(id)
        }
        setSelectedId(id)
        saveBlocks(next)
        setPaletteOpen(false)
      } catch (err) {
        setSaveMessage({
          text:
            err instanceof Error ? err.message : "Не удалось добавить блок",
          isError: true,
        })
      }
    },
    [
      project,
      worldFromClient,
      blocks,
      saveBlocks,
      triggerSnapAnimation,
      triggerSpawnAnimation,
    ]
  )

  const addBlockAtCenter = React.useCallback(
    (type: BlockType = "start") => {
      const rect = boardRef.current?.getBoundingClientRect()
      if (!rect) return
      addBlockAtClient(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
        type
      )
    },
    [addBlockAtClient]
  )

  React.useEffect(() => {
    if (!gesture || gesture.kind !== "palette") return
    const handleMove = (e: PointerEvent) => {
      setGesture((prev) =>
        prev && prev.kind === "palette"
          ? { ...prev, clientX: e.clientX, clientY: e.clientY }
          : prev
      )
      const rect = boardRef.current?.getBoundingClientRect()
      if (
        rect &&
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        const pt = worldFromClient(e.clientX, e.clientY)
        const target = snapTargetInfo(
          blocks,
          "__palette__",
          pt.x - 135,
          pt.y - 28
        )
        setSnapTargetSlot(target)
      } else {
        setSnapTargetSlot(null)
      }
    }
    const handleUp = (e: PointerEvent) => {
      const type = gesture.type
      setGesture(null)
      setSnapTargetSlot(null)
      const rect = boardRef.current?.getBoundingClientRect()
      if (
        rect &&
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        addBlockAtClient(e.clientX, e.clientY, type)
      } else {
        addBlockAtCenter(type)
      }
    }
    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", handleUp)
    return () => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleUp)
    }
  }, [gesture, blocks, worldFromClient, addBlockAtClient, addBlockAtCenter])

  function handleZoom(nextZoom: number) {
    const clamped = Math.min(2, Math.max(0.5, nextZoom))
    const board = boardRef.current
    const cx = board ? board.clientWidth / 2 : 360
    const cy = board ? board.clientHeight / 2 : 240
    const nextPanX = cx - ((cx - panX) * clamped) / zoom
    const nextPanY = cy - ((cy - panY) * clamped) / zoom
    setPanX(nextPanX)
    setPanY(nextPanY)
    setZoom(clamped)
  }

  function handleResetView() {
    const board = boardRef.current
    setZoom(1)
    setPanX(board ? Math.round(board.clientWidth / 2) : 360)
    setPanY(board ? Math.round(board.clientHeight / 2) : 240)
  }

  function switchSheet(id: string) {
    if (gesture || id === sheetState.activeSheetId) return
    const nextState: SheetState = {
      ...snapshotSheets(),
      activeSheetId: id,
    }
    setSelectedId(null)
    if (persistSheets(nextState)) {
      const targetSheet = nextState.sheets.find((s) => s.id === id)
      const board = boardRef.current
      setPanX(
        targetSheet?.view?.panX ?? (board ? Math.round(board.clientWidth / 2) : 360)
      )
      setPanY(
        targetSheet?.view?.panY ?? (board ? Math.round(board.clientHeight / 2) : 240)
      )
      setZoom(targetSheet?.view?.zoom ?? 1)
    }
  }

  function openSheetDialog(action: "add" | "rename" | "delete") {
    if (!project) return
    let number = sheetState.sheets.length + 1
    while (sheetState.sheets.some((s) => s.name === `Лист ${number}`)) {
      number++
    }
    setSheetModal({
      open: true,
      action,
      name: action === "add" ? `Лист ${number}` : currentSheet.name,
      error: null,
    })
  }

  function handleSheetSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const state = snapshotSheets()
      const next =
        sheetModal.action === "add"
          ? addSheet(state, newId(), sheetModal.name)
          : sheetModal.action === "rename"
            ? renameSheet(state, state.activeSheetId, sheetModal.name)
            : deleteSheet(state, state.activeSheetId)
      setSelectedId(null)
      if (persistSheets(next)) {
        const active =
          next.sheets.find((s) => s.id === next.activeSheetId) || next.sheets[0]
        const board = boardRef.current
        setPanX(
          active?.view?.panX ?? (board ? Math.round(board.clientWidth / 2) : 360)
        )
        setPanY(
          active?.view?.panY ?? (board ? Math.round(board.clientHeight / 2) : 240)
        )
        setZoom(active?.view?.zoom ?? 1)
        setSheetModal((prev) => ({ ...prev, open: false }))
      }
    } catch (err) {
      setSheetModal((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Ошибка листа",
      }))
    }
  }

  function handleExportCode() {
    if (!project) return
    try {
      const code = `# Лист: ${currentSheet.name.replace(/[\r\n]/g, " ")}\n${generatePybricks(blocks, project.hub)}`
      setCodeModal({
        open: true,
        title: `Программа Pybricks — ${currentSheet.name}`,
        code,
      })
    } catch (err) {
      setSaveMessage({
        text:
          err instanceof Error
            ? err.message
            : "Не удалось сформировать программу",
        isError: true,
      })
    }
  }

  function handleDownloadPy() {
    const blob = new Blob([codeModal.code], {
      type: "text/x-python;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "tlc_program.py"
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  const motorPorts = React.useMemo(
    () => (project?.hub === "ev3" ? ["A", "B", "C", "D"] : ["A", "B", "C", "D", "E", "F"]),
    [project?.hub]
  )

  return (
    <div
      className="flex flex-col h-dvh min-h-[360px] bg-[#f5f8fa] text-[#18313b] select-none overflow-hidden"
      onPointerDown={(e) => {
        if (!(e.target as HTMLElement).closest("[data-module-picker]")) {
        }
      }}
    >
      {/* Topbar */}
      <header className="h-[68px] shrink-0 flex items-center gap-4 px-4 md:px-6 bg-white border-b border-[#dce8ec] z-10">
        <Link
          href="/"
          aria-label="К списку проектов"
          className="text-sm font-extrabold text-[#087996] hover:text-[#055a70] whitespace-nowrap"
        >
          ← <span className="hidden xs:inline">Проекты</span>
        </Link>

        <div className="flex items-baseline gap-3 min-w-0">
          <strong className="text-[17px] font-black truncate">
            {project ? project.name : loadError ? "Проект недоступен" : "Проект"}
          </strong>
          {project && (
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {HUBS[project.hub]}
            </Badge>
          )}
        </div>

        <span
          role="status"
          className={`ml-auto text-xs font-semibold whitespace-nowrap hidden sm:inline ${
            saveMessage.isError ? "text-[#b1372c]" : "text-[#6f8992]"
          }`}
        >
          {saveMessage.text}
        </span>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!project}
          onClick={handleExportCode}
          className="rounded-[11px] min-h-[41px] px-3.5 font-extrabold border-[#c6dce2] text-[#086985]"
        >
          Программа Pybricks
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setBluetoothOpen(true)}
          className="rounded-[11px] min-h-[41px] px-3.5 font-extrabold border-[#a9d6e2] bg-[#e8faff] text-[#086985] hover:bg-[#d8f5fe]"
        >
          Bluetooth
        </Button>
      </header>

      {/* Main Editor Body */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Block Palette Sidebar */}
        <aside
          aria-label="Меню блоков"
          className={`w-[270px] shrink-0 p-5 bg-white border-r border-[#dce8ec] z-20 overflow-y-auto transition-transform max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:shadow-2xl ${
            paletteOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-2 pb-5">
            <div>
              <small className="text-[10px] font-black tracking-[0.14em] text-[#0b8cab] block">
                БИБЛИОТЕКА
              </small>
              <h2 className="text-2xl font-black tracking-tight mt-1">Блоки</h2>
            </div>
            <button
              type="button"
              onClick={() => setPaletteOpen(false)}
              aria-label="Закрыть меню"
              className="md:hidden grid place-items-center w-8 h-8 rounded-lg border border-[#dce7ec] text-[#31525f] font-extrabold"
            >
              ×
            </button>
          </div>

          <button
            type="button"
            aria-expanded={categoryOpen}
            onClick={() => setCategoryOpen((v) => !v)}
            className="flex items-center justify-between w-full rounded-[11px] bg-[#eff8fb] px-4 py-3 text-[#284653] font-extrabold text-sm"
          >
            <span>Основные</span>
            <span
              aria-hidden="true"
              className={`text-lg leading-none transition-transform ${
                categoryOpen ? "" : "-rotate-90"
              }`}
            >
              ⌄
            </span>
          </button>

          {categoryOpen && (
            <div className="py-3 px-1 space-y-2.5">
              {/* Блок 1: Когда программа запускается */}
              <button
                id="startBlock"
                type="button"
                disabled={!project}
                aria-label="Добавить блок Когда программа запускается. Можно перетащить на доску"
                onPointerDown={(e) => {
                  if (!project || e.button !== 0) return
                  e.preventDefault()
                  setGesture({
                    kind: "palette",
                    type: "start",
                    clientX: e.clientX,
                    clientY: e.clientY,
                  })
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    addBlockAtCenter("start")
                  }
                }}
                className="w-full rounded-[13px] border border-[#d4e1e9] bg-white p-3.5 text-left flex flex-col gap-2 hover:border-[#d97706] hover:bg-[#fffbeb] transition-colors disabled:opacity-50 cursor-grab active:cursor-grabbing"
              >
                <span
                  aria-hidden="true"
                  className="grid place-items-center w-[106px] h-[33px] rounded-t-[14px] rounded-b-[8px] bg-[#f59e0b] text-white text-base font-black shadow-[inset_0_-4px_#d97706]"
                >
                  ▶
                </span>
                <span className="text-[13px] font-extrabold text-[#18313b]">
                  Когда программа запускается
                </span>
                <small className="text-[11px] text-[#78909a]">
                  Точка старта программы
                </small>
              </button>

              {/* Блок 2: Движение мотора */}
              <button
                id="driveBlock"
                type="button"
                disabled={!project}
                aria-label="Добавить блок движения. Можно перетащить на доску"
                onPointerDown={(e) => {
                  if (!project || e.button !== 0) return
                  e.preventDefault()
                  setGesture({
                    kind: "palette",
                    type: "drive",
                    clientX: e.clientX,
                    clientY: e.clientY,
                  })
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    addBlockAtCenter("drive")
                  }
                }}
                className="w-full rounded-[13px] border border-[#d4e1e9] bg-white p-3.5 text-left flex flex-col gap-2 hover:border-[#0589b1] hover:bg-[#f2fbfe] transition-colors disabled:opacity-50 cursor-grab active:cursor-grabbing"
              >
                <span
                  aria-hidden="true"
                  className="grid place-items-center w-[106px] h-[33px] rounded-[8px] bg-[#0589b1] text-white text-xl font-extrabold shadow-[inset_0_-4px_#00759b]"
                >
                  ↗
                </span>
                <span className="text-[13px] font-extrabold text-[#18313b]">
                  Движение мотора
                </span>
                <small className="text-[11px] text-[#78909a]">
                  Перетащите на доску
                </small>
              </button>

              {/* Блок 3: Связанные моторы */}
              <button
                id="pairBlock"
                type="button"
                disabled={!project}
                aria-label="Добавить связанные моторы. Можно перетащить на доску"
                onPointerDown={(e) => {
                  if (!project || e.button !== 0) return
                  e.preventDefault()
                  setGesture({
                    kind: "palette",
                    type: "pair",
                    clientX: e.clientX,
                    clientY: e.clientY,
                  })
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    addBlockAtCenter("pair")
                  }
                }}
                className="w-full rounded-[13px] border border-[#d4e1e9] bg-white p-3.5 text-left flex flex-col gap-2 hover:border-[#107e79] hover:bg-[#f2fbfa] transition-colors disabled:opacity-50 cursor-grab active:cursor-grabbing"
              >
                <span
                  aria-hidden="true"
                  className="grid place-items-center w-[106px] h-[33px] rounded-[8px] bg-[#107e79] text-white text-xl font-extrabold shadow-[inset_0_-4px_#086560]"
                >
                  ⇉
                </span>
                <span className="text-[13px] font-extrabold text-[#18313b]">
                  Связанные моторы
                </span>
                <small className="text-[11px] text-[#78909a]">
                  Два мотора, общие модули
                </small>
              </button>

              {/* Блок 4: Если / Иначе (if / else) */}
              <button
                id="ifBlock"
                type="button"
                disabled={!project}
                aria-label="Добавить блок Если Иначе. Можно перетащить на доску"
                onPointerDown={(e) => {
                  if (!project || e.button !== 0) return
                  e.preventDefault()
                  setGesture({
                    kind: "palette",
                    type: "if",
                    clientX: e.clientX,
                    clientY: e.clientY,
                  })
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    addBlockAtCenter("if")
                  }
                }}
                className="w-full rounded-[13px] border border-[#d4e1e9] bg-white p-3.5 text-left flex flex-col gap-2 hover:border-[#7c3aed] hover:bg-[#f5f3ff] transition-colors disabled:opacity-50 cursor-grab active:cursor-grabbing"
              >
                <span
                  aria-hidden="true"
                  className="grid place-items-center w-[116px] h-[33px] rounded-[8px] bg-[#7c3aed] text-white text-sm font-black shadow-[inset_0_-4px_#5b21b6]"
                >
                  if / else
                </span>
                <span className="text-[13px] font-extrabold text-[#18313b]">
                  Если … то / Иначе
                </span>
                <small className="text-[11px] text-[#78909a]">
                  Ветвление программы (if / else)
                </small>
              </button>
            </div>
          )}
        </aside>

        {paletteOpen && (
          <button
            type="button"
            aria-label="Закрыть меню блоков"
            onClick={() => setPaletteOpen(false)}
            className="md:hidden fixed inset-0 bg-[#17313b]/40 z-10"
          />
        )}

        {/* Board Panel */}
        <main className="flex flex-col flex-1 min-w-0 min-h-0">
          {/* Board Toolbar */}
          <div className="h-[54px] shrink-0 flex items-center gap-2 px-4 bg-white border-b border-[#e1eaee]">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Открыть меню блоков"
              className="md:hidden grid place-items-center h-[34px] w-[34px] rounded-[9px] border border-[#dce7ec] bg-white text-[#31525f] font-extrabold"
            >
              ☰
            </button>
            <span className="text-[13px] font-extrabold text-[#57717d] hidden sm:inline">
              Рабочая область
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => handleZoom(zoom - 0.25)}
              aria-label="Уменьшить масштаб"
              className="grid place-items-center h-[34px] min-w-[34px] px-2 rounded-[9px] border border-[#dce7ec] bg-white hover:bg-[#f1f9fb] text-[#31525f] font-extrabold"
            >
              −
            </button>
            <span className="min-w-[46px] text-center text-xs font-extrabold text-[#587681]">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => handleZoom(zoom + 0.25)}
              aria-label="Увеличить масштаб"
              className="grid place-items-center h-[34px] min-w-[34px] px-2 rounded-[9px] border border-[#dce7ec] bg-white hover:bg-[#f1f9fb] text-[#31525f] font-extrabold"
            >
              +
            </button>
            <button
              type="button"
              onClick={handleResetView}
              className="h-[34px] px-3 rounded-[9px] border border-[#dce7ec] bg-white hover:bg-[#f1f9fb] text-xs font-extrabold text-[#31525f]"
            >
              По центру
            </button>
          </div>

          {/* Infinite Canvas Board */}
          <div
            ref={boardRef}
            aria-label="Доска для блоков"
            style={{
              backgroundImage:
                "radial-gradient(#bbcbd2 1.15px, transparent 1.15px)",
              backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
              backgroundPosition: `${panX}px ${panY}px`,
            }}
            onPointerDown={(e) => {
              if (
                e.button !== 0 ||
                (e.target as HTMLElement).closest("[data-canvas-block]")
              )
                return
              setSelectedId(null)
              setGesture({
                kind: "pan",
                startX: e.clientX,
                startY: e.clientY,
                originPanX: panX,
                originPanY: panY,
              })
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              if (!gesture) return
              if (gesture.kind === "pan") {
                setPanX(gesture.originPanX + e.clientX - gesture.startX)
                setPanY(gesture.originPanY + e.clientY - gesture.startY)
              } else if (gesture.kind === "block") {
                const dx = (e.clientX - gesture.startX) / zoom
                const dy = (e.clientY - gesture.startY) / zoom
                const moved =
                  gesture.moved ||
                  Math.hypot(
                    e.clientX - gesture.startX,
                    e.clientY - gesture.startY
                  ) > 4
                if (!moved) return
                setGesture({
                  ...gesture,
                  moved: true,
                  dx,
                  dy,
                })
                const target = snapTargetInfo(
                  blocks,
                  gesture.id,
                  gesture.originX + dx,
                  gesture.originY + dy
                )
                setSnapTargetSlot(target)
              }
            }}
            onPointerUp={(e) => {
              if (!gesture) return
              if (gesture.kind === "block") {
                const { id, originX, originY, startX, startY, moved } = gesture
                setGesture(null)
                setSnapTargetSlot(null)
                if (moved) {
                  finishBlockMove(
                    id,
                    originX + (e.clientX - startX) / zoom,
                    originY + (e.clientY - startY) / zoom
                  )
                }
              } else if (gesture.kind === "pan") {
                setGesture(null)
              }
            }}
            className={`relative flex-1 min-h-0 overflow-hidden touch-none bg-[#f7f9fb] ${
              gesture?.kind === "pan" ? "cursor-grabbing" : "cursor-grab"
            }`}
          >
            <div
              style={{
                transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
                transformOrigin: "0 0",
              }}
              className="absolute top-0 left-0 w-0 h-0"
            >
              {/* Magnetic LEGO socket preview under or inside snapTarget */}
              {snapTargetSlot &&
                (() => {
                  const targetBlock = blocks.find(
                    (b) => b.id === snapTargetSlot.id
                  )
                  if (!targetBlock) return null
                  const isBodyBranch =
                    snapTargetSlot.branch === "body" &&
                    targetBlock.type === "if"
                  const isElseBranch =
                    snapTargetSlot.branch === "else" &&
                    targetBlock.type === "if"
                  const socketX =
                    isBodyBranch || isElseBranch
                      ? targetBlock.x + IF_INDENT
                      : targetBlock.x
                  const socketY = isBodyBranch
                    ? targetBlock.y + IF_TOP_HEIGHT - 4
                    : isElseBranch
                      ? targetBlock.y +
                        IF_TOP_HEIGHT +
                        ifInnerHeight(blocks, targetBlock.id, "body") +
                        IF_MID_HEIGHT -
                        4
                      : targetBlock.y +
                        blockTotalHeight(blocks, targetBlock.id) -
                        4
                  return (
                    <div
                      aria-hidden="true"
                      style={{
                        left: `${socketX}px`,
                        top: `${socketY}px`,
                      }}
                      className="absolute z-20 w-[320px] h-[58px] rounded-[12px] border-2 border-dashed border-[#fbbf24] bg-[#fef3c7]/55 shadow-[0_0_24px_rgba(251,191,36,0.45)] pointer-events-none animate-lego-magnet"
                    >
                      <span className="absolute -top-[8px] left-[32px] w-[44px] h-[11px] rounded-t-[6px] bg-[#fbbf24]" />
                    </div>
                  )
                })()}

              {blocks.map((block) => {
                const isMoving =
                  gesture?.kind === "block" &&
                  gesture.moved &&
                  gesture.moving.includes(block.id)

                let magneticPullX = 0
                let magneticPullY = 0
                if (isMoving && snapTargetSlot && gesture?.kind === "block") {
                  const targetBlock = blocks.find(
                    (b) => b.id === snapTargetSlot.id
                  )
                  const draggedRoot = blocks.find(
                    (b) => b.id === gesture.id
                  )
                  if (targetBlock && draggedRoot) {
                    const rawRootX = draggedRoot.x + gesture.dx
                    const rawRootY = draggedRoot.y + gesture.dy
                    const isBodyBranch =
                      snapTargetSlot.branch === "body" &&
                      targetBlock.type === "if"
                    const isElseBranch =
                      snapTargetSlot.branch === "else" &&
                      targetBlock.type === "if"
                    const snapX =
                      isBodyBranch || isElseBranch
                        ? targetBlock.x + IF_INDENT
                        : targetBlock.x
                    const snapY = isBodyBranch
                      ? targetBlock.y + IF_TOP_HEIGHT - 4
                      : isElseBranch
                        ? targetBlock.y +
                          IF_TOP_HEIGHT +
                          ifInnerHeight(blocks, targetBlock.id, "body") +
                          IF_MID_HEIGHT -
                          4
                        : targetBlock.y +
                          blockTotalHeight(blocks, targetBlock.id) -
                          4
                    magneticPullX = (snapX - rawRootX) * 0.42
                    magneticPullY = (snapY - rawRootY) * 0.42
                  }
                }

                const displayX = isMoving
                  ? Math.round(block.x + gesture.dx + magneticPullX)
                  : block.x
                const displayY = isMoving
                  ? Math.round(block.y + gesture.dy + magneticPullY)
                  : block.y
                const paired = block.type === "pair"
                const isIfBlock = block.type === "if"
                const motorBlock = block.type === "drive" || paired
                const isSelected = block.id === selectedId
                const isSnapTarget = block.id === snapTargetSlot?.id
                const hasChild = blocks.some(
                  (b) => b.parentId === block.id && !b.branch
                )
                const isConnected = Boolean(block.parentId)
                const isJustAdded = justAddedId === block.id
                const isJustSnapped = justSnappedIds.includes(block.id)
                const isJustSnappedHead = justSnappedHeadId === block.id
                const modules = block.modules || []
                const bodySpineHeight = isIfBlock
                  ? ifInnerHeight(blocks, block.id, "body")
                  : 0
                const elseSpineHeight = isIfBlock
                  ? ifInnerHeight(blocks, block.id, "else")
                  : 0

                const radiusClass = isIfBlock
                  ? ""
                  : motorBlock
                    ? `${isConnected ? "rounded-t-[5px]" : "rounded-t-[14px]"} ${
                        hasChild ? "rounded-b-[5px]" : "rounded-b-[14px]"
                      }`
                    : `rounded-t-[22px] ${
                        hasChild ? "rounded-b-[5px]" : "rounded-b-[14px]"
                      }`

                return (
                  <div
                    key={block.id}
                    data-canvas-block="true"
                    data-block-id={block.id}
                    tabIndex={0}
                    role={motorBlock || isIfBlock ? "group" : "button"}
                    aria-label={
                      isIfBlock
                        ? "Блок условия Если Иначе. Перетащите за заголовок"
                        : motorBlock
                          ? paired
                            ? "Связанные моторы. Перетащите за заголовок"
                            : "Блок движения мотора. Перетащите за заголовок"
                          : "Когда программа запускается. Стрелки перемещают, Delete удаляет"
                    }
                    style={{
                      left: `${displayX}px`,
                      top: `${displayY}px`,
                    }}
                    onPointerDown={(e) => {
                      if (
                        e.button !== 0 ||
                        (e.target as HTMLElement).closest(
                          "button, select, input"
                        )
                      )
                        return
                      e.preventDefault()
                      e.stopPropagation()
                      setSelectedId(block.id)
                      setGesture({
                        kind: "block",
                        id: block.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        originX: block.x,
                        originY: block.y,
                        moving: chainIds(blocks, block.id),
                        moved: false,
                        dx: 0,
                        dy: 0,
                      })
                    }}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return
                      if (e.key === "Delete" || e.key === "Backspace") {
                        e.preventDefault()
                        setSelectedId(null)
                        saveBlocks(removeBlock(blocks, block.id))
                        return
                      }
                      const offsets: Record<string, [number, number]> = {
                        ArrowLeft: [-16, 0],
                        ArrowRight: [16, 0],
                        ArrowUp: [0, -16],
                        ArrowDown: [0, 16],
                      }
                      if (!offsets[e.key]) return
                      e.preventDefault()
                      const [dx, dy] = offsets[e.key]
                      setSelectedId(block.id)
                      finishBlockMove(block.id, block.x + dx, block.y + dy)
                    }}
                    className={`absolute touch-none select-none cursor-grab ${
                      isMoving
                        ? "z-30 cursor-grabbing scale-[1.02] shadow-2xl"
                        : "z-10 transition-[left,top,box-shadow] duration-200 ease-out"
                    } ${
                      ""
                    } ${radiusClass} ${
                      isIfBlock
                        ? "pointer-events-none text-white"
                        : motorBlock
                          ? paired
                            ? "w-max h-[64px] bg-[#107e79] text-white shadow-[inset_0_-4px_#086560,0_8px_18px_rgba(20,105,123,0.16)]"
                            : "w-max h-[64px] bg-[#0589b1] text-white shadow-[inset_0_-4px_#00759b,0_8px_18px_rgba(20,105,123,0.16)]"
                          : "w-[320px] h-[58px] bg-[#f59e0b] text-white px-5 flex items-center shadow-[inset_0_-4px_#d97706,0_8px_18px_rgba(120,53,15,0.16)]"
                    } ${
                      isJustAdded ? "animate-lego-spawn" : ""
                    } ${
                      isJustSnapped ? "animate-lego-snap" : ""
                    } ${
                      !isIfBlock && isSelected
                        ? "outline-3 outline-[#087996] outline-offset-2"
                        : ""
                    } ${
                      !isIfBlock && isSnapTarget
                        ? "ring-4 ring-[#fbbf24] shadow-[0_0_26px_rgba(251,191,36,0.55)]"
                        : ""
                    }`}
                  >
                    {/* Top LEGO connector stud for motor & if blocks */}
                    {(motorBlock || isIfBlock) && (
                      <span
                        aria-hidden="true"
                        className={`absolute -top-[8px] left-[32px] w-[44px] h-[11px] rounded-t-[6px] pointer-events-auto ${
                          isIfBlock
                            ? "bg-[#7c3aed]"
                            : paired
                              ? "bg-[#107e79]"
                              : "bg-[#0589b1]"
                        }`}
                      />
                    )}

                    {/* LEGO Click-Snap Flash Ripple when block locks onto parent */}
                    {isJustSnappedHead && (
                      <span
                        aria-hidden="true"
                        className="absolute -top-[6px] left-[16px] w-[180px] h-[10px] rounded-full bg-gradient-to-r from-[#fef08a] via-white to-transparent pointer-events-none z-40 animate-lego-flash"
                      />
                    )}

                    {/* Delete button */}
                    {isSelected && (
                      <button
                        type="button"
                        aria-label="Удалить блок"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedId(null)
                          saveBlocks(removeBlock(blocks, block.id))
                        }}
                        className="pointer-events-auto absolute -top-[13px] -right-[12px] z-30 w-[26px] h-[26px] rounded-full bg-white text-[#18313b] shadow-md text-lg leading-none font-bold grid place-items-center"
                      >
                        ×
                      </button>
                    )}

                    {/* Block Content */}
                    {isIfBlock ? (
                      <div className="flex flex-col items-start">
                        {/* 1. Top Header Bar of E-shaped If/Else block */}
                        <div
                          className={`pointer-events-auto relative flex flex-nowrap items-center h-[58px] w-[260px] px-5 gap-3 bg-[#7c3aed] shadow-[inset_0_-4px_#5b21b6,0_8px_18px_rgba(91,33,182,0.2)] ${
                            isConnected
                              ? "rounded-tl-[5px] rounded-tr-[14px]"
                              : "rounded-t-[14px]"
                          } rounded-br-[14px] ${
                            isSelected
                              ? "ring-3 ring-[#087996]"
                              : isSnapTarget
                                ? "ring-4 ring-[#fbbf24]"
                                : ""
                          }`}
                        >
                          {/* Inner top LEGO stud pointing down into the first C-mouth ("Если") */}
                          <span
                            aria-hidden="true"
                            className="absolute -bottom-[7px] left-[60px] w-[44px] h-[10px] rounded-b-[6px] bg-[#7c3aed] z-20"
                          />

                          <span className="text-[16px] font-extrabold whitespace-nowrap tracking-tight">
                            Если
                          </span>
                          {/* Empty condition slot */}
                          <span
                            aria-hidden="true"
                            className="w-[88px] h-[32px] rounded-full bg-[#4c1d95]/55 border border-white/25 shadow-inner"
                          />
                          <span className="text-[16px] font-extrabold whitespace-nowrap tracking-tight">
                            то
                          </span>
                        </div>

                        {/* 2. First Left Vertical Spine ("Если" branch mouth) */}
                        <div
                          style={{ height: `${bodySpineHeight}px` }}
                          className="relative flex items-center"
                        >
                          <div className="pointer-events-auto w-[28px] h-full bg-[#7c3aed] shadow-[inset_-4px_0_#5b21b6]" />
                        </div>

                        {/* 3. Middle Bar ("Иначе") */}
                        <div className="pointer-events-auto relative flex items-center w-[220px] h-[48px] px-5 bg-[#7c3aed] shadow-[inset_0_-4px_#5b21b6,0_8px_18px_rgba(91,33,182,0.16)] rounded-r-[14px]">
                          {/* Top LEGO stud to lock with last block in "Если" branch */}
                          <span
                            aria-hidden="true"
                            className="absolute -top-[8px] left-[60px] w-[44px] h-[10px] rounded-t-[6px] bg-[#7c3aed]"
                          />
                          {/* Bottom LEGO stud pointing down into the second C-mouth ("Иначе") */}
                          <span
                            aria-hidden="true"
                            className="absolute -bottom-[7px] left-[60px] w-[44px] h-[10px] rounded-b-[6px] bg-[#7c3aed] z-20"
                          />
                          <span className="text-[16px] font-extrabold whitespace-nowrap tracking-tight">
                            Иначе
                          </span>
                        </div>

                        {/* 4. Second Left Vertical Spine ("Иначе" branch mouth) */}
                        <div
                          style={{ height: `${elseSpineHeight}px` }}
                          className="relative flex items-center"
                        >
                          <div className="pointer-events-auto w-[28px] h-full bg-[#7c3aed] shadow-[inset_-4px_0_#5b21b6]" />
                        </div>

                        {/* 5. Bottom C-Foot */}
                        <div
                          className={`pointer-events-auto relative w-[220px] h-[28px] bg-[#7c3aed] shadow-[inset_0_-4px_#5b21b6,0_8px_18px_rgba(91,33,182,0.16)] rounded-r-[12px] ${
                            hasChild ? "rounded-bl-[5px]" : "rounded-bl-[14px]"
                          }`}
                        >
                          {/* Top LEGO stud on C-foot to lock with last block in "Иначе" branch */}
                          <span
                            aria-hidden="true"
                            className="absolute -top-[8px] left-[60px] w-[44px] h-[10px] rounded-t-[6px] bg-[#7c3aed]"
                          />
                        </div>
                      </div>
                    ) : !motorBlock ? (
                      <div className="text-[16px] font-extrabold tracking-tight whitespace-nowrap drop-shadow-xs">
                        ▶ &nbsp;Когда программа запускается
                      </div>
                    ) : (
                      <div className="group flex flex-nowrap items-center h-full px-5 gap-3">
                        {/* Base inline action: Начать движение [порт] [вперёд] */}
                        <div className="shrink-0 flex items-center gap-2.5">
                          <span className="text-[16px] font-extrabold whitespace-nowrap tracking-tight">
                            Начать движение
                          </span>
                          <select
                            aria-label={
                              paired ? "Порт первого мотора" : "Порт мотора"
                            }
                            value={block.motor || "A"}
                            onChange={(e) =>
                              project &&
                              saveBlocks(
                                updateDrive(
                                  blocks,
                                  block.id,
                                  { motor: e.target.value },
                                  project.hub
                                )
                              )
                            }
                            className="h-[38px] rounded-full px-3.5 bg-white text-[#0d3b4c] font-extrabold text-[15px] shadow-xs cursor-pointer"
                          >
                            {motorPorts.map((port) => (
                              <option key={port} value={port}>
                                {port}
                              </option>
                            ))}
                          </select>
                          <select
                            aria-label={
                              paired
                                ? "Направление первого мотора"
                                : "Направление мотора"
                            }
                            value={block.direction || "forward"}
                            onChange={(e) =>
                              project &&
                              saveBlocks(
                                updateDrive(
                                  blocks,
                                  block.id,
                                  {
                                    direction: e.target.value as MotorDirection,
                                  },
                                  project.hub
                                )
                              )
                            }
                            className="h-[38px] rounded-full px-3.5 bg-white text-[#0d3b4c] font-extrabold text-[15px] shadow-xs cursor-pointer"
                          >
                            <option value="forward">вперёд</option>
                            <option value="backward">назад</option>
                          </select>

                          {paired && (
                            <>
                              <span className="text-[16px] font-extrabold opacity-95">
                                и
                              </span>
                              <select
                                aria-label="Порт второго мотора"
                                value={block.motor2 || "B"}
                                onChange={(e) =>
                                  project &&
                                  saveBlocks(
                                    updateDrive(
                                      blocks,
                                      block.id,
                                      { motor2: e.target.value },
                                      project.hub
                                    )
                                  )
                                }
                                className="h-[38px] rounded-full px-3.5 bg-white text-[#0d3b4c] font-extrabold text-[15px] shadow-xs cursor-pointer"
                              >
                                {motorPorts.map((port) => (
                                  <option key={port} value={port}>
                                    {port}
                                  </option>
                                ))}
                              </select>
                              <select
                                aria-label="Направление второго мотора"
                                value={block.direction2 || "backward"}
                                onChange={(e) =>
                                  project &&
                                  saveBlocks(
                                    updateDrive(
                                      blocks,
                                      block.id,
                                      {
                                        direction2: e.target
                                          .value as MotorDirection,
                                      },
                                      project.hub
                                    )
                                  )
                                }
                                className="h-[38px] rounded-full px-3.5 bg-white text-[#0d3b4c] font-extrabold text-[15px] shadow-xs cursor-pointer"
                              >
                                <option value="forward">вперёд</option>
                                <option value="backward">назад</option>
                              </select>
                            </>
                          )}
                        </div>

                        {/* Attached Modules Inline in natural reading order */}
                        {(["speed", "power", "travel"] as const)
                          .filter((mod) => modules.includes(mod))
                          .map((mod) => (
                            <div
                              key={mod}
                              className="shrink-0 flex items-center gap-2.5 pl-3.5 border-l border-white/30"
                            >
                              <span className="whitespace-nowrap text-[16px] font-extrabold tracking-tight">
                                {mod === "travel"
                                  ? "на"
                                  : mod === "speed"
                                    ? "со скоростью"
                                    : "с мощностью"}
                              </span>
                              {mod === "travel" ? (
                                <>
                                  <input
                                    type="number"
                                    min="0.01"
                                    max="10000"
                                    step="any"
                                    aria-label="Значение движения"
                                    value={block.value ?? 1}
                                    onChange={(e) => {
                                      const val = Number(e.target.value)
                                      if (
                                        !project ||
                                        !Number.isFinite(val) ||
                                        val < 0.01 ||
                                        val > 10000
                                      )
                                        return
                                      saveBlocks(
                                        updateDrive(
                                          blocks,
                                          block.id,
                                          { value: val },
                                          project.hub
                                        )
                                      )
                                    }}
                                    className="w-[78px] h-[38px] rounded-full px-3 text-center bg-white text-[#0d3b4c] font-extrabold text-[15px] shadow-xs"
                                  />
                                  <select
                                    aria-label="Единица измерения"
                                    value={block.unit || "rotations"}
                                    onChange={(e) =>
                                      project &&
                                      saveBlocks(
                                        updateDrive(
                                          blocks,
                                          block.id,
                                          {
                                            unit: e.target.value as TravelUnit,
                                          },
                                          project.hub
                                        )
                                      )
                                    }
                                    className="h-[38px] rounded-full px-3.5 bg-white text-[#0d3b4c] font-extrabold text-[15px] shadow-xs cursor-pointer"
                                  >
                                    <option value="rotations">оборотов</option>
                                    <option value="degrees">градусов</option>
                                    <option value="seconds">секунд</option>
                                  </select>
                                </>
                              ) : (
                                <>
                                  <input
                                    type="number"
                                    min="1"
                                    max={mod === "speed" ? "1000" : "100"}
                                    aria-label={
                                      mod === "speed"
                                        ? "Скорость, градусов в секунду"
                                        : "Мощность, процентов"
                                    }
                                    value={
                                      mod === "speed"
                                        ? (block.speed ?? 360)
                                        : (block.power ?? 50)
                                    }
                                    onChange={(e) => {
                                      const val = Number(e.target.value)
                                      if (!project || !Number.isFinite(val))
                                        return
                                      saveBlocks(
                                        updateDrive(
                                          blocks,
                                          block.id,
                                          { [mod]: val },
                                          project.hub
                                        )
                                      )
                                    }}
                                    className="w-[80px] h-[38px] rounded-full px-3 text-center bg-white text-[#0d3b4c] font-extrabold text-[15px] shadow-xs"
                                  />
                                  <span className="text-[14px] font-extrabold text-white/95">
                                    {mod === "speed" ? "°/с" : "%"}
                                  </span>
                                </>
                              )}
                              <button
                                type="button"
                                aria-label={`Удалить модуль ${mod}`}
                                onClick={() =>
                                  project &&
                                  saveBlocks(
                                    updateDrive(
                                      blocks,
                                      block.id,
                                      {
                                        modules: modules.filter(
                                          (m) => m !== mod
                                        ),
                                      },
                                      project.hub
                                    )
                                  )
                                }
                                className="w-[22px] h-[22px] rounded-full bg-white/20 hover:bg-white/40 text-white text-sm leading-none grid place-items-center"
                              >
                                ×
                              </button>
                            </div>
                          ))}

                        {/* Module Picker (+) */}
                        <div data-module-picker="true" className="shrink-0 flex items-center ml-1">
                          <button
                            type="button"
                            aria-label="Добавить модуль мотора"
                            disabled={modules.length >= 3}
                            onClick={() => {
                              if (!project) return
                              const nextModule = (["speed", "power", "travel"] as const)
                                .find((item) => !modules.includes(item))
                              if (!nextModule) return
                              const filtered = modules.filter(
                                (item) => !(nextModule === "power" && item === "speed") && !(nextModule === "speed" && item === "power")
                              )
                              saveBlocks(updateDrive(blocks, block.id, {
                                modules: [...filtered, nextModule],
                                ...(nextModule === "power" ? { unit: "seconds" as const } : {}),
                              }, project.hub))
                            }}
                            className="w-[36px] h-[36px] rounded-full border border-white/55 bg-white/15 hover:bg-white/30 text-white text-xl leading-none font-black grid place-items-center"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {blocks.length === 0 && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-6 py-4 text-center border border-dashed border-[#c9d9df] rounded-[14px] bg-white/80 text-[#66818c] text-sm leading-relaxed pointer-events-none">
                {loadError || (
                  <>
                    Перетащите блок «Когда программа запускается» из меню на
                    доску
                    <br />
                    <small className="text-[#8aa0a9]">
                      Доску можно двигать, удерживая пустое место
                    </small>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Sheets Bar */}
          <div
            aria-label="Листы проекта"
            className="flex items-center shrink-0 gap-1.5 px-3 py-2 min-h-[48px] border-t border-[#dce8ec] bg-[#edf4f6]"
          >
            <div
              role="tablist"
              aria-label="Листы"
              className="flex gap-1 overflow-x-auto min-w-0 flex-1"
            >
              {sheetState.sheets.map((sheet) => {
                const active = sheet.id === sheetState.activeSheetId
                return (
                  <button
                    key={sheet.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => switchSheet(sheet.id)}
                    onDoubleClick={() => {
                      switchSheet(sheet.id)
                      openSheetDialog("rename")
                    }}
                    className={`px-3 py-1.5 min-h-[33px] rounded-[7px] border border-[#d4e1e9] bg-white text-xs whitespace-nowrap max-w-[220px] truncate ${
                      active
                        ? "text-[#087996] border-b-[3px] border-b-[#087996] font-extrabold"
                        : "text-[#31525f] font-semibold"
                    }`}
                  >
                    {sheet.name}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              disabled={sheetState.sheets.length >= MAX_SHEETS}
              onClick={() => openSheetDialog("add")}
              aria-label="Добавить лист"
              className="px-3 py-1.5 min-h-[33px] rounded-[7px] border border-[#d4e1e9] bg-white text-[#31525f] font-extrabold disabled:opacity-40"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => openSheetDialog("rename")}
              aria-label="Переименовать активный лист"
              className="px-3 py-1.5 min-h-[33px] rounded-[7px] border border-[#d4e1e9] bg-white text-[#31525f] font-extrabold"
            >
              ✎
            </button>
            <button
              type="button"
              disabled={sheetState.sheets.length <= 1}
              onClick={() => openSheetDialog("delete")}
              aria-label="Удалить активный лист"
              className="px-3 py-1.5 min-h-[33px] rounded-[7px] border border-[#d4e1e9] bg-white text-[#31525f] font-extrabold disabled:opacity-40"
            >
              ×
            </button>
          </div>

          <div className="shrink-0 text-[11px] leading-normal bg-white text-[#66818c] px-3 py-1.5">
            Лист: <strong>{currentSheet?.name}</strong> · Соедините блоки:
            поднесите верх блока к низу блока «Когда программа запускается» или
            внутрь скобки «Если … то». Цепочки выполняются сверху вниз.
          </div>
        </main>
      </div>

      {/* Drag Ghost from Palette */}
      {gesture?.kind === "palette" && (
        <div
          style={{
            left: `${gesture.clientX}px`,
            top: `${gesture.clientY}px`,
          }}
          className={`fixed z-50 pointer-events-none opacity-85 -translate-x-1/2 -translate-y-1/2 scale-90 px-4 flex items-center text-white font-extrabold text-xs ${
            gesture.type === "start"
              ? "w-[240px] h-[52px] rounded-t-[20px] rounded-b-[12px] bg-[#f59e0b] shadow-[inset_0_-6px_#d97706]"
              : gesture.type === "if"
                ? "w-[220px] h-[56px] rounded-[12px] bg-[#7c3aed] shadow-[inset_0_-6px_#5b21b6]"
                : gesture.type === "pair"
                  ? "w-[220px] h-[56px] rounded-[12px] bg-[#107e79] shadow-[inset_0_-6px_#086560]"
                  : "w-[220px] h-[56px] rounded-[12px] bg-[#0589b1] shadow-[inset_0_-6px_#00759b]"
          }`}
        >
          {gesture.type === "start"
            ? "▶  Когда программа запускается"
            : gesture.type === "if"
              ? "Если … то (Что если)"
              : gesture.type === "pair"
                ? "⇉  Связанные моторы"
                : "↗  Движение мотора"}
        </div>
      )}

      {/* Bluetooth Modal */}
      {bluetoothOpen && (
        <div className="fixed inset-0 z-50 bg-[#112a36]/50 grid place-items-center p-4">
          <div className="w-full max-w-[420px] rounded-[18px] border border-[#dce8ec] bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-black mb-3">Bluetooth</h2>
            <p className="text-sm text-[#53707c] leading-relaxed">
              Подключение робота в редакторе появится позже. Блоки сейчас
              сохраняются без соединения с хабом.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              {project?.hub === "spike" && (
                <a
                  href="/controller.html"
                  className="mr-auto text-[13px] font-bold text-[#087996] hover:underline"
                >
                  Открыть прежний пульт
                </a>
              )}
              <Button type="button" onClick={() => setBluetoothOpen(false)}>
                Понятно
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Pybricks Code Modal */}
      {codeModal.open && (
        <div className="fixed inset-0 z-50 bg-[#112a36]/50 grid place-items-center p-4">
          <div className="w-full max-w-[600px] rounded-[18px] border border-[#dce8ec] bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-black mb-2">{codeModal.title}</h2>
            <p className="text-sm text-[#53707c] leading-relaxed mb-4">
              Экспортируется активный лист. Цепочки выполняются сверху вниз.
              Загрузите файл в Pybricks Code и запустите на хабе.
            </p>
            <textarea
              readOnly
              aria-label="Код программы Pybricks"
              value={codeModal.code}
              className="w-full h-[210px] p-3 border border-[#dce8ec] rounded-[9px] font-mono text-[13px] leading-relaxed text-[#18313b] bg-[#f8fbfc]"
            />
            <div className="flex items-center justify-end gap-3 mt-5">
              <Button type="button" variant="outline" onClick={handleDownloadPy}>
                Скачать .py
              </Button>
              <Button
                type="button"
                onClick={() =>
                  setCodeModal((prev) => ({ ...prev, open: false }))
                }
              >
                Закрыть
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sheet Add/Rename/Delete Modal */}
      {sheetModal.open && (
        <div className="fixed inset-0 z-50 bg-[#112a36]/50 grid place-items-center p-4">
          <div className="w-full max-w-[420px] rounded-[18px] border border-[#dce8ec] bg-white p-6 shadow-2xl">
            <form onSubmit={handleSheetSubmit}>
              <h2 className="text-xl font-black mb-4">
                {sheetModal.action === "add"
                  ? "Новый лист"
                  : sheetModal.action === "delete"
                    ? "Удалить лист?"
                    : "Переименовать лист"}
              </h2>
              {sheetModal.action !== "delete" ? (
                <div className="grid gap-2">
                  <Label htmlFor="sheetNameInput">Название листа</Label>
                  <Input
                    id="sheetNameInput"
                    maxLength={40}
                    autoFocus
                    value={sheetModal.name}
                    onChange={(e) =>
                      setSheetModal((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                  />
                </div>
              ) : (
                <p className="text-sm text-[#53707c]">
                  Удалить «{currentSheet?.name}» вместе с блоками?
                </p>
              )}
              {sheetModal.error && (
                <p role="alert" className="text-xs font-bold text-[#b1372c] mt-3">
                  {sheetModal.error}
                </p>
              )}
              <div className="flex items-center justify-end gap-3 mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setSheetModal((prev) => ({ ...prev, open: false }))
                  }
                >
                  Отмена
                </Button>
                <Button
                  type="submit"
                  variant={
                    sheetModal.action === "delete" ? "destructive" : "default"
                  }
                >
                  {sheetModal.action === "delete" ? "Удалить" : "Сохранить"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function EditorPage() {
  return (
    <React.Suspense
      fallback={
        <div className="h-dvh grid place-items-center bg-[#f5f8fa] text-sm font-bold text-[#57717d]">
          Загрузка редактора…
        </div>
      }
    >
      <EditorWorkspace />
    </React.Suspense>
  )
}
