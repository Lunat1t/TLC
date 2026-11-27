"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowRight,
  ArrowRightLeft,
  Bluetooth,
  CircleDot,
  Cog,
  Compass,
  Gamepad2,
  GitBranch,
  LayoutGrid,
  Monitor,
  Navigation,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RectangleHorizontal,
  RotateCw,
  Settings2,
  Square,
  Trash2,
  Waves,
  Repeat,
  Workflow,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAccountProjects } from "@/components/lab/account-projects"
import { workspaceValuesEqual } from "@/lib/workspace-sync"
import {
  HUBS,
  type RobotProject,
} from "@/lib/projects"
import {
  IF_FOOT_HEIGHT,
  IF_INDENT,
  conditionSlotX,
  isContainerType,
  IF_MID_HEIGHT,
  IF_TOP_HEIGHT,
  addBlock,
  attachChain,
  blockTotalHeight,
  chainIds,
  generatePybricks,
  ifInnerHeight,
  isPairedBlock,
  layoutChains,
  moveChain,
  readSheets,
  removeBlock,
  snapTargetInfo,
  updateDrive,
  type BlockType,
  type BranchSlot,
  type MotorDirection,
  type MotorPanelButton,
  MAX_PYTHON_CODE_CHARS,
  type SheetEditorMode,
  type SheetState,
  type TravelUnit,
  type WorkspaceBlock,
} from "@/lib/workspace"
import {
  BlockErrorBar,
  ChassisBlock,
  ControllerButtonBlock,
  ControllerStopBlock,
  SensorBlock,
} from "@/components/editor/controller-blocks"
import { ModuleBar } from "@/components/editor/module-bar"
import { ConditionSlot } from "@/components/editor/condition-slot"
import { LoopBlock } from "@/components/editor/loop-block"
import {
  DEFAULT_DRIVE_SETTINGS,
  compileControllerProgram,
  resolveProjectChassis,
  type DrivePort,
  type DriveSettings,
} from "@/lib/controller-program"
import { ControlAreaView } from "@/components/editor/control-area"
import { PybricksWorkspace } from "@/components/editor/pybricks-workspace"
import { DirectionPalettePreview, DistanceGaugePalettePreview, MotorButtonsPalettePreview } from "@/components/editor/direction-control"
import { useRobotSession } from "@/components/editor/robot-session"
import { HubPortsPanel } from "@/components/editor/hub-ports"
import { describeHubPorts, isMissingMotor } from "@/lib/hub-ports"
import {
  enterEditorLandscape,
  requestEditorLandscape,
  shouldRequireEditorLandscape,
} from "@/lib/editor-orientation"
import { controllerRuntimeErrors } from "@/lib/controller-program"
import {
  CONTROL_INPUTS,
  CONTROL_MIN,
  DIRECTION_CONTROLS,
  type DirectionControlKind,
  isDirectionControl,
  isPlaceableControl,
  validateControlLayout,
  type ControlArea,
  type ControlInstance,
  type ControlLayout,
  type PlaceableControlKind,
} from "@/lib/control-workspace"

const ALL_BLOCKS = {
  id: "all",
  label: "Все блоки",
  icon: LayoutGrid,
  color: "#5f5951",
} as const

const DISPLAY_LABEL = "Дисплей"
const DISPLAY_SIZE = [224, 160] as const
const GAUGE_LABEL = "Дальномер"

const BLOCK_CATEGORIES = [
  {
    id: "events",
    label: "События",
    icon: Play,
    color: "#8a5f00",
    blocks: [
      { type: "start", label: "При запуске", icon: Play },
      { type: "button", event: "hold", label: "Кнопка пульта", icon: Gamepad2 },
    ],
  },
  {
    id: "motion",
    label: "Движение",
    icon: ArrowRight,
    color: "#1c6c8c",
    blocks: [
      { type: "chassis", label: "Ехать", icon: Navigation },
      { type: "drive", label: "Движение мотора", icon: ArrowRight },
      { type: "stop", label: "Стоп мотора", icon: Square },
    ],
  },
  {
    id: "sensors",
    label: "Датчики",
    icon: Waves,
    color: "#3e7a2c",
    blocks: [
      { type: "sensor", label: "Датчик", icon: Waves },
    ],
  },
  {
    id: "logic",
    label: "Логика",
    icon: Workflow,
    color: "#b4570a",
    blocks: [
      { type: "loop", label: "Повторять", icon: Repeat },
      { type: "if", label: "Если / иначе", icon: Workflow },
    ],
  },
  {
    id: "controls",
    label: "Пульт",
    icon: Gamepad2,
    color: "#4b3420",
    blocks: [
      { type: "area", label: "Область управления", icon: RectangleHorizontal },
      { type: "motor-buttons", label: "Кнопки моторов", icon: Gamepad2 },
      { type: "drive-turn", label: DIRECTION_CONTROLS["drive-turn"].label, icon: ArrowRightLeft },
      { type: "drive-linear", label: DIRECTION_CONTROLS["drive-linear"].label, icon: ArrowDownUp },
      { type: "display", label: DISPLAY_LABEL, icon: Monitor },
      { type: "distance-gauge", label: GAUGE_LABEL, icon: Waves },
    ],
  },
] as const

const PALETTE_FILTERS = [ALL_BLOCKS, ...BLOCK_CATEGORIES]
const COMPACT_PALETTE_QUERY = "(min-width: 768px)"

function pointerOver(element: HTMLElement | null, x: number, y: number) {
  return element?.contains(document.elementFromPoint(x, y)) ?? false
}

function pointerInRect(element: HTMLElement | null, x: number, y: number) {
  if (!element) return false
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return false
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

function panelOverlapsControls(
  area: ControlArea,
  controls: readonly ControlInstance[],
  panel: { x: number; y: number; width: number; height: number },
) {
  return controls.some(control => {
    if (control.areaId !== area.id || !isPlaceableControl(control.kind)) return false
    const left = area.x + control.x
    const top = area.y + 44 + control.y
    return panel.x < left + control.width && panel.x + panel.width > left
      && panel.y < top + control.height && panel.y + panel.height > top
  })
}

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
      initialOverrides?: Partial<WorkspaceBlock>
    }

function EditorWorkspace() {
  const library = useAccountProjects()
  const projects = library.projects
  const loadedProjectRef = React.useRef<string | null>(null)
  const [reloadProject, setReloadProject] = React.useState(0)
  const writeQueueRef = React.useRef<Promise<unknown>>(Promise.resolve())
  const queuedWritesRef = React.useRef(0)
  const editStateRef = React.useRef<{ project: RobotProject; projects: RobotProject[] } | null>(null)
  const searchParams = useSearchParams()
  const projectId = searchParams.get("id")

  const boardRef = React.useRef<HTMLDivElement | null>(null)
  const paletteRef = React.useRef<HTMLElement | null>(null)
  const storageRawRef = React.useRef<string | null>(null)
  const saveBusyRef = React.useRef(false)
  const [renaming,setRenaming]=React.useState(false),[nameDraft,setNameDraft]=React.useState("")
  const [project, setProject] = React.useState<RobotProject | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  const [sheetState, setSheetState] = React.useState<SheetState>(() =>
    readSheets(null, "spike")
  )
  const [panX, setPanX] = React.useState(320)
  const [panY, setPanY] = React.useState(220)
  const [zoom, setZoom] = React.useState(1)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [pybricksError, setPybricksError] = React.useState("")
  const [pendingPybricksRun, setPendingPybricksRun] = React.useState(false)
  const pySaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [compactPalette, setCompactPalette] = React.useState(false)
  const [paletteExpanded, setPaletteExpanded] = React.useState<boolean | null>(null)
  const [blockCategory, setBlockCategory] = React.useState<(typeof PALETTE_FILTERS)[number]["id"]>("all")
  const paletteOpen = paletteExpanded ?? false
  const trashRef = React.useRef<HTMLDivElement | null>(null)
  const [trashHot, setTrashHot] = React.useState(false)

  React.useEffect(() => {
    const media = window.matchMedia(COMPACT_PALETTE_QUERY)
    const update = () => setCompactPalette(!media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  const [saveMessage, setSaveMessage] = React.useState<{
    text: string
    isError: boolean
  }>({ text: "Сохранено", isError: false })

  const [gesture, setGesture] = React.useState<DragGesture | null>(null)
  const [panelResize, setPanelResize] = React.useState<{id:string;width:number;height:number}|null>(null)
  const [buttonDrag, setButtonDrag] = React.useState<{
    blockId: string
    color: MotorPanelButton
    pointerId: number
    startX: number
    startY: number
    dx: number
    dy: number
  } | null>(null)
  const [pressedPanelButtons, setPressedPanelButtons] = React.useState<string[]>([])
  const [snapTargetSlot, setSnapTargetSlot] = React.useState<{
    id: string
    branch?: BranchSlot
  } | null>(null)
  const [justAddedId, setJustAddedId] = React.useState<string | null>(null)
  const [justSnappedIds, setJustSnappedIds] = React.useState<string[]>([])
  const [justSnappedHeadId, setJustSnappedHeadId] = React.useState<
    string | null
  >(null)

  const [checking, setChecking] = React.useState(false)
  const editViewRef = React.useRef<{panX:number;panY:number;zoom:number}|null>(null)
  const [starting, setStarting] = React.useState(false)
  const [startError, setStartError] = React.useState("")
  const [robotMenuOpen, setRobotMenuOpen] = React.useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = React.useState(false)
  const [runPromptOpen, setRunPromptOpen] = React.useState(false)
  const [bleSupport, setBleSupport] = React.useState<{ checked: boolean; available: boolean; reason: string }>({
    checked: false,
    available: true,
    reason: "",
  })
  const robotMenuRef = React.useRef<HTMLDivElement | null>(null)
  const moreMenuRef = React.useRef<HTMLDivElement | null>(null)
  const runButtonRef = React.useRef<HTMLButtonElement | null>(null)
  const wasRunPromptOpen = React.useRef(false)
  const {state: robotState, ref: sessionRef} = useRobotSession()
  const editorRootRef = React.useRef<HTMLDivElement | null>(null)
  const rotateButtonRef = React.useRef<HTMLButtonElement | null>(null)
  const [landscapeBlocked, setLandscapeBlocked] = React.useState(false)
  const [orientationManualHint, setOrientationManualHint] = React.useState(false)
  React.useEffect(() => requestEditorLandscape(window.screen?.orientation, document), [])
  React.useEffect(() => {
    const pointerQuery = typeof window.matchMedia === "function" ? window.matchMedia("(pointer: coarse)") : null
    const update = () => {
      const blocked = shouldRequireEditorLandscape({
        width: window.innerWidth,
        height: window.innerHeight,
        coarsePointer: Boolean(pointerQuery?.matches),
      })
      setLandscapeBlocked(blocked)
      if (!blocked) setOrientationManualHint(false)
    }
    update()
    window.addEventListener("resize", update)
    window.addEventListener("orientationchange", update)
    pointerQuery?.addEventListener?.("change", update)
    window.screen?.orientation?.addEventListener?.("change", update)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("orientationchange", update)
      pointerQuery?.removeEventListener?.("change", update)
      window.screen?.orientation?.removeEventListener?.("change", update)
    }
  }, [])
  React.useEffect(() => {
    const el = editorRootRef.current
    if (el) {
      el.inert = landscapeBlocked
    }
    if (landscapeBlocked) {
      rotateButtonRef.current?.focus()
    }
  }, [landscapeBlocked])
  React.useEffect(() => {
    const hasBluetooth = typeof navigator !== "undefined" && Boolean((navigator as Navigator & { bluetooth?: unknown }).bluetooth)
    const isSecure = typeof window !== "undefined" && window.isSecureContext
    if (!isSecure) {
      setBleSupport({ checked: true, available: false, reason: "Для Bluetooth нужен адрес по HTTPS." })
    } else if (!hasBluetooth) {
      setBleSupport({ checked: true, available: false, reason: "Нужен Chrome или Edge на компьютере или Android." })
    } else {
      setBleSupport({ checked: true, available: true, reason: "" })
    }
  }, [])

  React.useEffect(() => {
    if (wasRunPromptOpen.current && !runPromptOpen) {
      runButtonRef.current?.focus()
    }
    wasRunPromptOpen.current = runPromptOpen
  }, [runPromptOpen])
  const inputStarted = React.useRef<number | null>(null)
  const dispatchControl = React.useCallback((target:{controlId:string;input:string},event:"pressed"|"released")=>{
    if(event==="pressed" && (robotState.program==="trial-running"||robotState.program==="live-running")) inputStarted.current=performance.now()
    sessionRef.current?.dispatch(target,event)
  },[robotState.program,sessionRef])
  React.useEffect(()=>{
    if (!checking || !["trial-running","live-running"].includes(robotState.program)) setPressedPanelButtons([])
  },[checking,robotState.program])
  React.useLayoutEffect(()=>{
    if(inputStarted.current===null)return
    const start=inputStarted.current;inputStarted.current=null
    requestAnimationFrame(()=>{performance.measure("tlc.control.input-to-frame",{start,end:performance.now()});if(performance.getEntriesByName("tlc.control.input-to-frame").length>100)performance.clearMeasures("tlc.control.input-to-frame")})
  },[robotState.log])
  const [codeModal, setCodeModal] = React.useState<{
    open: boolean
    title: string
    code: string
  }>({ open: false, title: "", code: "" })
  const [chassisDialogOpen, setChassisDialogOpen] = React.useState(false)
  const [chassisDraft, setChassisDraft] = React.useState<DriveSettings>({ ...DEFAULT_DRIVE_SETTINGS })
  const [panelErrorModal, setPanelErrorModal] = React.useState<string | null>(null)

  const latestSheetsRef = React.useRef<SheetState>(sheetState)
  React.useEffect(() => {
    latestSheetsRef.current = sheetState
  }, [sheetState])

  const currentSheet = React.useMemo(
    () =>
      sheetState.sheets.find((s) => s.id === sheetState.activeSheetId) ||
      sheetState.sheets[0],
    [sheetState]
  )

  const blocks = currentSheet?.blocks || []
  const editorMode: SheetEditorMode = currentSheet?.editorMode === "pybricks" ? "pybricks" : "blocks"
  const sheetPythonCode = currentSheet?.pythonCode ?? ""
  const sheetPythonDirty = Boolean(currentSheet?.pythonDirty)

  React.useEffect(() => {
    let cancelled = false
    if (!library.ready) return
    const loadKey = `${library.userId || "guest"}:${projectId || ""}`
    if (loadedProjectRef.current === loadKey) return
    async function load() {
    try {
      const prepared = await library.prepare(projectId || "")
      if (cancelled) return
      loadedProjectRef.current = loadKey
      storageRawRef.current = prepared.raw
      if (prepared.readOnly) setSaveMessage({ text: "Только просмотр: безопасное сохранение в этом браузере недоступно.", isError: true })
      const loaded = prepared.projects
      const found = loaded.find((item) => item.id === projectId)
      if (!found) {
        editStateRef.current = null
        setProject(null)
        setLoadError("Проект не найден. Выберите проект из списка.")
        setSaveMessage({ text: "Ошибка проекта", isError: true })
        return
      }
      const initialSheets = readSheets(found.workspace, found.hub)
      const active =
        initialSheets.sheets.find(
          (s) => s.id === initialSheets.activeSheetId
        ) || initialSheets.sheets[0]

      editStateRef.current = { project: found, projects: loaded }
      setProject(found)
      setSheetState(initialSheets)
      setSaveMessage({ text: library.userId ? "Загружено из облака" : "Загружено из браузера", isError: false })
      setLoadError(null)
      document.title = `${found.name} — Brick Studio`

      requestAnimationFrame(() => {
        const board = boardRef.current
        const defaultX = board ? Math.round(board.clientWidth / 2) : 360
        const defaultY = board ? Math.round(board.clientHeight / 2) : 240
        setPanX(active?.view?.panX ?? defaultX)
        setPanY(active?.view?.panY ?? defaultY)
        setZoom(active?.view?.zoom ?? 1)
      })
    } catch (err) {
      if (cancelled) return
      setLoadError(
        err instanceof Error ? err.message : "Проект недоступен."
      )
      setSaveMessage({ text: "Ошибка проекта", isError: true })
    }
    }
    void load()
    return () => { cancelled = true }
  }, [projectId, library.ready, library.userId, library.prepare, reloadProject])

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

  const queueProgramSave = React.useCallback((nextProjects: RobotProject[], updated: RobotProject, nextSheets?: SheetState): Promise<boolean> => {
    let draft: Promise<Awaited<ReturnType<typeof library.writeDraft>>>
    try {
      draft = Promise.resolve(library.writeDraft(updated.id, nextProjects, storageRawRef.current))
      void draft.catch(() => {}) // The ordered queue reports this failure before attempting a cloud write.
    }
    catch (error) {
      setSaveMessage({ text: error instanceof Error ? error.message : "Не удалось сохранить резервную копию программы.", isError: true })
      return Promise.resolve(false)
    }
    editStateRef.current = { project: updated, projects: nextProjects }
    setProject(updated)
    if (nextSheets) setSheetState(nextSheets)
    queuedWritesRef.current++
    saveBusyRef.current = true
    setSaveMessage({ text: library.userId ? "Сохраняем в облако…" : "Сохраняем в браузере…", isError: false })
    const task = writeQueueRef.current.catch(() => {}).then(async () => {
      try {
        const durableDraft = await draft
        storageRawRef.current = await library.save(nextProjects, storageRawRef.current)
        await library.acknowledgeDraft(durableDraft, storageRawRef.current)
        if (queuedWritesRef.current === 1) setSaveMessage({ text: library.userId ? "Сохранено в облаке" : "Сохранено в браузере", isError: false })
        return true
      } catch (error) {
        setSaveMessage({ text: error instanceof Error ? error.message : "Не удалось сохранить", isError: true })
        return false
      } finally {
        queuedWritesRef.current--
        saveBusyRef.current = queuedWritesRef.current > 0
      }
    })
    writeQueueRef.current = task
    return task
  }, [library.save, library.userId, library.writeDraft, library.acknowledgeDraft])

  async function renameProgram() {
    const current = editStateRef.current
    if (!current) return
    const name = nameDraft.trim().slice(0, 64)
    if (!name) { setSaveMessage({ text: "Введите название программы.", isError: true }); return }
    const updated = { ...current.project, name, updatedAt: new Date().toISOString() }
    const next = current.projects.map(item => item.id === updated.id ? updated : item)
    if (await queueProgramSave(next, updated)) {
      setRenaming(false)
      document.title = `${name} — Brick Studio`
    }
  }

  const persistSheets = React.useCallback(
    async (nextState: SheetState, nextLayout?: ControlLayout, nextChassis?: DriveSettings): Promise<boolean> => {
      const current = editStateRef.current
      if (!current) return false
      const updated: RobotProject = {
        ...current.project,
        updatedAt: new Date().toISOString(),
        workspace: {
          ...current.project.workspace,
          ...nextState,
          ...(nextLayout ? { controlLayout: nextLayout } : {}),
          ...(nextChassis ? { chassis: nextChassis } : {}),
        } as unknown as Record<string, unknown>,
      }
      const nextProjects = current.projects.map(item => item.id === updated.id ? updated : item)
      // Keep a durable draft before reflecting edits or waiting for the network.
      return queueProgramSave(nextProjects, updated, nextState)
    },
    [queueProgramSave]
  )

  const remoteProject = library.projects.find(item => item.id === projectId)
  const remoteChanged = Boolean(library.userId && library.ready && project && !library.saving && !saveBusyRef.current
    && !workspaceValuesEqual(remoteProject ?? null, project))

  const controlLayout = (project?.workspace?.controlLayout as ControlLayout | undefined) || {version:1 as const, areas:[], controls:[]}
  const projectChassis = React.useMemo(() => resolveProjectChassis(project), [project])
  const openChassisDialog = React.useCallback(() => {
    setChassisDraft({ ...projectChassis.settings, speed: projectChassis.settings.speed ?? 360 })
    setChassisDialogOpen(true)
  }, [projectChassis.settings])
  const motorPanelControls = React.useMemo<ControlInstance[]>(() => sheetState.sheets.flatMap(sheet => sheet.blocks).flatMap(block => {
    if (block.type !== "motor-buttons" || !block.controlAreaId) return []
    const area = controlLayout.areas.find(candidate => candidate.id === block.controlAreaId)
    if (!area) return []
    const inputs = (["blue", ...(block.controlModules || [])] as const).filter(color => !(block.hiddenControlButtons || []).includes(color))
    return [{id:block.id,areaId:area.id,kind:"motor-panel",label:"Панель моторов",x:0,y:0,width:block.width||180,height:block.height||132,inputs}]
  }), [sheetState.sheets,controlLayout.areas])
  const controllerControls = React.useMemo(() => [...controlLayout.controls,...motorPanelControls], [controlLayout.controls,motorPanelControls])
  const sheetControlIds = React.useMemo(() => {
    const areaIds = new Set(controlLayout.areas.filter(a => a.sheetId === currentSheet.id).map(a => a.id))
    return new Set(controllerControls.filter(c => areaIds.has(c.areaId)).map(c => c.id))
  }, [controlLayout.areas, controllerControls, currentSheet.id])
  const controllerProgram = React.useMemo(() => project ? compileControllerProgram({...project,workspace:{...project.workspace,...snapshotSheets(),controlLayout:{...controlLayout,controls:controllerControls}}}) : null, [project,snapshotSheets,controlLayout,controllerControls])
  const controllerErrorsByBlockId = React.useMemo(() => {
    const errMap = new Map<string, string>()
    if (!controllerProgram) return errMap
    for (const err of controllerProgram.errors) {
      if (err.severity !== "warning" && err.blockId) {
        errMap.set(err.blockId, err.message)
      }
    }
    return errMap
  }, [controllerProgram])
  const keyTargets = React.useMemo(() => {
    const visible=new Set(controlLayout.areas.filter(a=>a.sheetId===currentSheet.id).map(a=>a.id))
    const controls=controlLayout.controls.filter(c=>visible.has(c.areaId))
    const first=controls.find(c=>c.kind==="drivetrain"||c.kind==="legacy-buttons")
    const defaults:Record<string,string>={up:"ArrowUp",down:"ArrowDown",left:"ArrowLeft",right:"ArrowRight",a:"KeyJ",b:"KeyK",x:"KeyU",y:"KeyI",l:"KeyQ",r:"KeyE"}
    const map:Record<string,{controlId:string;input:string}[]>={}
    for(const c of controls){const bindings=c.keyBindings || (c.id===first?.id?defaults:{})
      for(const [input,key] of Object.entries(bindings)) if(CONTROL_INPUTS[c.kind].includes(input)) (map[key] ||= []).push({controlId:c.id,input})
    }
    return map
  },[controlLayout.areas,controlLayout.controls,currentSheet.id])
  const inputErrors = React.useMemo(() => {
    const errors = controllerProgram ? [...controllerProgram.errors,...controllerRuntimeErrors(controllerProgram,robotState.protocol,new Set(robotState.ports),robotState.sensorPortsKnown?new Set(robotState.sensorPorts):undefined,robotState.sensorPortsKnown?robotState.sensorTypes:undefined)] : []
    const mapped:Record<string,string> = {}
    for (const error of errors) if (error.severity !== "warning" && error.target?.controlId && error.target.input) mapped[`${error.target.controlId}:${error.target.input}`] = error.message
    for(const [key,targets] of Object.entries(keyTargets)) if(targets.length>1) for(const target of targets) mapped[`${target.controlId}:${target.input}`]=`Клавиша ${key} назначена нескольким кнопкам.`
    return mapped
  },[controllerProgram,robotState.protocol,robotState.ports,keyTargets])
  function enterCheckView() {
    if (!editViewRef.current) editViewRef.current = {panX,panY,zoom}
    const area = controlLayout.areas.find(a=>a.sheetId===currentSheet.id)
    const board = boardRef.current
    if (area && board) {
      const scale = Math.min(1, Math.max(0.5, Math.min((board.clientWidth-32)/area.width,(board.clientHeight-32)/area.height)))
      setZoom(scale)
      setPanX((board.clientWidth-area.width*scale)/2-area.x*scale)
      setPanY((board.clientHeight-area.height*scale)/2-area.y*scale)
    }
    setGesture(null)
    setSelectedId(null)
    setPaletteExpanded(false)
    setChecking(true)
  }

  async function runSessionProgram(session: NonNullable<typeof sessionRef.current>) {
    if (!controllerProgram) return
    await session.setViewMode('check')
    if (session.getState().transport === 'connected') await session.startHub()
    if (session.getState().viewMode !== 'check') return
    if (session.getState().transport === 'fault') {
      setStartError(session.getState().message)
      return
    }
    if (session.getState().transport !== 'ready') {
      const sheetAreas = new Set(controlLayout.areas.filter(a => a.sheetId === currentSheet.id).map(a => a.id))
      for (const control of controlLayout.controls) {
        if (control.kind === 'distance-gauge' && sheetAreas.has(control.areaId)) {
          const port = control.port || 'C'
          if (session.getState().sensorDistances[port] === undefined) {
            session.setSensorDistance(port, 50)
          }
        }
      }
    }
    await session.startProgram(controllerProgram)
    if (!['trial-running','live-running'].includes(session.getState().program)) {
      setStartError(session.getState().message)
      await session.setViewMode('edit')
      return
    }
    enterCheckView()
  }

  async function runCustomPybricksOnHub(session: NonNullable<typeof sessionRef.current>) {
    if (!project) return
    if (pySaveTimerRef.current) {
      clearTimeout(pySaveTimerRef.current)
      pySaveTimerRef.current = null
    }
    const latestSheet =
      latestSheetsRef.current.sheets.find((s) => s.id === latestSheetsRef.current.activeSheetId) ||
      latestSheetsRef.current.sheets[0]
    if (latestSheet?.pythonDirty) {
      await persistSheets(latestSheetsRef.current)
    }
    setPybricksError("")
    const res = await session.runCustomProgram(latestSheet?.pythonCode ?? sheetPythonCode)
    if (!res.ok && res.error) {
      setPybricksError(res.error)
    }
  }

  async function startProgram() {
    const session = sessionRef.current
    if (!session || starting || checking) return
    if (editorMode === "pybricks") {
      if (!project) return
      if (project.hub === "ev3") {
        setPybricksError("Прямой запуск по Bluetooth доступен только для SPIKE Prime. Для EV3 нажмите «Скачать .py».")
        return
      }
      setStarting(true)
      setPybricksError("")
      try {
        await runCustomPybricksOnHub(session)
      } finally {
        setStarting(false)
      }
      return
    }
    if (!controllerProgram) return
    setStarting(true)
    setStartError("")
    try {
      await runSessionProgram(session)
    } finally { setStarting(false) }
  }

  async function connectAndStart() {
    const session = sessionRef.current
    if (!session || starting) return
    const runPybricks = pendingPybricksRun || editorMode === "pybricks"
    if (!runPybricks && !controllerProgram) return
    setRunPromptOpen(false)
    setPendingPybricksRun(false)
    setRobotMenuOpen(false)
    setStarting(true)
    setStartError("")
    setPybricksError("")
    try {
      await session.connect()
      if (session.getState().transport !== 'connected') {
        if (session.getState().transport === 'fault') {
          if (runPybricks) setPybricksError(session.getState().message)
          else setStartError(session.getState().message)
        }
        return
      }
      if (runPybricks) {
        await runCustomPybricksOnHub(session)
      } else {
        await runSessionProgram(session)
      }
    } finally { setStarting(false) }
  }

  function handleRunClick() {
    if (!project || !sessionRef.current || starting || checking) return
    if (['connecting', 'uploading', 'starting-hub'].includes(robotState.transport)) return
    setRobotMenuOpen(false)
    setMoreMenuOpen(false)
    if (editorMode === "pybricks") {
      if (project.hub === "ev3") {
        setPybricksError("Прямой запуск по Bluetooth доступен только для SPIKE Prime. Для EV3 нажмите «Скачать .py».")
        return
      }
      if (robotState.transport === "disconnected" || robotState.transport === "fault") {
        setPybricksError("")
        setPendingPybricksRun(true)
        setRunPromptOpen(true)
        return
      }
      void startProgram()
      return
    }
    if (project.hub === 'spike' && (robotState.transport === 'disconnected' || robotState.transport === 'fault')) {
      setPendingPybricksRun(false)
      setStartError("")
      setRunPromptOpen(true)
      return
    }
    void startProgram()
  }

  async function stopProgram() {
    const session = sessionRef.current
    if (!session) return
    if (session.getState().program === "custom-running" || editorMode === "pybricks") {
      await session.stopCustomProgram()
      setStarting(false)
      return
    }
    if (['uploading', 'starting-hub'].includes(session.getState().transport) || starting) {
      session.cancelStart()
      setStarting(false)
    }
    await session.setViewMode('edit')
    const view=editViewRef.current
    if(view){setPanX(view.panX);setPanY(view.panY);setZoom(view.zoom);editViewRef.current=null}
    setPressedPanelButtons([])
    setChecking(false)
  }

  React.useEffect(() => {
    if (!paletteOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (paletteRef.current && !paletteRef.current.contains(e.target as Node)) setPaletteExpanded(false)
    }
    window.addEventListener("pointerdown", onPointerDown)
    return () => window.removeEventListener("pointerdown", onPointerDown)
  }, [paletteOpen])

  React.useEffect(() => {
    if (!robotMenuOpen && !moreMenuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (robotMenuOpen && robotMenuRef.current && !robotMenuRef.current.contains(target)) setRobotMenuOpen(false)
      if (moreMenuOpen && moreMenuRef.current && !moreMenuRef.current.contains(target)) setMoreMenuOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setRobotMenuOpen(false); setMoreMenuOpen(false) }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [robotMenuOpen, moreMenuOpen])

  React.useEffect(() => {
    if (!runPromptOpen && !chassisDialogOpen && !panelErrorModal) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRunPromptOpen(false)
        setPendingPybricksRun(false)
        setChassisDialogOpen(false)
        setPanelErrorModal(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [runPromptOpen, chassisDialogOpen, panelErrorModal])

  React.useEffect(() => {
    return () => {
      if (pySaveTimerRef.current) clearTimeout(pySaveTimerRef.current)
    }
  }, [])

  React.useEffect(() => () => {void sessionRef.current?.stop("Проект изменён. Запустите программу снова.")}, [projectId,sessionRef])
  React.useEffect(() => {
    const stop=()=>{
      const st=sessionRef.current?.getState()
      if(st && (st.program==='live-running' || st.program==='trial-running')) void sessionRef.current?.stop("Проверка остановлена.")
    }
    const visibility=()=>{if(document.hidden)stop()}
    window.addEventListener("blur",stop);window.addEventListener("pagehide",stop);document.addEventListener("visibilitychange",visibility)
    return ()=>{window.removeEventListener("blur",stop);window.removeEventListener("pagehide",stop);document.removeEventListener("visibilitychange",visibility)}
  },[sessionRef])
  React.useEffect(() => {
    if (!checking) return
    const handle=(e:KeyboardEvent)=>{const element=e.target as HTMLElement;if(!element?.closest('[data-control-check]') || element.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]'))return;const targets=keyTargets[e.code];if(!targets||targets.length!==1||e.repeat)return;e.preventDefault();const target=targets[0];if(inputErrors[`${target.controlId}:${target.input}`])return;dispatchControl(target,e.type==="keydown"?"pressed":"released")}
    window.addEventListener("keydown",handle);window.addEventListener("keyup",handle)
    return ()=>{window.removeEventListener("keydown",handle);window.removeEventListener("keyup",handle)}
  },[checking,keyTargets,inputErrors,dispatchControl])
  function saveLayout(next: ControlLayout) {
    try {validateControlLayout(next,sheetState.sheets.map(s=>s.id));return persistSheets(snapshotSheets(), next)}
    catch(error){setSaveMessage({text:error instanceof Error?error.message:"Неверная раскладка",isError:true});return Promise.resolve(false)}
  }
  async function addControlArea(location: { x: number; y: number }) {
    if (!project) return false
    if (controlLayout.areas.some(area => area.sheetId === currentSheet.id)) {
      setSaveMessage({ text: "На одном листе можно создать только одну область «Управление».", isError: true })
      return false
    }
    if (controlLayout.areas.length >= 12) {
      setSaveMessage({ text: "Можно добавить не более 12 областей.", isError: true })
      return false
    }
    const area = {
      id: newId(), sheetId: currentSheet.id, title: "Управление",
      x: location.x - 320, y: location.y - 20, width: 640, height: 360,
    }
    return saveLayout({ ...controlLayout, areas: [...controlLayout.areas, area] })
  }

  async function addControl(kind: PlaceableControlKind, location: { x: number; y: number }) {
    if (!project) return false
    const area = controlLayout.areas.find(candidate => candidate.sheetId === currentSheet.id
      && location.x >= candidate.x && location.x <= candidate.x + candidate.width
      && location.y >= candidate.y + 44 && location.y <= candidate.y + candidate.height)
    if (!area) {
      setSaveMessage({ text: "Перетащите блок внутрь области «Управление».", isError: true })
      return false
    }

    const siblings = controlLayout.controls.filter(control => control.areaId === area.id)
    if (siblings.length >= 12) {
      setSaveMessage({ text: "В области уже 12 элементов.", isError: true })
      return false
    }
    const panels = blocks.filter(block => block.type === "motor-buttons" && block.controlAreaId === area.id)
      .map(block => ({ x: block.x - area.x, y: block.y - area.y - 44, width: block.width || 180, height: block.height || 132 }))
    const occupied = [...siblings, ...panels]
    const [width, height] = kind === "display" ? DISPLAY_SIZE : CONTROL_MIN[kind]
    const maxX = area.width - width
    const maxY = area.height - 44 - height
    const x = Math.max(0, Math.min(maxX, location.x - area.x - width / 2))
    const y = Math.max(0, Math.min(maxY, location.y - area.y - 44 - height / 2))
    const fits = (x: number, y: number) => !occupied.some(control =>
      x < control.x + control.width && x + width > control.x
      && y < control.y + control.height && y + height > control.y)
    let spot = fits(x, y) ? { x, y } : null
    for (let top = 0; top <= maxY && !spot; top += 16) {
      for (let left = 0; left <= maxX && !spot; left += 16) {
        if (fits(left, top)) spot = { x: left, y: top }
      }
    }
    if (!spot) {
      setSaveMessage({ text: "Увеличьте область: свободного места нет.", isError: true })
      return false
    }
    const label = kind === "display" ? DISPLAY_LABEL : kind === "distance-gauge" ? GAUGE_LABEL : DIRECTION_CONTROLS[kind].label
    const control = { id: newId(), areaId: area.id, kind, label, ...spot, width, height, ...(kind === "distance-gauge" ? { port: "C" } : {}) }
    const nextLayout = { ...controlLayout, controls: [...controlLayout.controls, control] }
    const existingInputControls = controllerControls.filter(c => sheetControlIds.has(c.id) && (c.inputs || CONTROL_INPUTS[c.kind]).length > 0)
    const newInputs = CONTROL_INPUTS[kind]
    if (existingInputControls.length === 0 && newInputs.length > 0 && blocks.some(b => b.type === "button" && !b.target?.controlId)) {
      const boundBlocks = blocks.map(b => b.type === "button" && !b.target?.controlId ? { ...b, target: { controlId: control.id, input: newInputs[0] } } : b)
      try {
        validateControlLayout(nextLayout, sheetState.sheets.map(s => s.id))
        return persistSheets(snapshotSheets(boundBlocks), nextLayout)
      } catch (error) {
        setSaveMessage({ text: error instanceof Error ? error.message : "Неверная раскладка", isError: true })
        return Promise.resolve(false)
      }
    }
    return saveLayout(nextLayout)
  }

  function dragControlFromPalette(e: React.PointerEvent<HTMLButtonElement>, kind: "area" | PlaceableControlKind) {
    if(!project || e.button!==0)return
    e.preventDefault();const element=e.currentTarget,sx=e.clientX,sy=e.clientY;let moved=false
    element.setPointerCapture(e.pointerId)
    const move=(ev:PointerEvent)=>{if(Math.hypot(ev.clientX-sx,ev.clientY-sy)>5)moved=true}
    const clean=()=>{element.removeEventListener("pointermove",move);element.removeEventListener("pointerup",up);element.removeEventListener("pointercancel",cancel)}
    const cancel=()=>clean()
    const up = async (event: PointerEvent) => {
      clean()
      if (!moved || !pointerOver(boardRef.current, event.clientX, event.clientY)) return
      const world = worldFromClient(event.clientX, event.clientY)
      const added = await (kind === "area" ? addControlArea(world) : addControl(kind, world))
      if (added) setPaletteExpanded(false)
    }
    element.addEventListener("pointermove",move);element.addEventListener("pointerup",up);element.addEventListener("pointercancel",cancel)
  }

  const saveBlocks = React.useCallback(
    (nextBlocks: WorkspaceBlock[]) => {
      const nextState = snapshotSheets(nextBlocks)
      return persistSheets(nextState)
    },
    [snapshotSheets, persistSheets]
  )

  const autoBindSigRef = React.useRef<string>("")
  React.useEffect(() => {
    if (!project || saveBusyRef.current) return
    const sheetButtonControls = controllerControls.filter(
      (c) => sheetControlIds.has(c.id) && (c.inputs || CONTROL_INPUTS[c.kind]).length > 0
    )
    if (sheetButtonControls.length !== 1) return
    const single = sheetButtonControls[0]
    const unbound = blocks.filter((b) => b.type === "button" && !b.target?.controlId)
    if (unbound.length === 0) return
    const sig = `${project.id}:${currentSheet.id}:${single.id}:${unbound.map((b) => b.id).join(",")}`
    if (autoBindSigRef.current === sig) return
    autoBindSigRef.current = sig
    const firstInput = (single.inputs || CONTROL_INPUTS[single.kind])[0] || ""
    saveBlocks(
      blocks.map((b) =>
        b.type === "button" && !b.target?.controlId
          ? { ...b, target: { controlId: single.id, input: firstInput } }
          : b
      )
    )
  }, [project, currentSheet.id, controllerControls, sheetControlIds, blocks, saveBlocks])

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
      const movingBlock = blocks.find((block) => block.id === id)
      if (movingBlock?.type === "motor-buttons") {
        const width = movingBlock.width || 180
        const height = movingBlock.height || 132
        const area = movingBlock.controlAreaId
          ? controlLayout.areas.find((candidate) => candidate.id === movingBlock.controlAreaId && candidate.sheetId === currentSheet.id)
          : controlLayout.areas.find((candidate) => candidate.sheetId === currentSheet.id && x + width / 2 >= candidate.x && x + width / 2 <= candidate.x + candidate.width && y + height / 2 >= candidate.y + 44 && y + height / 2 <= candidate.y + candidate.height)
        if (!area) return
        x = Math.max(area.x, Math.min(area.x + area.width - width, x))
        y = Math.max(area.y + 44, Math.min(area.y + area.height - height, y))
        if (panelOverlapsControls(area, controlLayout.controls, { x, y, width, height })) {
          setSaveMessage({ text: "Панель моторов перекрывает другой блок.", isError: true })
          return
        }
        const withArea = blocks.map((block) => block.id === id ? { ...block, controlAreaId: area.id } : block)
        const next = moveChain(withArea, id, x, y)
        saveBlocks(next)
        return
      }
      let next = moveChain(blocks, id, x, y)
      const target = snap ? snapTargetInfo(next, id, x, y) : null
      if (target) {
        next = attachChain(next, id, target.id, target.branch)
        triggerSnapAnimation(next, id)
      }
      saveBlocks(next)
    },
    [blocks, controlLayout.areas, controlLayout.controls, currentSheet.id, saveBlocks, triggerSnapAnimation]
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
    (
      clientX: number,
      clientY: number,
      type: BlockType = "start",
      initialOverrides?: Partial<WorkspaceBlock>
    ) => {
      if (!project) return
      const point = worldFromClient(clientX, clientY)
      try {
        let x = point.x - (type === "sensor" ? 56 : 135)
        let y = point.y - (type === "sensor" ? 20 : 28)
        if (type === "motor-buttons") {
          const width = initialOverrides?.width ?? 180
          const height = initialOverrides?.height ?? 132
          const area = controlLayout.areas.find((candidate) => candidate.sheetId === currentSheet.id && point.x >= candidate.x && point.x <= candidate.x + candidate.width && point.y >= candidate.y + 44 && point.y <= candidate.y + candidate.height)
          if (!area) {
            setSaveMessage({text:"Панель моторов можно добавить только внутрь области «Управление».",isError:true})
            return
          }
          x = Math.max(area.x, Math.min(area.x + area.width - width, point.x - width / 2))
          y = Math.max(area.y + 44, Math.min(area.y + area.height - height, point.y - height / 2))
          if (panelOverlapsControls(area, controlLayout.controls, { x, y, width, height })) {
            setSaveMessage({ text: "Панель моторов перекрывает другой блок.", isError: true })
            return
          }
          initialOverrides = { ...initialOverrides, controlAreaId: area.id }
        }
        if (type === "button" && !initialOverrides?.target) {
          const sheetAreaIds = new Set(controlLayout.areas.filter(a => a.sheetId === currentSheet.id).map(a => a.id))
          const sheetControls = controllerControls.filter(c => sheetAreaIds.has(c.areaId) && (c.inputs || CONTROL_INPUTS[c.kind]).length > 0)
          if (sheetControls.length === 1) {
            const single = sheetControls[0]
            const firstInput = (single.inputs || CONTROL_INPUTS[single.kind])[0] || ""
            initialOverrides = { ...initialOverrides, target: { controlId: single.id, input: firstInput } }
          }
        }
        const id = newId()
        let next = addBlock(blocks, id, x, y, type)
        if (initialOverrides) {
          next = next.map((b) =>
            b.id === id ? { ...b, ...initialOverrides } : b
          )
        }
        if (type === "motor-buttons" && initialOverrides?.controlAreaId) {
          const existingInputControls = controllerControls.filter(c => sheetControlIds.has(c.id) && (c.inputs || CONTROL_INPUTS[c.kind]).length > 0)
          if (existingInputControls.length === 0) {
            next = next.map(b => b.type === "button" && !b.target?.controlId ? { ...b, target: { controlId: id, input: "blue" } } : b)
          }
        }
        const target = snapTargetInfo(next, id, x, y)
        if (target) {
          next = attachChain(next, id, target.id, target.branch)
          triggerSnapAnimation(next, id)
        } else {
          triggerSpawnAnimation(id)
        }
        setSelectedId(id)
        saveBlocks(next)
        setPaletteExpanded(false)
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
      compactPalette,
      worldFromClient,
      blocks,
      controlLayout.areas,
      controlLayout.controls,
      controllerControls,
      currentSheet.id,
      saveBlocks,
      triggerSnapAnimation,
      triggerSpawnAnimation,
    ]
  )

  React.useEffect(() => {
    if (!gesture || gesture.kind !== "palette") return
    const handleMove = (e: PointerEvent) => {
      setGesture((prev) =>
        prev && prev.kind === "palette"
          ? { ...prev, clientX: e.clientX, clientY: e.clientY }
          : prev
      )
      if (pointerOver(boardRef.current, e.clientX, e.clientY)) {
        const pt = worldFromClient(e.clientX, e.clientY)
        const target = snapTargetInfo(
          blocks,
          "__palette__",
          pt.x - (gesture.type === "sensor" ? 56 : 135),
          pt.y - (gesture.type === "sensor" ? 20 : 28),
          48,
          gesture.type as BlockType
        )
        setSnapTargetSlot(target)
      } else {
        setSnapTargetSlot(null)
      }
    }
    const handleUp = (e: PointerEvent) => {
      const type = gesture.type
      const initialOverrides = gesture.initialOverrides
      setGesture(null)
      setSnapTargetSlot(null)
      if (pointerOver(boardRef.current, e.clientX, e.clientY)) {
        addBlockAtClient(e.clientX, e.clientY, type, initialOverrides)
      }
    }
    const handleCancel = () => {
      setGesture(null)
      setSnapTargetSlot(null)
    }
    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", handleUp)
    window.addEventListener("pointercancel", handleCancel)
    return () => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleUp)
      window.removeEventListener("pointercancel", handleCancel)
    }
  }, [gesture, blocks, worldFromClient, addBlockAtClient])

  React.useEffect(() => {
    if (!gesture) setTrashHot(false)
  }, [gesture])

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

  function generateSheetPybricksCode(): { ok: true; code: string } | { ok: false; error: string } {
    if (!project) return { ok: false, error: "Проект ещё не загружен." }
    try {
      const body = generatePybricks(
        blocks,
        project.hub,
        projectChassis.configured ? projectChassis.settings : undefined,
        { comments: true }
      )
      const code = `# Лист: ${currentSheet.name.replace(/[\r\n]/g, " ")}\n${body}`.slice(0, MAX_PYTHON_CODE_CHARS)
      return { ok: true, code }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Не удалось сформировать программу",
      }
    }
  }

  async function switchEditorMode(nextMode: SheetEditorMode) {
    if (!project || checking || starting || robotState.program === "custom-running") return
    if (nextMode === editorMode) return
    if (pySaveTimerRef.current) {
      clearTimeout(pySaveTimerRef.current)
      pySaveTimerRef.current = null
    }
    setSelectedId(null)

    const base = snapshotSheets()
    if (nextMode === "pybricks") {
      let nextCode = currentSheet.pythonCode ?? ""
      let nextDirty = currentSheet.pythonDirty
      let genError = ""
      if (!currentSheet.pythonDirty || !nextCode) {
        const res = generateSheetPybricksCode()
        if (res.ok) {
          nextCode = res.code
          nextDirty = undefined
        } else {
          genError = res.error
          if (!nextCode) {
            nextCode = `# Лист: ${currentSheet.name.replace(/[\r\n]/g, " ")}\n# Исправьте блоки или напишите код на Python\n`
          }
        }
      }
      setPybricksError(genError)
      const nextState: SheetState = {
        ...base,
        sheets: base.sheets.map((s) =>
          s.id === base.activeSheetId
            ? {
                ...s,
                editorMode: "pybricks",
                pythonCode: nextCode,
                ...(nextDirty ? { pythonDirty: true } : { pythonDirty: undefined }),
              }
            : s
        ),
      }
      await persistSheets(nextState)
    } else {
      setPybricksError("")
      const nextState: SheetState = {
        ...base,
        sheets: base.sheets.map((s) =>
          s.id === base.activeSheetId
            ? { ...s, editorMode: undefined }
            : s
        ),
      }
      await persistSheets(nextState)
    }
  }

  function schedulePybricksPersist() {
    if (pySaveTimerRef.current) clearTimeout(pySaveTimerRef.current)
    pySaveTimerRef.current = setTimeout(() => {
      pySaveTimerRef.current = null
      if (saveBusyRef.current) {
        schedulePybricksPersist()
        return
      }
      void persistSheets(latestSheetsRef.current)
    }, 450)
  }

  function handlePybricksCodeChange(nextCode: string) {
    const clipped = nextCode.slice(0, MAX_PYTHON_CODE_CHARS)
    setPybricksError("")
    const nextState: SheetState = {
      ...latestSheetsRef.current,
      sheets: latestSheetsRef.current.sheets.map((s) =>
        s.id === latestSheetsRef.current.activeSheetId
          ? {
              ...s,
              editorMode: "pybricks",
              pythonCode: clipped,
              pythonDirty: true,
            }
          : s
      ),
    }
    const current = editStateRef.current
    if (current) {
      const proposed = { ...current.project, updatedAt: new Date().toISOString(), workspace: { ...current.project.workspace, ...nextState } }
      try {
        void Promise.resolve(library.writeDraft(proposed.id, current.projects.map(item => item.id === proposed.id ? proposed : item), storageRawRef.current))
          .catch(error => setSaveMessage({ text: error instanceof Error ? error.message : "Не удалось сохранить резервную копию.", isError: true }))
      }
      catch (error) { setSaveMessage({ text: error instanceof Error ? error.message : "Не удалось сохранить резервную копию.", isError: true }); return }
    }
    latestSheetsRef.current = nextState
    setSheetState(nextState)
    setSaveMessage({ text: "Не сохранено…", isError: false })
    schedulePybricksPersist()
  }

  async function handleSyncPybricksFromBlocks() {
    if (pySaveTimerRef.current) {
      clearTimeout(pySaveTimerRef.current)
      pySaveTimerRef.current = null
    }
    const res = generateSheetPybricksCode()
    if (!res.ok) {
      setPybricksError(res.error)
      return
    }
    setPybricksError("")
    const base = snapshotSheets()
    const nextState: SheetState = {
      ...base,
      sheets: base.sheets.map((s) =>
        s.id === base.activeSheetId
          ? {
              ...s,
              editorMode: "pybricks",
              pythonCode: res.code,
              pythonDirty: undefined,
            }
          : s
      ),
    }
    await persistSheets(nextState)
  }

  function handleExportCode() {
    void switchEditorMode("pybricks")
  }

  function handleDownloadPy(codeText?: string) {
    const source = codeText ?? (editorMode === "pybricks" ? sheetPythonCode : codeModal.code)
    const blob = new Blob([source], {
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
  const chassisPortsView = React.useMemo(() => describeHubPorts(robotState, motorPorts), [robotState, motorPorts])

  function resizeMotorPanel(e: React.PointerEvent<HTMLButtonElement>, block: WorkspaceBlock) {
    if (!project || !block.controlAreaId) return
    const area = controlLayout.areas.find((candidate) => candidate.id === block.controlAreaId && candidate.sheetId === currentSheet.id)
    if (!area) return
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startW = block.width || 180
    const startH = block.height || 132
    const maxW = Math.min(420, area.x + area.width - block.x)
    const maxH = Math.min(320, area.y + area.height - block.y)
    const widthAt = (clientX: number) => Math.min(maxW, Math.max(144, Math.round(startW + (clientX - startX) / zoom)))
    const heightAt = (clientY: number) => Math.min(maxH, Math.max(112, Math.round(startH + (clientY - startY) / zoom)))
    const move = (ev: PointerEvent) => setPanelResize({id:block.id,width:widthAt(ev.clientX),height:heightAt(ev.clientY)})
    const cleanup = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", cancel)
    }
    const finish = (ev: PointerEvent) => {
      cleanup()
      const width = widthAt(ev.clientX)
      const height = heightAt(ev.clientY)
      setPanelResize(null)
      if (panelOverlapsControls(area, controlLayout.controls, { x: block.x, y: block.y, width, height })) {
        setSaveMessage({ text: "Панель моторов перекрывает другой блок.", isError: true })
        return
      }
      saveBlocks(blocks.map((item) => item.id === block.id ? {...item,width,height} : item))
    }
    const cancel = () => {cleanup();setPanelResize(null)}
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", finish, {once:true})
    window.addEventListener("pointercancel", cancel, {once:true})
  }

  return (
    <>
    <div
      ref={editorRootRef}
      aria-hidden={landscapeBlocked || undefined}
      className="tlc-editor flex flex-col h-dvh bg-[#faf6ee] text-[#252221] select-none overflow-hidden"
    >
      {/* Topbar */}
      <header className="editor-topbar h-[68px] shrink-0 flex items-center gap-4 px-4 md:px-6 bg-white border-b border-[#1d1b1a73] z-10">
        <Link
          href="/dashboard"
          aria-label="К списку проектов"
          className="text-sm font-bold text-[#555049] hover:text-[#302c2b] whitespace-nowrap"
        >
          ← <span className="hidden xs:inline">Проекты</span>
        </Link>

        {library.drafts.some(draft => draft.projectId === projectId) && !library.saving && !saveBusyRef.current && <Link href="/dashboard#drafts" className="text-xs font-bold text-[#a13620]">Есть несохранённая копия — восстановить</Link>}
        {remoteChanged && <button type="button" className="text-xs font-bold text-[#555049]" onClick={() => {
          if (!window.confirm("Программа изменена на другом устройстве. Загрузить облачную версию? Несохранённые изменения редактора будут заменены.")) return
          loadedProjectRef.current = null
          setReloadProject(attempt => attempt + 1)
        }}>Изменения с другого устройства — загрузить</button>}
        {(loadError || saveMessage.isError || library.error) && <button type="button" className="text-xs font-bold text-[#a13620]" onClick={() => {
          const current = editStateRef.current
          const raw = current ? JSON.stringify(current.projects.map(item => item.id === current.project.id ? {
            ...current.project, workspace: { ...current.project.workspace, ...latestSheetsRef.current },
          } : item)) : library.backupRaw()
          if (raw === null) return
          const url = URL.createObjectURL(new Blob([raw], {type:"application/json"}))
          const link = document.createElement("a")
          link.href = url
          link.download = "tlc-projects-backup.json"
          link.click()
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        }}>Скачать копию программ</button>}
        <div className="flex items-baseline gap-3 min-w-0">
          {renaming?<form onSubmit={e=>{e.preventDefault();void renameProgram()}} className="flex gap-2 min-w-0"><input autoFocus aria-label="Название программы" className="min-w-0 w-40 border rounded-lg p-2" maxLength={64} value={nameDraft} onChange={e=>setNameDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setRenaming(false)}}/><button type="submit" aria-label="Сохранить название">✓</button></form>:<button disabled={!project||checking} title="Изменить название" aria-label={`Название программы: ${project?.name||'Проект'}. Изменить`} className="text-[17px] font-bold truncate text-left" onClick={()=>{setNameDraft(project?.name||'');setRenaming(true)}}>{project?project.name:loadError?'Проект недоступен':'Проект'} <span aria-hidden="true">✎</span></button>}
          {project && (
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {HUBS[project.hub]}
            </Badge>
          )}
        </div>

        <span
          role="status"
          className={`ml-auto text-xs font-semibold ${
            (saveMessage.isError || library.error) ? "text-[#b1372c] max-sm:order-last max-sm:w-full" : "hidden whitespace-nowrap text-[#8b8276] sm:inline"
          }`}
        >
          {library.error || (saveMessage.isError ? saveMessage.text : "")}
        </span>

        <div
          role="group"
          aria-label="Режим редактора"
          className="flex items-center rounded-md border border-[#1d1b1a73] bg-[#faf5ec] p-0.5 shrink-0"
        >
          <button
            type="button"
            disabled={!project || checking || starting || robotState.program === "custom-running"}
            aria-pressed={editorMode === "blocks"}
            onClick={() => void switchEditorMode("blocks")}
            className={`min-h-[34px] h-[34px] px-2.5 sm:px-3 rounded-[9px] text-xs font-bold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 ${
              editorMode === "blocks"
                ? "bg-[#555049] text-white shadow-xs"
                : "text-[#3a3634] hover:text-[#252221]"
            }`}
          >
            Блоки
          </button>
          <button
            type="button"
            disabled={!project || checking || starting || robotState.program === "custom-running"}
            aria-pressed={editorMode === "pybricks"}
            onClick={() => void switchEditorMode("pybricks")}
            className={`min-h-[34px] h-[34px] px-2.5 sm:px-3 rounded-[9px] text-xs font-bold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 ${
              editorMode === "pybricks"
                ? "bg-[#555049] text-white shadow-xs"
                : "text-[#3a3634] hover:text-[#252221]"
            }`}
          >
            Pybricks
          </button>
        </div>

        <div ref={robotMenuRef} className="relative">
          <button
            type="button"
            aria-expanded={robotMenuOpen}
            aria-label={`Статус робота: ${robotState.message}`}
            onClick={() => { setMoreMenuOpen(false); setRobotMenuOpen((prev) => !prev) }}
            className="flex min-h-[40px] items-center gap-2 rounded-md border border-[#1d1b1a73] bg-[#fbf7f0] px-3 py-1.5 text-sm font-bold text-[#252221] hover:bg-[#f9f3e9]"
          >
            <span
              aria-hidden="true"
              className={`size-2.5 shrink-0 rounded-full ${
                robotState.transport === "ready" || robotState.transport === "connected"
                  ? "bg-stone-500"
                  : robotState.transport === "connecting"
                    ? "bg-stone-500 animate-pulse"
                    : robotState.transport === "uploading" || robotState.transport === "starting-hub"
                      ? "bg-[#555049] animate-pulse"
                      : robotState.transport === "fault"
                        ? "bg-red-500"
                        : "bg-stone-400"
              }`}
            />
            <Bluetooth size={14} className="shrink-0 text-[#69635a] sm:hidden" aria-hidden="true" />
            <span className="truncate max-w-[116px]">
              {robotState.transport === "disconnected"
                ? (<><span className="max-sm:hidden">Робот</span><span className="sm:hidden">Нет</span></>)
                : robotState.transport === "connecting"
                  ? "Поиск…"
                  : robotState.transport === "uploading"
                    ? `Загрузка ${robotState.uploadProgress ?? 0}%`
                    : robotState.transport === "starting-hub"
                      ? "Запуск…"
                      : robotState.transport === "fault"
                        ? "Нет связи"
                        : robotState.hubName || (robotState.transport === "ready" ? "Готов" : "Подключён")}
            </span>
          </button>

          {robotMenuOpen && (
            <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-72 rounded-md border border-[#1d1b1a73] bg-white p-3.5 shadow-xl flex flex-col gap-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[#726b62]">
                    {robotState.hubName || (project?.hub === "ev3" ? "LEGO EV3" : "SPIKE Prime")}
                  </p>
                  <p role="status" className="mt-0.5 text-xs font-medium text-[#252221]">{robotState.message}</p>
                </div>
              </div>
              {project?.hub !== "ev3" && (
                <HubPortsPanel state={robotState} portList={motorPorts} />
              )}
              {project?.hub === "ev3" ? (
                <p className="rounded-lg bg-[#faf5ec] px-2.5 py-2 text-xs font-semibold text-[#5f5951]">
                  Bluetooth в браузере доступен только для SPIKE Prime. Для EV3 используйте «Код Pybricks».
                </p>
              ) : bleSupport.checked && !bleSupport.available ? (
                <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-900">
                  {bleSupport.reason} Доступны «Пробный режим» и «Код Pybricks».
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {(robotState.transport === "disconnected" || robotState.transport === "fault") && (
                    <button
                      type="button"
                      disabled={checking}
                      onClick={() => { setRobotMenuOpen(false); void sessionRef.current?.connect() }}
                      className="min-h-[40px] rounded-md bg-[#555049] px-3 py-2 text-sm font-bold text-white hover:bg-[#34302f] disabled:opacity-40"
                    >
                      {robotState.transport === "fault" ? "Переподключить робота" : "Подключить робота"}
                    </button>
                  )}
                  {robotState.transport !== "disconnected" && (
                    <button
                      type="button"
                      disabled={checking && robotState.transport !== "connecting"}
                      onClick={() => { setRobotMenuOpen(false); void sessionRef.current?.disconnect() }}
                      className="min-h-[38px] rounded-md border border-[#1d1b1a73] px-3 py-2 text-xs font-bold text-[#3a3634] hover:bg-[#faf5ec] disabled:opacity-40"
                    >
                      {robotState.transport === "connecting" ? "Отменить подключение" : "Отключить"}
                    </button>
                  )}
                  {robotState.needsManualHubProgram && (
                    <a
                      className="mt-1 text-center text-xs font-semibold text-[#393533] underline"
                      href="/hub_program.py"
                      download="tlc_pybricks_controller.py"
                    >
                      На хабе не найден Pybricks: скачать программу вручную
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {checking || starting || robotState.transport === "uploading" || robotState.transport === "starting-hub" || robotState.program === "custom-running" ? (
          <Button
            type="button"
            onClick={() => void stopProgram()}
            className="rounded-full min-h-[40px] px-5 font-extrabold bg-[var(--bs-danger)] text-white shadow-[0_4px_0_#8f2a1f] hover:brightness-105"
          >
            ■ Стоп
          </Button>
        ) : (
          <Button
            ref={runButtonRef}
            type="button"
            disabled={!project || robotState.transport === "connecting"}
            onClick={handleRunClick}
            className="rounded-full min-h-[40px] px-5 font-extrabold bg-[var(--bs-action)] text-[var(--bs-on-action)] shadow-[0_4px_0_var(--bs-lip-action)] hover:brightness-105"
          >
            ▶ Запуск
          </Button>
        )}
      </header>

      {/* Main Editor Body */}
      {editorMode === "pybricks" && project ? (
        <PybricksWorkspace
          hub={project.hub}
          sheetName={currentSheet.name}
          code={sheetPythonCode}
          dirty={sheetPythonDirty}
          errorMessage={pybricksError || (robotState.transport === "fault" ? robotState.message : "")}
          statusMessage={
            robotState.transport === "uploading" ||
            robotState.transport === "starting-hub" ||
            robotState.program === "custom-running"
              ? robotState.message
              : undefined
          }
          isRunning={robotState.program === "custom-running"}
          isBusy={starting || robotState.transport === "uploading" || robotState.transport === "starting-hub"}
          onChangeCode={handlePybricksCodeChange}
          onSyncFromBlocks={() => void handleSyncPybricksFromBlocks()}
          onDownload={() => handleDownloadPy(sheetPythonCode)}
          onRun={handleRunClick}
          onStop={() => void stopProgram()}
        />
      ) : (
      <div className="flex flex-1 min-h-0 relative">
        <aside
          ref={paletteRef}
          aria-label="Меню блоков"
          inert={checking || undefined}
          className={`relative z-50 flex shrink-0 ${checking ? "opacity-50 max-md:invisible" : ""}`}
        >
          <div className="flex w-12 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-[#1d1b1a73] bg-[#faf5ec] py-2">
            <div className="flex flex-col items-center gap-1" role="group" aria-label="Категории блоков">
              {PALETTE_FILTERS.map(({ id, label, icon: Icon, color }) => (
                <button
                  key={id}
                  type="button"
                  title={label}
                  aria-label={label}
                  aria-controls="editor-block-palette"
                  aria-pressed={blockCategory === id}
                  style={{ color }}
                  onClick={() => {
                    setBlockCategory(id)
                    setPaletteExpanded(true)
                  }}
                  className="grid size-10 shrink-0 place-items-center rounded-lg hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-current aria-pressed:bg-white aria-pressed:ring-1 aria-pressed:ring-inset aria-pressed:ring-current"
                >
                  <Icon size={20} aria-hidden="true" />
                </button>
              ))}
            </div>
            <button
              type="button"
              title={paletteOpen ? "Свернуть каталог блоков" : "Развернуть каталог блоков"}
              aria-label={paletteOpen ? "Свернуть каталог блоков" : "Развернуть каталог блоков"}
              aria-controls="editor-block-palette"
              aria-expanded={paletteOpen}
              onClick={() => setPaletteExpanded(!paletteOpen)}
              className="mt-1 grid size-10 shrink-0 place-items-center rounded-lg border border-[#1d1b1a73] text-[#5f5951] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-current"
            >
              {paletteOpen ? <PanelLeftClose size={18} aria-hidden="true" /> : <PanelLeftOpen size={18} aria-hidden="true" />}
            </button>
          </div>

          <div
            id="editor-block-palette"
            hidden={!paletteOpen}
            className={`absolute inset-y-0 left-full z-30 w-44 touch-pan-y overflow-y-auto overscroll-contain border-r border-[#1d1b1a73] px-2.5 py-2 bg-white shadow-md`}
          >
            {BLOCK_CATEGORIES.filter(({ id }) => blockCategory === "all" || id === blockCategory).map(({ id, label, color, blocks: entries }) => (
              <section key={id} aria-label={label} className="mb-3">
                <h2 className="mb-1 px-1 text-xs font-bold" style={{ color }}>{label}</h2>
                <div className="space-y-1">
                  {entries.map((entry) => {
                    if (entry.type === "motor-buttons") {
                      return (
                        <button
                          key="motor-buttons"
                          type="button"
                          disabled={!project}
                          aria-label={entry.label}
                          title={entry.label}
                          onPointerDown={(event) => {
                            if (!project || event.button !== 0) return
                            event.preventDefault()
                            setGesture({
                              kind: "palette",
                              type: "motor-buttons",
                              clientX: event.clientX,
                              clientY: event.clientY,
                            })
                          }}
                          className="grid h-12 w-full touch-pan-y cursor-grab place-items-center rounded-md border-2 border-[#1d1b1a73] bg-[#faf5ec] p-1 hover:border-[#555049] hover:bg-[#f6eee1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-stone-700 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <MotorButtonsPalettePreview />
                        </button>
                      )
                    }
                    if (entry.type === "distance-gauge") {
                      return (
                        <button
                          key="distance-gauge"
                          type="button"
                          disabled={!project}
                          aria-label={entry.label}
                          title={entry.label}
                          onPointerDown={(event) => {
                            if (!project || event.button !== 0) return
                            dragControlFromPalette(event, "distance-gauge")
                          }}
                          className="grid h-12 w-full touch-pan-y cursor-grab place-items-center rounded-md border-2 border-[#1d1b1a73] bg-[#f9f4ec]/60 p-1 hover:border-[#d12f20] hover:bg-[#f9f4ec] focus-visible:outline focus-visible:outline-2 focus-visible:outline-stone-700 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <DistanceGaugePalettePreview />
                        </button>
                      )
                    }
                    if (isDirectionControl(entry.type)) {
                      if (entry.type === "drive-linear") return null
                      const directionEntries = entries.filter((item) => isDirectionControl(item.type))
                      return (
                        <div key="direction-tiles" className="grid grid-cols-2 gap-1.5 pt-0.5">
                          {directionEntries.map((dirEntry) => {
                            const dirKind = dirEntry.type as DirectionControlKind
                            return (
                              <button
                                key={dirKind}
                                type="button"
                                disabled={!project}
                                aria-label={dirEntry.label}
                                title={dirEntry.label}
                                onPointerDown={(event) => {
                                  if (!project || event.button !== 0) return
                                  dragControlFromPalette(event, dirKind)
                                }}
                                className="grid h-14 w-full touch-pan-y cursor-grab place-items-center rounded-md border-2 border-[#b9b4ad] bg-white p-1 hover:border-[#c35117] hover:bg-[#fff8ef] focus-visible:outline focus-visible:outline-2 focus-visible:outline-stone-700 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <DirectionPalettePreview kind={dirKind} />
                              </button>
                            )
                          })}
                        </div>
                      )
                    }
                    const { type, label, icon: Icon } = entry
                    const buttonEvent = "event" in entry ? entry.event : undefined
                    const areaAlreadyExists = type === "area" && controlLayout.areas.some((area) => area.sheetId === currentSheet.id)
                    return (
                      <button
                        key={`${type}:${buttonEvent || ""}`}
                        type="button"
                        disabled={!project || areaAlreadyExists}
                        title={areaAlreadyExists ? "На этом листе уже есть область управления" : undefined}
                        onPointerDown={(event) => {
                          if (!project || event.button !== 0) return
                          if (type === "area" || isPlaceableControl(type)) {
                            dragControlFromPalette(event, type)
                            return
                          }
                          event.preventDefault()
                          setGesture({
                            kind: "palette",
                            type,
                            initialOverrides: buttonEvent ? { event: buttonEvent } : undefined,
                            clientX: event.clientX,
                            clientY: event.clientY,
                          })
                        }}
                        className="flex min-h-10 w-full touch-pan-y cursor-grab items-center gap-2 rounded-lg bg-[#faf5ec] px-2 py-1.5 text-left text-xs font-bold leading-tight hover:bg-[#ecdcc1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-current active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span data-catalog-icon={id} className="grid size-6 shrink-0 place-items-center rounded-md text-white" style={{ backgroundColor: color }}>
                          {type === "sensor" ? (
                            <span className="grid grid-cols-2 gap-[1px] place-items-center" aria-hidden="true">
                              <Waves size={9} />
                              <Palette size={9} />
                              <CircleDot size={9} />
                              <Compass size={9} />
                            </span>
                          ) : (
                            <Icon size={14} aria-hidden="true" />
                          )}
                        </span>
                        {label}
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </aside>

        {/* Board Panel */}
        <main className="flex flex-col flex-1 min-w-0 min-h-0">
          {/* Board Toolbar */}
          <div inert={checking || undefined} className="h-[54px] shrink-0 flex items-center gap-2 px-4 bg-white border-b border-[#1d1b1a73]">
            <button
              type="button"
              disabled={!project}
              onClick={openChassisDialog}
              aria-label="Настройки шасси"
              title="Настройки шасси"
              className={`min-h-[40px] h-[40px] px-3 rounded-[10px] border text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40 ${
                !projectChassis.configured && blocks.some(b => b.type === "chassis")
                  ? "border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100"
                  : "border-[#1d1b1a73] bg-white hover:bg-[#f9f4ec] text-[#3a3634]"
              }`}
            >
              <Settings2 size={15} aria-hidden="true" />
              <span>Шасси</span>
              {!projectChassis.configured && blocks.some(b => b.type === "chassis") && (
                <AlertTriangle size={14} className="text-amber-600" aria-hidden="true" />
              )}
            </button>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => handleZoom(zoom - 0.25)}
              aria-label="Уменьшить масштаб"
              className="grid place-items-center h-[34px] min-w-[34px] px-2 rounded-[9px] border border-[#1d1b1a73] bg-white hover:bg-[#f9f4ec] text-[#3a3634] font-bold"
            >
              −
            </button>
            <span className="min-w-[46px] text-center text-xs font-bold text-[#756e64]">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => handleZoom(zoom + 0.25)}
              aria-label="Увеличить масштаб"
              className="grid place-items-center h-[34px] min-w-[34px] px-2 rounded-[9px] border border-[#1d1b1a73] bg-white hover:bg-[#f9f4ec] text-[#3a3634] font-bold"
            >
              +
            </button>
          </div>

          {(checking || robotState.transport === "uploading" || robotState.transport === "starting-hub" || robotState.transport === "fault" || startError) && (
            <div
              role={robotState.transport === "fault" ? "alert" : "status"}
              className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-1.5 text-xs font-semibold ${
                robotState.transport === "fault"
                  ? "border-red-200 bg-red-50 text-red-900"
                  : "border-[#1d1b1a73] bg-[#faf6ee] text-[#3a3634]"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate">{startError || robotState.message}</span>
                {robotState.transport === "uploading" && (
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#f0e2cb]">
                    <div
                      className="h-full bg-[#555049] transition-all duration-150"
                      style={{ width: `${Math.max(5, robotState.uploadProgress ?? 0)}%` }}
                    />
                  </div>
                )}
              </div>
              {robotState.transport === "fault" && project?.hub === "spike" && (
                <div className="flex items-center gap-2 shrink-0">
                  {robotState.needsManualHubProgram && (
                    <a
                      href="/hub_program.py"
                      download="tlc_pybricks_controller.py"
                      className="underline text-[#393533]"
                    >
                      Скачать вручную
                    </a>
                  )}
                  {bleSupport.available && (
                    <button
                      type="button"
                      disabled={starting}
                      onClick={() => checking ? void connectAndStart() : void sessionRef.current?.connect()}
                      className="rounded-full bg-[var(--bs-danger)] px-3 py-1 text-xs font-extrabold text-white hover:brightness-105 disabled:opacity-50"
                    >
                      Переподключить
                    </button>
                  )}
                  {checking && (
                    <button
                      type="button"
                      onClick={() => void stopProgram()}
                      className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs font-bold text-red-900 hover:bg-red-100"
                    >
                      В редактор
                    </button>
                  )}
                </div>
              )}
              {checking && robotState.program === "trial-running" && robotState.transport !== "fault" && project?.hub === "spike" && bleSupport.available && (
                <button
                  type="button"
                  disabled={starting}
                  onClick={() => void connectAndStart()}
                  className="shrink-0 rounded-lg bg-[#555049] px-2.5 py-1 text-xs font-bold text-white hover:bg-[#34302f] disabled:opacity-50"
                >
                  Подключить робота
                </button>
              )}
            </div>
          )}
          {/* Infinite Canvas Board */}
          <div
            ref={boardRef}
            aria-label="Доска для блоков"
            style={{
              containerType: "inline-size",
            }}
            onPointerDown={(e) => {
              if (
                checking || e.button !== 0 ||
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
                setTrashHot(pointerInRect(trashRef.current, e.clientX, e.clientY))
              }
            }}
            onPointerUp={(e) => {
              if (!gesture) return
              if (gesture.kind === "block") {
                const { id, originX, originY, startX, startY, moved } = gesture
                setGesture(null)
                setSnapTargetSlot(null)
                setTrashHot(false)
                if (moved) {
                  if (pointerInRect(trashRef.current, e.clientX, e.clientY)) {
                    setSelectedId(null)
                    saveBlocks(removeBlock(blocks, id))
                  } else {
                    finishBlockMove(
                      id,
                      originX + (e.clientX - startX) / zoom,
                      originY + (e.clientY - startY) / zoom
                    )
                  }
                }
              } else if (gesture.kind === "pan") {
                setGesture(null)
              }
            }}
            data-pocket-canvas="" className={`relative flex-1 min-h-0 overflow-hidden touch-none bg-[#fbf7f0] ${
              gesture?.kind === "pan" ? "cursor-grabbing" : "cursor-grab"
            }`}
          >
            <div
              style={{
                "--row-width": `calc((100cqw - 24px) / ${zoom})`,
                  transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
                transformOrigin: "0 0",
              } as React.CSSProperties}
              className="absolute top-0 left-0 w-0 h-0"
            >
              {controlLayout.areas.filter(a=>a.sheetId===currentSheet.id).map(area=>{
                const displayArea = projectChassis.configured ? {...area, drive: projectChassis.settings} : area
                return <ControlAreaView key={area.id} area={displayArea} controls={controlLayout.controls.filter(c=>c.areaId===area.id)} attachedPanels={blocks.filter(b=>b.type==="motor-buttons"&&b.controlAreaId===area.id)} editing={!checking} inputActive={(robotState.program === "trial-running" || robotState.program === "live-running") && robotState.transport !== "fault"} zoom={zoom} errors={inputErrors} isLiveRobot={robotState.transport === "ready"} sensorPorts={robotState.sensorPorts} sensorPortsKnown={robotState.sensorPortsKnown} sensorDistances={robotState.sensorDistances} onSimulateDistance={(port, cm) => sessionRef.current?.setSensorDistance(port, cm)} onAreaChange={changed=>{
                const dx=changed.x-area.x,dy=changed.y-area.y
                const nextBlocks=dx||dy?blocks.map(b=>b.type==="motor-buttons"&&b.controlAreaId===area.id?{...b,x:b.x+dx,y:b.y+dy}:b):blocks
                const displayedDrive = projectChassis.configured ? projectChassis.settings : area.drive
                const driveEdited = Boolean(changed.drive) && JSON.stringify(changed.drive) !== JSON.stringify(displayedDrive)
                const { drive: _droppedDrive, ...changedWithoutDrive } = changed
                const nextArea = driveEdited ? changedWithoutDrive : (area.drive ? { ...changedWithoutDrive, drive: area.drive } : changedWithoutDrive)
                const nextLayout={...controlLayout,areas:controlLayout.areas.map(a=>{
                  if (a.id===changed.id) return nextArea
                  if (driveEdited && a.drive !== undefined) { const { drive: _d, ...rest } = a; return rest }
                  return a
                })}
                const driveChanged = driveEdited ? changed.drive : undefined
                void persistSheets(snapshotSheets(nextBlocks), nextLayout, driveChanged)
              }} onControlChange={changed=>void saveLayout({...controlLayout,controls:controlLayout.controls.map(c=>c.id===changed.id?changed:c)})} onDeleteControl={id=>void saveLayout({...controlLayout,controls:controlLayout.controls.filter(c=>c.id!==id)})} onDeleteArea={id=>{
                const nextBlocks=blocks.filter(b=>!(b.type==="motor-buttons"&&b.controlAreaId===id))
                const nextLayout={...controlLayout,areas:controlLayout.areas.filter(a=>a.id!==id),controls:controlLayout.controls.filter(c=>c.areaId!==id)}
                void persistSheets(snapshotSheets(nextBlocks),nextLayout)
              }} onInput={(controlId,input,event)=>dispatchControl({controlId,input},event)} onCancel={()=>void sessionRef.current?.stop("Нажатие отменено.")} />})}
              {/* Magnetic LEGO socket preview under or inside snapTarget */}
              {snapTargetSlot &&
                (() => {
                  const targetBlock = blocks.find(
                    (b) => b.id === snapTargetSlot.id
                  )
                  if (!targetBlock) return null
                  const isCondBranch =
                    snapTargetSlot.branch === "condition" &&
                    isContainerType(targetBlock.type)
                  const isBodyBranch =
                    snapTargetSlot.branch === "body" &&
                    isContainerType(targetBlock.type)
                  const isElseBranch =
                    snapTargetSlot.branch === "else" &&
                    targetBlock.type === "if"
                  if (isCondBranch) {
                    return (
                      <div
                        aria-hidden="true"
                        style={{
                          left: `${targetBlock.x + conditionSlotX(targetBlock.type)}px`,
                          top: `${targetBlock.y + 11}px`,
                        }}
                        className="absolute z-30 w-[132px] h-[36px] rounded-full border-2 border-dashed border-[#fbbf24] bg-[#fef3c7]/65 shadow-[0_3px_0_rgba(29,27,26,0.16)] pointer-events-none animate-lego-magnet"
                      />
                    )
                  }
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
                      className="absolute z-20 w-[320px] h-[58px] rounded-md border-2 border-dashed border-[#fbbf24] bg-[#fef3c7]/55 shadow-[0_3px_0_rgba(29,27,26,0.16)] pointer-events-none animate-lego-magnet"
                    >
                      <span className="absolute -top-[8px] left-[32px] w-[44px] h-[11px] rounded-t-[6px] bg-[#fbbf24]" />
                    </div>
                  )
                })()}

              <div>
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
                    const isCondBranch =
                      snapTargetSlot.branch === "condition" &&
                      isContainerType(targetBlock.type)
                    const isBodyBranch =
                      snapTargetSlot.branch === "body" &&
                      isContainerType(targetBlock.type)
                    const isElseBranch =
                      snapTargetSlot.branch === "else" &&
                      targetBlock.type === "if"
                    const snapX = isCondBranch
                      ? targetBlock.x + conditionSlotX(targetBlock.type)
                      : isBodyBranch || isElseBranch
                        ? targetBlock.x + IF_INDENT
                        : targetBlock.x
                    const snapY = isCondBranch
                      ? targetBlock.y + 11
                      : isBodyBranch
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

                const panelArea = block.type === "motor-buttons" && block.controlAreaId
                  ? controlLayout.areas.find((area) => area.id === block.controlAreaId && area.sheetId === currentSheet.id)
                  : undefined
                const panelWidth = block.width || 180
                const panelHeight = block.height || 132
                const rawDisplayX = isMoving
                  ? Math.round(block.x + gesture.dx + magneticPullX)
                  : block.x
                const rawDisplayY = isMoving
                  ? Math.round(block.y + gesture.dy + magneticPullY)
                  : block.y
                const displayX = panelArea && isMoving
                  ? Math.max(panelArea.x, Math.min(panelArea.x + panelArea.width - panelWidth, rawDisplayX))
                  : rawDisplayX
                const displayY = panelArea && isMoving
                  ? Math.max(panelArea.y + 44, Math.min(panelArea.y + panelArea.height - panelHeight, rawDisplayY))
                  : rawDisplayY
                const paired = isPairedBlock(block)
                if (block.type === "sensor" && block.branch === "condition" && !isMoving) {
                  return null
                }
                const isIfBlock = block.type === "if"
                const isLoopBlock = block.type === "loop"
                const isContainerBlock = isIfBlock || isLoopBlock
                const isSensorBlock = block.type === "sensor"
                const isChassisBlock = block.type === "chassis"
                const motorBlock = block.type === "drive" || paired
                const isButtonBlock = block.type === "button"
                const isStopBlock = block.type === "stop"
                const isMotorButtons = block.type === "motor-buttons"
                const blockError = controllerErrorsByBlockId.get(block.id)
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
                const bodySpineHeight = isContainerBlock
                  ? ifInnerHeight(blocks, block.id, "body")
                  : 0
                const elseSpineHeight = isIfBlock
                  ? ifInnerHeight(blocks, block.id, "else")
                  : 0

                const radiusClass = isContainerBlock
                  ? ""
                  : isButtonBlock
                    ? `rounded-t-md ${
                        hasChild ? "rounded-b-[5px]" : "rounded-b-md"
                      }`
                    : motorBlock || isStopBlock || isChassisBlock || isSensorBlock
                      ? `${isConnected ? "rounded-t-[5px]" : "rounded-t-md"} ${
                          hasChild ? "rounded-b-[5px]" : "rounded-b-md"
                        }`
                      : `rounded-t-md ${
                          hasChild ? "rounded-b-[5px]" : "rounded-b-md"
                        }`

                return (
                  <div
                    key={block.id}
                    data-canvas-block="true"
                    data-block-id={block.id}
                    inert={checking && !isMotorButtons ? true : undefined}
                    tabIndex={checking && isMotorButtons ? -1 : 0}
                    role={motorBlock || isChassisBlock || isContainerBlock || isStopBlock || isSensorBlock || isMotorButtons ? "group" : "button"}
                    aria-label={
                      isLoopBlock
                        ? "Блок цикла Повторять. Перетащите за заголовок"
                        : isIfBlock
                        ? "Блок условия Если Иначе. Перетащите за заголовок"
                        : isButtonBlock
                          ? "Кнопка пульта. Перетащите за заголовок"
                        : isMotorButtons
                          ? checking ? "Панель цветных кнопок" : "Панель цветных кнопок. Перетащите за фон"
                          : isSensorBlock
                            ? "Блок датчика. Перетащите за заголовок"
                          : isStopBlock
                            ? "Стоп мотора. Перетащите за заголовок"
                            : isChassisBlock
                              ? "Блок движения шасси Ехать. Перетащите за заголовок"
                              : motorBlock
                                ? paired
                                  ? "Связанные моторы. Перетащите за заголовок"
                                  : "Блок движения мотора. Перетащите заголовок"
                                : "Когда программа запускается. Стрелки перемещают, Delete удаляет"
                    }
                    style={{
                      left: `${displayX}px`,
                      top: `${displayY}px`,
                      ...(isMotorButtons ? {width:panelResize?.id===block.id?panelResize.width:panelWidth,height:panelResize?.id===block.id?panelResize.height:panelHeight} : {}),
                    }}
                    onPointerDown={(e) => {
                      if (
                        e.button !== 0 ||
                        (e.target as HTMLElement).closest(
                          "button, select, input"
                        ) ||
                        (isMotorButtons && (checking || !(e.target as HTMLElement).closest("[data-panel-drag]")))
                      )
                        return
                      e.preventDefault()
                      e.stopPropagation()
                      e.currentTarget.setPointerCapture(e.pointerId)
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
                      if (checking && isMotorButtons) {
                        if (["Delete", "Backspace", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
                          e.preventDefault()
                        }
                        return
                      }
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
                    data-block-cat={isMotorButtons ? undefined : isContainerBlock ? "logic" : isSensorBlock ? "sensors" : isStopBlock || isChassisBlock || motorBlock ? "motion" : "events"}
                    className={`absolute touch-none select-none ${checking && isMotorButtons ? "cursor-default" : "cursor-grab"} ${
                      isMoving
                        ? "z-30 cursor-grabbing scale-[1.02] shadow-2xl"
                        : checking && isMotorButtons
                          ? "z-40 transition-[left,top,box-shadow] duration-200 ease-out"
                          : "z-10 transition-[left,top,box-shadow] duration-200 ease-out"
                    } has-[[aria-expanded="true"]]:z-40 ${radiusClass} ${
                      isContainerBlock
                        ? "pointer-events-none text-[#252221]"
                        : isMotorButtons
                          ? `${buttonDrag?.blockId === block.id ? "overflow-visible" : "overflow-hidden"} rounded-md border border-[#1d1b1a73] bg-[#faf5ec] text-[#252221]`
                        : isButtonBlock
                          ? "w-max min-h-[58px] bg-[#f8f2e7] text-[#252221] border-l-4 border-[#e85d2a]"
                          : isSensorBlock
                            ? "w-max min-h-[64px] bg-[#f8f2e7] text-[#252221] border-l-4 border-[#d12f20]"
                          : isStopBlock
                            ? "w-max min-h-[64px] bg-[#f8f2e7] text-[#252221] border-l-4 border-[#b1372c]"
                            : isChassisBlock
                              ? "w-max min-h-[64px] bg-[#f8f2e7] text-[#252221] border-l-4 border-[#a8211a]"
                              : motorBlock
                                ? paired
                                  ? "w-max min-h-[64px] bg-[#393533] text-white"
                                  : "w-max min-h-[64px] bg-[#625c54] text-white"
                                : "w-[320px] min-h-[58px] bg-[#f59e0b] text-white px-5 flex items-center"
                    } ${
                      isJustAdded ? "animate-lego-spawn" : ""
                    } ${
                      isJustSnapped ? "animate-lego-snap" : ""
                    } ${
                      !isContainerBlock && !isMotorButtons && blockError
                        ? "ring-2 ring-[#dc2626]"
                        : ""
                    } ${
                      !isContainerBlock && isSelected
                        ? "outline outline-2 outline-[#252221]"
                        : ""
                    } ${
                      !isContainerBlock && isSnapTarget
                        ? "ring-4 ring-[#fbbf24] shadow-[0_3px_0_rgba(29,27,26,0.16)]"
                        : ""
                    }`}
                  >
                    {/* Top LEGO connector stud for motor, chassis, if, and stop blocks */}
                    {(motorBlock || isChassisBlock || isContainerBlock || isStopBlock || isSensorBlock) && (
                      <span
                        aria-hidden="true"
                        className={`block-fill absolute -top-[8px] left-[32px] w-[44px] h-[11px] rounded-t-[6px] pointer-events-auto ${
                          isContainerBlock
                            ? "bg-[#f8f2e7]"
                            : isSensorBlock
                              ? "bg-[#d12f20]"
                            : isStopBlock
                              ? "bg-[#b1372c]"
                              : isChassisBlock
                                ? "bg-[#d12f20]"
                                : paired
                                  ? "bg-[#393533]"
                                  : "bg-[#625c54]"
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

                    {/* Block Content */}
                    {isMotorButtons ? (
                      <div data-button-panel="true" data-panel-drag={!checking ? "true" : undefined} className="relative flex h-full w-full flex-col">
                        {(() => {
                          const hiddenButtons = block.hiddenControlButtons || []
                          const colors = (["blue", ...(block.controlModules || [])] as MotorPanelButton[])
                            .filter(color => !hiddenButtons.includes(color))
                          const panelErrors = [...new Set(colors.map(color => inputErrors[`${block.id}:${color}`]).filter(Boolean))]
                          const paint: Record<MotorPanelButton, { face: string; shade: string }> = {
                            blue: { face: "#a8211a", shade: "#383530" },
                            red: { face: "#d9473d", shade: "#a92b26" },
                            green: { face: "#32a66a", shade: "#21804e" },
                            yellow: { face: "#edc13d", shade: "#7e766b" },
                          }
                          const fourButtonPositions: Record<string, string> = {
                            red: "col-start-2 row-start-1",
                            blue: "col-start-1 row-start-2",
                            green: "col-start-3 row-start-2",
                            yellow: "col-start-2 row-start-3",
                          }
                          const nextColor = (["blue", "red", "green", "yellow"] as const).find(
                            (color) => !colors.includes(color)
                          )
                          const panelWidth = panelResize?.id === block.id ? panelResize.width : block.width || 180
                          const panelHeight = panelResize?.id === block.id ? panelResize.height : block.height || 132
                          const isCross = colors.length === 4
                          const itemCount = colors.length + (!checking && nextColor ? 1 : 0)
                          const buttonSize = Math.max(20, Math.min(
                            64,
                            isCross
                              ? Math.floor(Math.min((panelWidth - 24) / 3, (panelHeight - 20) / 3))
                              : Math.floor(Math.min(
                                  (panelWidth - 16 - 8 * Math.max(0, itemCount - 1)) / Math.max(1, itemCount),
                                  panelHeight - 16
                                ))
                          ))
                          const startButtonDrag = (e: React.PointerEvent<HTMLButtonElement>, color: MotorPanelButton) => {
                            if (e.button !== 0) return
                            e.preventDefault()
                            e.stopPropagation()
                            if (checking) {
                              if (!['trial-running','live-running'].includes(robotState.program)) return
                              const key = `${block.id}:${color}`
                              if (inputErrors[key]) return
                              try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* Ignore synthetic or unsupported pointer capture */ }
                              setPressedPanelButtons(previous => previous.includes(key) ? previous : [...previous,key])
                              dispatchControl({controlId:block.id,input:color},'pressed')
                              return
                            }
                            e.currentTarget.setPointerCapture(e.pointerId)
                            setSelectedId(block.id)
                            setButtonDrag({blockId:block.id,color,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,dx:0,dy:0})
                          }
                          const moveButtonDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
                            setButtonDrag(prev => prev?.blockId === block.id && prev.pointerId === e.pointerId
                              ? {...prev,dx:e.clientX-prev.startX,dy:e.clientY-prev.startY}
                              : prev)
                          }
                          const finishButtonDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
                            const drag = buttonDrag
                            if (!drag || drag.blockId !== block.id || drag.pointerId !== e.pointerId) return
                            const panelRect = e.currentTarget.closest("[data-button-panel]")?.getBoundingClientRect()
                            const dragged = Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY) > 5
                            const outside = !panelRect || e.clientX < panelRect.left || e.clientX > panelRect.right || e.clientY < panelRect.top || e.clientY > panelRect.bottom
                            setButtonDrag(null)
                            if (!dragged || !outside || !project) return
                            saveBlocks(blocks.map(item => {
                              if (item.id !== block.id) return item
                              if (drag.color === "blue") return {...item,hiddenControlButtons:[...new Set([...(item.hiddenControlButtons||[]),drag.color])]}
                              return {...item,controlModules:(item.controlModules||[]).filter(color=>color!==drag.color)}
                            }))
                          }
                          return (
                            <>
                        {panelErrors.length > 0 && (
                          <button
                            type="button"
                            title={panelErrors[0]}
                            aria-label={`Показать причину ошибки: ${panelErrors[0]}`}
                            aria-haspopup="dialog"
                            onPointerDown={e => e.stopPropagation()}
                            onClick={e => {
                              e.stopPropagation()
                              setPanelErrorModal(panelErrors.join("\n"))
                            }}
                            className="pointer-events-auto absolute left-1 top-1 z-20 grid size-5 place-items-center rounded-full bg-[#dc2626] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700"
                          >
                            <AlertTriangle size={12} strokeWidth={2.6} aria-hidden="true" />
                          </button>
                        )}
                            <div
                              className={isCross
                                ? "grid min-h-0 flex-1 content-center justify-center gap-0.5 p-1"
                                : "flex min-h-0 flex-1 items-center justify-center gap-2 p-2"}
                              style={isCross ? {gridTemplateColumns:`repeat(3, ${buttonSize}px)`,gridTemplateRows:`repeat(3, ${buttonSize}px)`} : undefined}
                            >
                              {colors.map((color) => (
                                <button
                                  type="button"
                                  key={color}
                                  aria-label={`${({blue:"Синяя",red:"Красная",green:"Зелёная",yellow:"Жёлтая"} as Record<MotorPanelButton,string>)[color]} кнопка${checking?"":". Перетащите за пределы панели, чтобы удалить"}`}
                                  aria-pressed={pressedPanelButtons.includes(`${block.id}:${color}`)}
                                  title={checking?"Нажмите для управления":"Перетащите за пределы панели, чтобы удалить"}
                                  className={`block touch-none appearance-none p-0 rounded-full border border-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700 ${checking?"cursor-pointer":"cursor-grab"} ${isCross ? fourButtonPositions[color] : ""} ${buttonDrag?.blockId === block.id && buttonDrag.color === color ? "z-30 cursor-grabbing opacity-80" : ""}`}
                                  style={{
                                    width: buttonSize,
                                    height: buttonSize,
                                    background: paint[color].face,
                                    boxShadow: `inset 0 -${Math.max(3,Math.round(buttonSize*0.12))}px ${paint[color].shade},0 2px 3px #928b80`,
                                    transform: buttonDrag?.blockId === block.id && buttonDrag.color === color
                                      ? `translate(${buttonDrag.dx/zoom}px,${buttonDrag.dy/zoom}px) scale(1.08)`
                                      : pressedPanelButtons.includes(`${block.id}:${color}`) ? "translateY(3px) scale(0.96)"
                                      : undefined,
                                  }}
                                  onPointerDown={e=>startButtonDrag(e,color)}
                                  onPointerMove={moveButtonDrag}
                                  onPointerUp={e=>{
                                    if (checking) {
                                      e.stopPropagation()
                                      const key=`${block.id}:${color}`
                                      setPressedPanelButtons(previous=>previous.filter(item=>item!==key))
                                      dispatchControl({controlId:block.id,input:color},'released')
                                    } else finishButtonDrag(e)
                                  }}
                                  onPointerCancel={e=>{
                                    const key=`${block.id}:${color}`
                                    if (checking) {setPressedPanelButtons(previous=>previous.filter(item=>item!==key));dispatchControl({controlId:block.id,input:color},'released')}
                                    else setButtonDrag(prev=>prev?.blockId===block.id&&prev.pointerId===e.pointerId?null:prev)
                                  }}
                                  onLostPointerCapture={() => {
                                    if (!checking) return
                                    const key = `${block.id}:${color}`
                                    setPressedPanelButtons(previous => previous.filter(item => item !== key))
                                    dispatchControl({controlId:block.id,input:color}, 'released')
                                  }}
                                  onBlur={() => {
                                    if (!checking) return
                                    const key = `${block.id}:${color}`
                                    setPressedPanelButtons(previous => previous.filter(item => item !== key))
                                    dispatchControl({controlId:block.id,input:color}, 'released')
                                  }}
                                  onKeyDown={e=>{
                                    if (!checking || (e.key!==" "&&e.key!=="Enter") || e.repeat) return
                                    e.preventDefault();const key=`${block.id}:${color}`
                                    if (inputErrors[key]) return
                                    setPressedPanelButtons(previous=>previous.includes(key)?previous:[...previous,key])
                                    dispatchControl({controlId:block.id,input:color},'pressed')
                                  }}
                                  onKeyUp={e=>{
                                    if (!checking || (e.key!==" "&&e.key!=="Enter")) return
                                    e.preventDefault();const key=`${block.id}:${color}`
                                    setPressedPanelButtons(previous=>previous.filter(item=>item!==key))
                                    dispatchControl({controlId:block.id,input:color},'released')
                                  }}
                                />
                              ))}
                              {!checking && nextColor && block.controlAreaId && (
                                <button
                                  type="button"
                                  aria-label="Добавить кнопку в панель"
                                  data-module-picker="true"
                                  onClick={() => {
                                    if (!project) return
                                    saveBlocks(blocks.map(item => {
                                      if (item.id !== block.id) return item
                                      if (nextColor === "blue") return {...item,hiddenControlButtons:(item.hiddenControlButtons||[]).filter(color=>color!=="blue")}
                                      return {...item,controlModules:[...(item.controlModules||[]),nextColor]}
                                    }))
                                  }}
                                  style={{width:buttonSize,height:buttonSize}}
                                  className="grid shrink-0 place-items-center rounded-full border border-[#1d1b1a73] bg-white text-lg font-bold text-[#3a3634]"
                                >+</button>
                              )}
                            </div>
                            </>
                          )
                        })()}
                        {!checking && <button type="button" aria-label="Изменить размер панели кнопок" onPointerDown={e=>resizeMotorPanel(e,block)} className="absolute bottom-0 right-0 z-20 grid h-6 w-6 cursor-nwse-resize place-items-center rounded-tl bg-white/80 text-sm text-[#3a3634]">◢</button>}
                      </div>
                    ) : isContainerBlock ? (
                      (() => {
                        const conditionBlock = blocks.find(
                          (b) => b.parentId === block.id && b.branch === "condition"
                        )
                        const isDraggingCondition =
                          conditionBlock &&
                          gesture?.kind === "block" &&
                          gesture.moved &&
                          gesture.moving.includes(conditionBlock.id)
                        const isConditionSnap =
                          snapTargetSlot?.id === block.id &&
                          snapTargetSlot.branch === "condition"
                        const condError = conditionBlock
                          ? controllerErrorsByBlockId.get(conditionBlock.id)
                          : undefined
                        const conditionSlot = (
                          <ConditionSlot
                            conditionBlock={conditionBlock}
                            dragging={Boolean(isDraggingCondition)}
                            snapping={isConditionSnap}
                            errorMessage={condError}
                            liveReady={robotState.transport === "ready"}
                            sensorDistances={robotState.sensorDistances}
                            sensorTelemetry={robotState.sensorTelemetry}
                            onChange={(changes) => {
                              if (!project || !conditionBlock) return
                              saveBlocks(
                                updateDrive(blocks, conditionBlock.id, changes, project.hub)
                              )
                            }}
                            onRemove={() => {
                              if (!conditionBlock) return
                              setSelectedId(null)
                              saveBlocks(removeBlock(blocks, conditionBlock.id))
                            }}
                            onStartDrag={(e) => {
                              if (!conditionBlock) return
                              e.preventDefault()
                              e.stopPropagation()
                              e.currentTarget.setPointerCapture(e.pointerId)
                              setSelectedId(conditionBlock.id)
                              setGesture({
                                kind: "block",
                                id: conditionBlock.id,
                                startX: e.clientX,
                                startY: e.clientY,
                                originX: conditionBlock.x,
                                originY: conditionBlock.y,
                                moving: chainIds(blocks, conditionBlock.id),
                                moved: false,
                                dx: 0,
                                dy: 0,
                              })
                            }}
                          />
                        )
                        if (isLoopBlock) {
                          return (
                            <LoopBlock
                              block={block}
                              bodyHeight={bodySpineHeight}
                              isConnected={isConnected}
                              hasChild={hasChild}
                              isSelected={isSelected}
                              isSnapTarget={isSnapTarget}
                              hasError={Boolean(blockError || condError)}
                              errorMessage={blockError || condError}
                              conditionSlot={conditionSlot}
                              onChange={(changes) => {
                                if (!project) return
                                saveBlocks(updateDrive(blocks, block.id, changes, project.hub))
                              }}
                            />
                          )
                        }
                        return (
                      <div className="flex flex-col items-start">
                        {/* 1. Top Header Bar of E-shaped If/Else block */}
                        <div
                          className={`block-fill pointer-events-auto relative flex flex-nowrap items-center min-h-[58px] h-[58px] w-max min-w-[220px] px-5 gap-3 bg-[#f8f2e7] border-l-4 border-[#837b70] ${
                            isConnected
                              ? "rounded-tl-[5px] rounded-tr-md"
                              : "rounded-t-md"
                          } rounded-br-md ${
                            isSelected
                              ? "outline outline-2 outline-[#252221]"
                              : isSnapTarget
                                ? "ring-4 ring-[#fbbf24]"
                                : blockError || condError
                                  ? "ring-2 ring-[#dc2626]"
                                  : ""
                          }`}
                        >
                          {/* Inner top LEGO stud pointing down into the first C-mouth ("Если") */}
                          <span
                            aria-hidden="true"
                            className="block-fill absolute -bottom-[7px] left-[60px] w-[44px] h-[10px] rounded-b-[6px] bg-[#f8f2e7] z-20"
                          />

                          <span className="inline-flex items-center gap-1.5 text-[16px] font-bold whitespace-nowrap tracking-tight">
                            <GitBranch size={16} aria-hidden="true" className="shrink-0 text-[#837b70]" />
                            <span>Если</span>
                          </span>
                          {conditionSlot}
                        </div>

                        {/* 2. First Left Vertical Spine ("Если" branch mouth) */}
                        <div
                          style={{ height: `${bodySpineHeight}px` }}
                          className="relative flex items-center"
                        >
                          <div className="block-fill pointer-events-auto w-[28px] h-full bg-[#f8f2e7]" />
                        </div>

                        {/* 3. Middle Bar ("Иначе") */}
                        <div className="block-fill pointer-events-auto relative flex items-center w-[220px] h-[48px] px-5 bg-[#f8f2e7] rounded-r-md">
                          {/* Top LEGO stud to lock with last block in "Если" branch */}
                          <span
                            aria-hidden="true"
                            className="block-fill absolute -top-[8px] left-[60px] w-[44px] h-[10px] rounded-t-[6px] bg-[#f8f2e7]"
                          />
                          {/* Bottom LEGO stud pointing down into the second C-mouth ("Иначе") */}
                          <span
                            aria-hidden="true"
                            className="block-fill absolute -bottom-[7px] left-[60px] w-[44px] h-[10px] rounded-b-[6px] bg-[#f8f2e7] z-20"
                          />
                          <span className="text-[16px] font-bold whitespace-nowrap tracking-tight">
                            Иначе
                          </span>
                        </div>

                        {/* 4. Second Left Vertical Spine ("Иначе" branch mouth) */}
                        <div
                          style={{ height: `${elseSpineHeight}px` }}
                          className="relative flex items-center"
                        >
                          <div className="block-fill pointer-events-auto w-[28px] h-full bg-[#f8f2e7]" />
                        </div>

                        {/* 5. Bottom C-Foot */}
                        <div
                          className={`block-fill pointer-events-auto relative w-[220px] h-[28px] bg-[#f8f2e7] rounded-r-md ${
                            hasChild ? "rounded-bl-[5px]" : "rounded-bl-md"
                          }`}
                        >
                          {/* Top LEGO stud on C-foot to lock with last block in "Иначе" branch */}
                          <span
                            aria-hidden="true"
                            className="block-fill absolute -top-[8px] left-[60px] w-[44px] h-[10px] rounded-t-[6px] bg-[#f8f2e7]"
                          />
                        </div>
                        {(blockError || condError) && (
                          <div className="pointer-events-auto">
                            <BlockErrorBar errorMessage={blockError || condError} />
                          </div>
                        )}
                      </div>
                        )
                      })()
                    ) : isSensorBlock ? (
                      <SensorBlock
                        block={block}
                        liveReady={robotState.transport === "ready"}
                        sensorDistances={robotState.sensorDistances}
                        sensorTelemetry={robotState.sensorTelemetry}
                        errorMessage={blockError}
                        onChange={(changes) => {
                          if (!project) return
                          saveBlocks(
                            updateDrive(blocks, block.id, changes, project.hub)
                          )
                        }}
                      />
                    ) : isButtonBlock ? (
                      <ControllerButtonBlock
                        block={block}
                        controls={controllerControls}
                        sheetControlIds={sheetControlIds}
                        ports={motorPorts}
                        isConnected={isConnected}
                        hasChild={hasChild}
                        errorMessage={blockError}
                        onChange={(changes) => {
                          if (!project) return
                          saveBlocks(
                            blocks.map((b) =>
                              b.id === block.id ? { ...b, ...changes } : b
                            )
                          )
                        }}
                      />
                    ) : isStopBlock ? (
                      <ControllerStopBlock
                        block={block}
                        ports={motorPorts}
                        isConnected={isConnected}
                        hasChild={hasChild}
                        errorMessage={blockError}
                        onChange={(changes) => {
                          if (!project) return
                          saveBlocks(
                            updateDrive(blocks, block.id, changes, project.hub)
                          )
                        }}
                      />
                    ) : isChassisBlock ? (
                      <ChassisBlock
                        block={block}
                        chassisConfigured={projectChassis.configured}
                        errorMessage={blockError}
                        onOpenChassis={openChassisDialog}
                        onChange={(changes) => {
                          if (!project) return
                          saveBlocks(
                            updateDrive(blocks, block.id, changes, project.hub)
                          )
                        }}
                      />
                    ) : !motorBlock ? (
                      <div className="text-[16px] font-bold tracking-tight whitespace-nowrap drop-shadow-xs">
                        ▶ &nbsp;Когда программа запускается
                      </div>
                    ) : (
                      <div className="flex flex-col">
                      <div className="group flex flex-nowrap items-center min-h-[64px] px-5 gap-3">
                        {/* Base inline action: Мотор [порт] [вперёд] */}
                        <div className="shrink-0 flex items-center gap-2.5">
                          <span className="inline-flex items-center gap-1.5 text-[16px] font-bold whitespace-nowrap tracking-tight">
                            <Cog size={17} aria-hidden="true" className="shrink-0 opacity-95" />
                            <span>Мотор</span>
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
                            className="h-[38px] rounded-md px-3.5 bg-white text-[#272423] font-bold text-[15px] shadow-xs cursor-pointer"
                          >
                            {motorPorts.map((port) => (
                              <option key={port} value={port}>
                                {port}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            aria-label={
                              paired
                                ? `Направление первого мотора: ${block.direction === "backward" ? "назад" : "вперёд"}`
                                : `Направление мотора: ${block.direction === "backward" ? "назад" : "вперёд"}`
                            }
                            aria-pressed={block.direction === "backward"}
                            title={block.direction === "backward" ? "Назад (↺)" : "Вперёд (↻)"}
                            onClick={() =>
                              project &&
                              saveBlocks(
                                updateDrive(
                                  blocks,
                                  block.id,
                                  {
                                    direction: (block.direction === "backward" ? "forward" : "backward") as MotorDirection,
                                  },
                                  project.hub
                                )
                              )
                            }
                            className="min-h-[36px] min-w-[36px] h-[38px] w-[38px] rounded-md bg-white text-[#272423] hover:bg-[#f6eee1] font-bold text-lg shadow-xs grid place-items-center cursor-pointer"
                          >
                            {block.direction === "backward" ? "↺" : "↻"}
                          </button>

                          {paired && (
                            <div className="shrink-0 flex flex-nowrap items-center gap-2.5">
                              <span className="text-[16px] font-bold opacity-95 whitespace-nowrap">
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
                                className="h-[38px] rounded-md px-3.5 bg-white text-[#272423] font-bold text-[15px] shadow-xs cursor-pointer"
                              >
                                {motorPorts.map((port) => (
                                  <option key={port} value={port}>
                                    {port}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                aria-label={`Направление второго мотора: ${block.direction2 === "backward" ? "назад" : "вперёд"}`}
                                aria-pressed={block.direction2 === "backward"}
                                title={block.direction2 === "backward" ? "Назад (↺)" : "Вперёд (↻)"}
                                onClick={() =>
                                  project &&
                                  saveBlocks(
                                    updateDrive(
                                      blocks,
                                      block.id,
                                      {
                                        direction2: (block.direction2 === "backward" ? "forward" : "backward") as MotorDirection,
                                      },
                                      project.hub
                                    )
                                  )
                                }
                                className="min-h-[36px] min-w-[36px] h-[38px] w-[38px] rounded-md bg-white text-[#272423] hover:bg-[#f6eee1] font-bold text-lg shadow-xs grid place-items-center cursor-pointer shrink-0"
                              >
                                {block.direction2 === "backward" ? "↺" : "↻"}
                              </button>

                            </div>
                          )}
                        </div>

                        {/* Модули: таблетки и меню «+» — из общего реестра */}
                        <ModuleBar
                          blockType={block.type === "pair" ? "pair" : "drive"}
                          block={block}
                          subject="мотора"
                          onChange={(changes) => {
                            if (!project) return
                            saveBlocks(updateDrive(blocks, block.id, changes, project.hub))
                          }}
                        />
                      </div>
                      <BlockErrorBar errorMessage={blockError} />
                      </div>
                    )}
                  </div>
                )
              })}
              </div>
            </div>

            <div
              ref={trashRef}
              aria-hidden="true"
              data-trash-zone={trashHot ? "hot" : gesture?.kind === "block" && gesture.moved ? "ready" : "idle"}
              className={`pointer-events-none absolute bottom-3 right-3 z-30 grid place-items-center rounded-full transition-all duration-150 ${
                trashHot
                  ? "size-16 bg-[var(--bs-danger)] text-white shadow-md"
                  : gesture?.kind === "block" && gesture.moved
                    ? "size-14 bg-[var(--bs-danger-bg)] text-[var(--bs-danger)]"
                    : "size-12 bg-white/80 text-[#8a7157]"
              }`}
            >
              <Trash2 size={trashHot ? 26 : 22} />
            </div>

            {loadError && !project && <div className="absolute inset-0 z-30 overflow-y-auto bg-white p-6"><h2 className="text-lg font-bold">{loadError}</h2><div className="flex flex-col gap-2 mt-4">{projects.map(p=><Link key={p.id} className="rounded-lg border p-3 text-[#393533]" href={`/editor?id=${encodeURIComponent(p.id)}`}>{p.name}</Link>)}{projects.length===0&&<Link href="/dashboard" className="text-[#393533] underline">К списку проектов</Link>}</div></div>}
          </div>

        </main>
      </div>
      )}

      {/* Drag Ghost from Palette */}
      {gesture?.kind === "palette" && (
        <div
          style={{
            left: `${gesture.clientX}px`,
            top: `${gesture.clientY}px`,
          }}
          data-block-cat={gesture.type === "if" || gesture.type === "loop" ? "logic" : gesture.type === "sensor" ? "sensors" : gesture.type === "button" || gesture.type === "start" ? "events" : gesture.type === "motor-buttons" ? undefined : "motion"}
          className={`fixed z-50 pointer-events-none opacity-85 -translate-x-1/2 -translate-y-1/2 scale-90 px-4 flex items-center text-white font-bold text-xs ${
            gesture.type === "start"
              ? "w-[240px] h-[52px] rounded-t-md rounded-b-md bg-[#f59e0b] shadow-[0_3px_0_rgba(29,27,26,0.16)]"
              : gesture.type === "if" || gesture.type === "loop"
                ? "w-[220px] h-[56px] rounded-md bg-[#f8f2e7] shadow-[0_3px_0_rgba(29,27,26,0.16)]"
              : gesture.type === "sensor"
                ? "w-[200px] h-[48px] rounded-full bg-[#d12f20] shadow-[0_3px_0_rgba(29,27,26,0.16)]"
                : gesture.type === "pair"
                  ? "w-[220px] h-[56px] rounded-md bg-[#393533] shadow-[0_3px_0_rgba(29,27,26,0.16)]"
                  : gesture.type === "button"
                    ? "w-[200px] h-[52px] rounded-t-md rounded-b-md bg-[#e85d2a] shadow-[0_3px_0_rgba(29,27,26,0.16)]"
                    : gesture.type === "motor-buttons"
                      ? "w-[160px] h-[52px] rounded-md border border-[#1d1b1a73] bg-[#faf5ec] text-[#252221] shadow-[0_3px_0_rgba(29,27,26,0.16)]"
                      : gesture.type === "stop"
                        ? "w-[220px] h-[56px] rounded-md bg-[#b1372c] shadow-[0_3px_0_rgba(29,27,26,0.16)]"
                        : gesture.type === "chassis"
                          ? "w-[220px] h-[56px] rounded-md bg-[#d12f20] shadow-[0_3px_0_rgba(29,27,26,0.16)]"
                          : "w-[220px] h-[56px] rounded-md bg-[#625c54] shadow-[0_3px_0_rgba(29,27,26,0.16)]"
          }`}
        >
          {gesture.type === "start"
            ? "▶  Когда программа запускается"
            : gesture.type === "loop"
              ? "↻  Повторять всегда"
            : gesture.type === "if"
              ? "Если … то (Что если)"
            : gesture.type === "sensor"
              ? "Датчик"
              : gesture.type === "pair"
                ? "⇉  Связанные моторы"
                : gesture.type === "button"
                  ? "Кнопка пульта"
                  : gesture.type === "motor-buttons"
                    ? "🔵 🔴 🟢 🟡"
                    : gesture.type === "stop"
                      ? "■  Стоп мотора"
                      : gesture.type === "chassis"
                        ? "↑  Ехать"
                        : "↗  Движение мотора"}
        </div>
      )}

      {runPromptOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Запуск программы"
          onClick={(e) => { if (e.target === e.currentTarget) setRunPromptOpen(false) }}
          className="fixed inset-0 z-50 bg-[#201e1d]/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full max-w-[420px] rounded-t-md sm:rounded-md bg-white p-5 pb-6 sm:pb-5 shadow-2xl border border-[#1d1b1a73]">
            <h2 className="text-lg font-bold text-[#252221]">
              {bleSupport.checked && !bleSupport.available
                ? "Bluetooth недоступен в этом браузере"
                : robotState.transport === "fault"
                  ? "Связь с роботом потеряна"
                  : "Робот ещё не подключён"}
            </h2>
            <p className="mt-1.5 text-sm text-[#5f5951]">
              {bleSupport.checked && !bleSupport.available
                ? pendingPybricksRun
                  ? `${bleSupport.reason} Вы можете скачать файл .py и запустить его в Pybricks Code.`
                  : `${bleSupport.reason} Можно проверить управление в пробном режиме или открыть код Pybricks.`
                : robotState.transport === "fault"
                  ? "Переподключите хаб по Bluetooth, и программа сразу запустится."
                  : pendingPybricksRun
                    ? "Подключите хаб по Bluetooth — код скомпилируется и сразу запустится на SPIKE Prime."
                    : "IDE сама подготовит хаб по Bluetooth и сразу запустит ваше управление."}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {(!bleSupport.checked || bleSupport.available) && (
                <Button
                  type="button"
                  onClick={() => void connectAndStart()}
                  className="min-h-[44px] w-full rounded-full bg-[var(--bs-action)] text-sm font-extrabold text-[var(--bs-on-action)] shadow-[0_4px_0_var(--bs-lip-action)] hover:brightness-105"
                >
                  {robotState.transport === "fault" ? "Переподключить и запустить" : "Подключить и запустить"}
                </Button>
              )}
              {!pendingPybricksRun && (
                <Button
                  type="button"
                  variant={bleSupport.checked && !bleSupport.available ? "default" : "outline"}
                  onClick={() => { setRunPromptOpen(false); void startProgram() }}
                  className={`min-h-[44px] w-full rounded-md text-sm font-bold ${
                    bleSupport.checked && !bleSupport.available
                      ? "bg-[#555049] hover:bg-[#34302f] text-white font-bold"
                      : "border-[#1d1b1a73] text-[#252221]"
                  }`}
                >
                  Пробный режим (без робота)
                </Button>
              )}
              {bleSupport.checked && !bleSupport.available && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setRunPromptOpen(false)
                    if (pendingPybricksRun) handleDownloadPy(sheetPythonCode)
                    else handleExportCode()
                  }}
                  className="min-h-[44px] w-full rounded-md border-[#1d1b1a73] text-sm font-bold text-[#393533]"
                >
                  {pendingPybricksRun ? "Скачать .py" : "Код Pybricks (.py)"}
                </Button>
              )}
              <button
                type="button"
                onClick={() => setRunPromptOpen(false)}
                className="mt-1 min-h-[40px] text-xs font-bold text-[#726b62] hover:text-[#252221]"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {chassisDialogOpen && project && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Настройки шасси"
          onClick={(e) => { if (e.target === e.currentTarget) setChassisDialogOpen(false) }}
          className="fixed inset-0 z-50 bg-[#201e1d]/50 grid place-items-center p-4"
        >
          <div className="w-full max-w-[380px] rounded-md border border-[#1d1b1a73] bg-white p-5 text-[#252221] shadow-2xl">
            <h2 className="text-lg font-bold mb-3">Настройки шасси</h2>
            {project.hub !== "ev3" && (
              <HubPortsPanel state={robotState} portList={motorPorts} className="mb-3" />
            )}
            <div className="flex flex-col gap-3">
              {([
                { label: "Левый мотор", portKey: "leftPort", revKey: "leftReversed" },
                { label: "Правый мотор", portKey: "rightPort", revKey: "rightReversed" },
              ] as const).map(({ label, portKey, revKey }) => (
                <div key={portKey} className="flex items-center justify-between gap-2 rounded-md border border-[#1d1b1a73] bg-[#fbf7f0] px-3 py-2">
                  <span className="text-sm font-bold">
                    {label}
                    {isMissingMotor(chassisPortsView, chassisDraft[portKey]) && (
                      <span role="alert" className="block text-[11px] font-semibold text-red-700">
                        На порту {chassisDraft[portKey]} нет мотора
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <select
                      aria-label={label}
                      value={chassisDraft[portKey]}
                      onChange={(e) => {
                        const port = e.target.value as DrivePort
                        const otherKey = portKey === "leftPort" ? "rightPort" : "leftPort"
                        setChassisDraft((prev) => ({
                          ...prev,
                          [portKey]: port,
                          [otherKey]: prev[otherKey] === port ? prev[portKey] : prev[otherKey],
                        }))
                      }}
                      className="min-h-[36px] h-[36px] rounded-lg border border-[#1d1b1a73] bg-white px-2.5 text-sm font-bold"
                    >
                      {motorPorts.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <button
                      type="button"
                      aria-label={`Инверсия: ${label.toLowerCase()}`}
                      aria-pressed={chassisDraft[revKey]}
                      title={chassisDraft[revKey] ? "Реверс (↺)" : "Прямо (↻)"}
                      onClick={() => setChassisDraft((prev) => ({ ...prev, [revKey]: !prev[revKey] }))}
                      className={`min-h-[36px] min-w-[36px] h-[36px] px-2.5 rounded-lg border text-sm font-bold flex items-center gap-1 ${
                        chassisDraft[revKey]
                          ? "border-[#555049] bg-[#f6eee1] text-[#393533]"
                          : "border-[#1d1b1a73] bg-white text-[#3a3634]"
                      }`}
                    >
                      <span>{chassisDraft[revKey] ? "↺" : "↻"}</span>
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between gap-2 rounded-md border border-[#1d1b1a73] bg-[#fbf7f0] px-3 py-2">
                <label htmlFor="chassis-speed-input" className="text-sm font-bold">Базовая скорость</label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="chassis-speed-input"
                    type="number"
                    min="1"
                    max="1000"
                    value={chassisDraft.speed ?? 360}
                    onChange={(e) => {
                      const val = Number(e.target.value)
                      if (!Number.isFinite(val)) return
                      setChassisDraft((prev) => ({ ...prev, speed: Math.max(1, Math.min(1000, Math.round(val))) }))
                    }}
                    className="w-[80px] min-h-[36px] h-[36px] rounded-lg border border-[#1d1b1a73] bg-white px-2 text-center text-sm font-bold"
                  />
                  <span className="text-xs font-bold text-[#726b62]">°/с</span>
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" className="min-h-[40px]" onClick={() => setChassisDialogOpen(false)}>Отмена</Button>
              <Button
                type="button"
                className="min-h-[40px] bg-[#555049] hover:bg-[#34302f] text-white font-bold"
                onClick={async () => {
                  const normalized: DriveSettings = {
                    ...chassisDraft,
                    speed: Math.max(1, Math.min(1000, Math.round(chassisDraft.speed ?? 360))),
                  }
                  const nextLayout = controlLayout.areas.some((a) => a.drive !== undefined)
                    ? {
                        ...controlLayout,
                        areas: controlLayout.areas.map((a) => {
                          if (a.drive === undefined) return a
                          const { drive: _d, ...rest } = a
                          return rest
                        }),
                      }
                    : undefined
                  const ok = await persistSheets(snapshotSheets(), nextLayout, normalized)
                  if (ok) setChassisDialogOpen(false)
                }}
              >
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      )}

      {panelErrorModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Кнопка недоступна"
          onClick={(e) => { if (e.target === e.currentTarget) setPanelErrorModal(null) }}
          className="fixed inset-0 z-50 bg-[#201e1d]/50 grid place-items-center p-4"
        >
          <div className="w-full max-w-sm rounded-md border border-[#b9b4ad] bg-white p-5 text-[#252221] shadow-xl">
            <h2 className="mb-3 text-lg font-bold">Кнопка недоступна</h2>
            <p className="whitespace-pre-line text-sm">{panelErrorModal}</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setPanelErrorModal(null)}
                className="min-h-[40px] rounded-md bg-[#353230] px-4 py-2 font-bold text-white"
              >
                Понятно
              </button>
            </div>
          </div>
        </div>
      )}

      {codeModal.open && <div role="dialog" aria-modal="true" aria-label={codeModal.title} className="fixed inset-0 z-50 bg-[#201e1d]/50 grid place-items-center p-4"><div className="w-full max-w-[600px] rounded-md bg-white p-6 shadow-2xl"><h2 className="text-xl font-bold mb-3">{codeModal.title}</h2><p className="text-sm mb-3">Загрузите файл в Pybricks Code и запустите на хабе.</p><textarea readOnly aria-label="Код программы Pybricks" value={codeModal.code} className="w-full h-[210px] p-3 border rounded-lg font-mono text-sm"/><div className="flex justify-end gap-3 mt-4"><Button type="button" variant="outline" onClick={() => handleDownloadPy()}>Скачать .py</Button><Button type="button" onClick={()=>setCodeModal(prev=>({...prev,open:false}))}>Закрыть</Button></div></div></div>}

    </div>
    {landscapeBlocked && (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-landscape-title"
        className="fixed inset-0 z-[13000] grid place-items-center bg-[#1e1c1b]/92 p-6 text-white-md"
      >
        <div className="w-full max-w-sm rounded-md border border-white/15 bg-[#262322] p-6 text-center shadow-2xl">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-md bg-[#555049]/25 text-[#d12f20]">
            <RotateCw size={28} aria-hidden="true" />
          </div>
          <h2 id="editor-landscape-title" className="text-xl font-bold tracking-tight">
            Поверните экран горизонтально
          </h2>
          <p className="mt-2 text-sm text-[#ebd8b8]">
            Редактор работает только в альбомном режиме
          </p>
          {orientationManualHint && (
            <p role="status" className="mt-3 rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-[#f6eee0]">
              Поверните устройство вручную
            </p>
          )}
          <div className="mt-5 flex flex-col gap-2.5">
            <button
              ref={rotateButtonRef}
              type="button"
              onClick={async () => {
                const outcome = await enterEditorLandscape({
                  target: document.documentElement,
                  doc: document,
                  orientation: window.screen?.orientation,
                })
                if (outcome === "manual") {
                  setOrientationManualHint(true)
                }
              }}
              className="min-h-[44px] w-full rounded-full bg-[var(--bs-action)] px-4 py-2.5 text-sm font-extrabold text-[var(--bs-on-action)] shadow-[0_4px_0_var(--bs-lip-action)] transition-[filter] hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bs-text)]"
            >
              Перейти в горизонт
            </button>
            <Link
              href="/dashboard"
              className="grid min-h-[44px] w-full place-items-center rounded-md border border-white/20 px-4 py-2.5 text-sm font-bold text-[#f5ebdb] transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d12f20]"
            >
              На главную
            </Link>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

const SPEED_PERCENT_STEP = 10 // 100% скорости = 1000°/с

export default function EditorPage() {
  return (
    <React.Suspense
      fallback={
        <div className="h-dvh grid place-items-center bg-[#faf6ee] text-sm font-bold text-[#726b62]">
          Загрузка редактора…
        </div>
      }
    >
      <EditorWorkspace />
    </React.Suspense>
  )
}
