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
  Gamepad2,
  MoreHorizontal,
  LayoutGrid,
  Monitor,
  Navigation,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RectangleHorizontal,
  RotateCw,
  Settings2,
  Square,
  Trash2,
  Waves,
  Workflow,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  HUBS,
  STORAGE_KEY,
  prepareEditorProjects,
  saveEditorProjects,
  type RobotProject,
} from "@/lib/projects"
import {
  IF_FOOT_HEIGHT,
  IF_INDENT,
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
  type MotorModule,
  type MotorPanelButton,
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
import {
  DEFAULT_DRIVE_SETTINGS,
  compileControllerProgram,
  resolveProjectChassis,
  type DrivePort,
  type DriveSettings,
} from "@/lib/controller-program"
import { ControlAreaView } from "@/components/editor/control-area"
import { DirectionPalettePreview, DistanceGaugePalettePreview, MotorButtonsPalettePreview } from "@/components/editor/direction-control"
import { useRobotSession } from "@/components/editor/robot-session"
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
  color: "#475569",
} as const

const DISPLAY_LABEL = "Дисплей"
const DISPLAY_SIZE = [224, 160] as const
const GAUGE_LABEL = "Дальномер"

const BLOCK_CATEGORIES = [
  {
    id: "events",
    label: "События",
    icon: Play,
    color: "#9a4b08",
    blocks: [
      { type: "start", label: "При запуске", icon: Play },
      { type: "button", event: "hold", label: "Кнопка пульта", icon: Gamepad2 },
    ],
  },
  {
    id: "motion",
    label: "Движение",
    icon: ArrowRight,
    color: "#087692",
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
    color: "#4f46e5",
    blocks: [
      { type: "sensor", label: "Датчик", icon: Waves },
    ],
  },
  {
    id: "logic",
    label: "Логика",
    icon: Workflow,
    color: "#6d35bf",
    blocks: [
      { type: "if", label: "Если / иначе", icon: Workflow },
    ],
  },
  {
    id: "controls",
    label: "Пульт",
    icon: Gamepad2,
    color: "#147363",
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
  const searchParams = useSearchParams()
  const projectId = searchParams.get("id")

  const boardRef = React.useRef<HTMLDivElement | null>(null)
  const paletteRef = React.useRef<HTMLElement | null>(null)
  const storageRawRef = React.useRef<string | null>(null)
  const saveBusyRef = React.useRef(false)
  const [renaming,setRenaming]=React.useState(false),[nameDraft,setNameDraft]=React.useState("")
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
  const [openMenuBlockId, setOpenMenuBlockId] = React.useState<string | null>(
    null
  )
  const [compactPalette, setCompactPalette] = React.useState(false)
  const [paletteExpanded, setPaletteExpanded] = React.useState<boolean | null>(null)
  const [blockCategory, setBlockCategory] = React.useState<(typeof PALETTE_FILTERS)[number]["id"]>("all")
  const paletteOpen = paletteExpanded ?? !compactPalette
  const [libraryDropTarget, setLibraryDropTarget] = React.useState(false)

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

  const currentSheet = React.useMemo(
    () =>
      sheetState.sheets.find((s) => s.id === sheetState.activeSheetId) ||
      sheetState.sheets[0],
    [sheetState]
  )

  const blocks = currentSheet?.blocks || []

  React.useEffect(() => {
    let cancelled = false
    async function load() {
    try {
      const prepared = await prepareEditorProjects(window.localStorage, projectId || "", navigator.locks)
      if (cancelled) return
      storageRawRef.current = prepared.raw
      if (prepared.readOnly) setSaveMessage({ text: "Только просмотр: безопасное сохранение в этом браузере недоступно.", isError: true })
      const loaded = prepared.projects
      setProjects(loaded)
      const found = loaded.find((item) => item.id === projectId)
      if (!found) {
        setLoadError("Проект не найден. Выберите проект из списка.")
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

  async function renameProgram(){
    if(!project||saveBusyRef.current)return
    const name=nameDraft.trim().slice(0,64)
    if(!name){setSaveMessage({text:"Введите название программы.",isError:true});return}
    saveBusyRef.current=true
    try{const updated={...project,name,updatedAt:new Date().toISOString()};const next=projects.map(p=>p.id===project.id?updated:p);storageRawRef.current=await saveEditorProjects(localStorage,next,storageRawRef.current,navigator.locks);setProjects(next);setProject(updated);setRenaming(false);document.title=`${name} — Brick Studio`;setSaveMessage({text:"Название сохранено",isError:false})}catch(e){setSaveMessage({text:e instanceof Error?e.message:"Не удалось сохранить название",isError:true})}finally{saveBusyRef.current=false}
  }

  const persistSheets = React.useCallback(
    async (nextState: SheetState, nextLayout?: ControlLayout, nextChassis?: DriveSettings): Promise<boolean> => {
      if (!project) return false
      if (saveBusyRef.current) {
        setSaveMessage({ text: "Сохранение выполняется. Повторите изменение.", isError: true })
        return false
      }
      saveBusyRef.current = true
      const updated: RobotProject = {
        ...project,
        updatedAt: new Date().toISOString(),
        workspace: {
          ...project.workspace,
          ...nextState,
          ...(nextLayout ? { controlLayout: nextLayout } : {}),
          ...(nextChassis ? { chassis: nextChassis } : {}),
        } as unknown as Record<string, unknown>,
      }
      const nextProjects = projects.map((p) =>
        p.id === project.id ? updated : p
      )
      try {
        storageRawRef.current = await saveEditorProjects(window.localStorage, nextProjects, storageRawRef.current, navigator.locks)
        setProjects(nextProjects)
        setProject(updated)
        setSheetState(nextState)
        setSaveMessage({ text: "Сохранено", isError: false })
        return true
      } catch (error) {
        setSaveMessage({ text: error instanceof Error ? error.message : "Не удалось сохранить", isError: true })
        return false
      } finally {
        saveBusyRef.current = false
      }
    },
    [project, projects]
  )

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
    if (compactPalette) setPaletteExpanded(false)
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

  async function startProgram() {
    const session = sessionRef.current
    if (!session || !controllerProgram || starting || checking) return
    setStarting(true)
    setStartError("")
    try {
      await runSessionProgram(session)
    } finally { setStarting(false) }
  }

  async function connectAndStart() {
    const session = sessionRef.current
    if (!session || !controllerProgram || starting) return
    setRunPromptOpen(false)
    setRobotMenuOpen(false)
    setStarting(true)
    setStartError("")
    try {
      await session.connect()
      if (session.getState().transport !== 'connected') {
        if (session.getState().transport === 'fault') setStartError(session.getState().message)
        return
      }
      await runSessionProgram(session)
    } finally { setStarting(false) }
  }

  function handleRunClick() {
    if (!project || !sessionRef.current || starting || checking) return
    if (['connecting', 'uploading', 'starting-hub'].includes(robotState.transport)) return
    setRobotMenuOpen(false)
    setMoreMenuOpen(false)
    if (project.hub === 'spike' && (robotState.transport === 'disconnected' || robotState.transport === 'fault')) {
      setStartError("")
      setRunPromptOpen(true)
      return
    }
    void startProgram()
  }

  async function stopProgram() {
    const session = sessionRef.current
    if (!session) return
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
    if (!runPromptOpen && !chassisDialogOpen && !panelErrorModal && !openMenuBlockId) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRunPromptOpen(false)
        setChassisDialogOpen(false)
        setPanelErrorModal(null)
        setOpenMenuBlockId(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [runPromptOpen, chassisDialogOpen, panelErrorModal, openMenuBlockId])

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
      if (added && compactPalette) setPaletteExpanded(false)
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
        if (compactPalette) setPaletteExpanded(false)
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

  function handleExportCode() {
    if (!project) return
    try {
      const code = `# Лист: ${currentSheet.name.replace(/[\r\n]/g, " ")}\n${generatePybricks(blocks, project.hub, projectChassis.configured ? projectChassis.settings : undefined)}`
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
      className="tlc-editor flex flex-col h-dvh bg-[#f5f8fa] text-[#18313b] select-none overflow-hidden"
      onPointerDown={(e) => {
        if (!(e.target as HTMLElement).closest("[data-module-picker]")) {
          setOpenMenuBlockId(null)
        }
      }}
    >
      {/* Topbar */}
      <header className="editor-topbar h-[68px] shrink-0 flex items-center gap-4 px-4 md:px-6 bg-white border-b border-[#dce8ec] z-10">
        <Link
          href="/dashboard"
          aria-label="К списку проектов"
          className="text-sm font-extrabold text-[#087996] hover:text-[#055a70] whitespace-nowrap"
        >
          ← <span className="hidden xs:inline">Проекты</span>
        </Link>

        {loadError && <button type="button" className="text-xs font-bold text-[#a13620]" onClick={() => {
          const raw = window.localStorage.getItem(STORAGE_KEY)
          if (raw === null) return
          const url = URL.createObjectURL(new Blob([raw], {type:"application/json"}))
          const link = document.createElement("a")
          link.href = url
          link.download = "tlc-projects-backup.json"
          link.click()
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        }}>Скачать исходные проекты</button>}
        <div className="flex items-baseline gap-3 min-w-0">
          {renaming?<form onSubmit={e=>{e.preventDefault();void renameProgram()}} className="flex gap-2 min-w-0"><input autoFocus aria-label="Название программы" className="min-w-0 w-40 border rounded-lg p-2" maxLength={64} value={nameDraft} onChange={e=>setNameDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setRenaming(false)}}/><button type="submit" aria-label="Сохранить название">✓</button></form>:<button disabled={!project||checking} title="Изменить название" aria-label={`Название программы: ${project?.name||'Проект'}. Изменить`} className="text-[17px] font-black truncate text-left" onClick={()=>{setNameDraft(project?.name||'');setRenaming(true)}}>{project?project.name:loadError?'Проект недоступен':'Проект'} <span aria-hidden="true">✎</span></button>}
          {project && (
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {HUBS[project.hub]}
            </Badge>
          )}
        </div>

        <span
          role="status"
          className={`ml-auto text-xs font-semibold ${
            saveMessage.isError ? "text-[#b1372c] max-sm:order-last max-sm:w-full" : "hidden whitespace-nowrap text-[#6f8992] sm:inline"
          }`}
        >
          {saveMessage.text}
        </span>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!project || checking}
          onClick={handleExportCode}
          className="hidden md:inline-flex rounded-[11px] min-h-[40px] px-3.5 font-extrabold border-[#c6dce2] text-[#086985]"
        >
          Код Pybricks
        </Button>

        <div ref={moreMenuRef} className="relative md:hidden">
          <button
            type="button"
            aria-label="Дополнительные действия"
            aria-expanded={moreMenuOpen}
            disabled={!project || checking}
            onClick={() => { setRobotMenuOpen(false); setMoreMenuOpen((prev) => !prev) }}
            className="grid size-10 place-items-center rounded-[11px] border border-[#c6dce2] bg-white text-[#086985] hover:bg-[#f4f8fa] disabled:opacity-40"
          >
            <MoreHorizontal size={18} aria-hidden="true" />
          </button>
          {moreMenuOpen && (
            <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-52 rounded-xl border border-[#dce8ec] bg-white p-1.5 shadow-xl">
              <button
                type="button"
                onClick={() => { setMoreMenuOpen(false); handleExportCode() }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-[#18313b] hover:bg-[#eff8fb]"
              >
                Код Pybricks (.py)
              </button>
            </div>
          )}
        </div>

        <div ref={robotMenuRef} className="relative">
          <button
            type="button"
            aria-expanded={robotMenuOpen}
            aria-label={`Статус робота: ${robotState.message}`}
            onClick={() => { setMoreMenuOpen(false); setRobotMenuOpen((prev) => !prev) }}
            className="flex min-h-[40px] items-center gap-2 rounded-full border border-[#c6dce2] bg-[#f8fbfc] px-3 py-1.5 text-sm font-bold text-[#18313b] hover:bg-[#eff7fa]"
          >
            <span
              aria-hidden="true"
              className={`size-2.5 shrink-0 rounded-full ${
                robotState.transport === "ready" || robotState.transport === "connected"
                  ? "bg-emerald-500"
                  : robotState.transport === "connecting"
                    ? "bg-sky-500 animate-pulse"
                    : robotState.transport === "uploading" || robotState.transport === "starting-hub"
                      ? "bg-[#087996] animate-pulse"
                      : robotState.transport === "fault"
                        ? "bg-red-500"
                        : "bg-slate-400"
              }`}
            />
            <Bluetooth size={14} className="shrink-0 text-[#4c6b77] sm:hidden" aria-hidden="true" />
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
            <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-72 rounded-2xl border border-[#dce8ec] bg-white p-3.5 shadow-xl flex flex-col gap-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wide text-[#57717d]">
                    {robotState.hubName || (project?.hub === "ev3" ? "LEGO EV3" : "SPIKE Prime")}
                  </p>
                  <p role="status" className="mt-0.5 text-xs font-medium text-[#18313b]">{robotState.message}</p>
                </div>
              </div>
              {robotState.ports.length > 0 && (
                <p className="text-[11px] font-semibold text-[#57717d]">
                  Порты моторов: {robotState.ports.join(", ")}
                </p>
              )}
              {project?.hub === "ev3" ? (
                <p className="rounded-lg bg-[#f4f8fa] px-2.5 py-2 text-xs font-semibold text-[#475569]">
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
                      className="min-h-[40px] rounded-xl bg-[#087996] px-3 py-2 text-sm font-extrabold text-white hover:bg-[#06637a] disabled:opacity-40"
                    >
                      {robotState.transport === "fault" ? "Переподключить робота" : "Подключить робота"}
                    </button>
                  )}
                  {robotState.transport !== "disconnected" && (
                    <button
                      type="button"
                      disabled={checking && robotState.transport !== "connecting"}
                      onClick={() => { setRobotMenuOpen(false); void sessionRef.current?.disconnect() }}
                      className="min-h-[38px] rounded-xl border border-[#dce8ec] px-3 py-2 text-xs font-bold text-[#31525f] hover:bg-[#f4f8fa] disabled:opacity-40"
                    >
                      {robotState.transport === "connecting" ? "Отменить подключение" : "Отключить"}
                    </button>
                  )}
                  {robotState.needsManualHubProgram && (
                    <a
                      className="mt-1 text-center text-xs font-semibold text-[#086985] underline"
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

        {checking || starting || robotState.transport === "uploading" || robotState.transport === "starting-hub" ? (
          <Button
            type="button"
            onClick={() => void stopProgram()}
            className="rounded-[11px] min-h-[40px] px-4 font-extrabold bg-red-700 hover:bg-red-800 text-white"
          >
            ■ Стоп
          </Button>
        ) : (
          <Button
            ref={runButtonRef}
            type="button"
            disabled={!project || robotState.transport === "connecting"}
            onClick={handleRunClick}
            className="rounded-[11px] min-h-[40px] px-4 font-extrabold bg-emerald-700 hover:bg-emerald-800 text-white"
          >
            ▶ Запуск
          </Button>
        )}
      </header>

      {/* Main Editor Body */}
      <div className="flex flex-1 min-h-0 relative">
        <aside
          ref={paletteRef}
          aria-label="Меню блоков"
          inert={checking || undefined}
          className={`relative z-20 flex shrink-0 ${checking ? "opacity-50 max-md:invisible" : ""}`}
        >
          <div className={`flex w-12 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-[#dce8ec] py-2 ${libraryDropTarget ? "bg-red-100" : "bg-[#f4f8fa]"}`}>
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
              className="mt-1 grid size-10 shrink-0 place-items-center rounded-lg border border-[#dce8ec] text-[#475569] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-current"
            >
              {paletteOpen ? <PanelLeftClose size={18} aria-hidden="true" /> : <PanelLeftOpen size={18} aria-hidden="true" />}
            </button>
            {libraryDropTarget && (
              <Trash2 size={18} className="my-2 shrink-0 text-red-700" aria-label="Отпустите, чтобы удалить блок" />
            )}
          </div>

          <div
            id="editor-block-palette"
            hidden={!paletteOpen}
            className={`w-44 shrink-0 overflow-y-auto overscroll-contain border-r border-[#dce8ec] px-2.5 py-2 max-md:absolute max-md:inset-y-0 max-md:left-full max-md:shadow-md ${libraryDropTarget ? "bg-red-50 ring-2 ring-inset ring-red-300" : "bg-white"}`}
          >
            {BLOCK_CATEGORIES.filter(({ id }) => blockCategory === "all" || id === blockCategory).map(({ id, label, color, blocks: entries }) => (
              <section key={id} aria-label={label} className="mb-3">
                <h2 className="mb-1 px-1 text-xs font-extrabold" style={{ color }}>{label}</h2>
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
                          className="grid h-12 w-full touch-none cursor-grab place-items-center rounded-xl border-2 border-[#b9d0da] bg-[#f4f8fa] p-1 hover:border-[#087996] hover:bg-[#e7f3f8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
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
                          className="grid h-12 w-full touch-none cursor-grab place-items-center rounded-xl border-2 border-[#c7d2fe] bg-[#eef2ff]/60 p-1 hover:border-[#4f46e5] hover:bg-[#eef2ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
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
                                className="grid h-14 w-full touch-none cursor-grab place-items-center rounded-xl border-2 border-[#dfae87] bg-white p-1 hover:border-[#c35117] hover:bg-[#fff8ef] focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
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
                        className="flex min-h-10 w-full touch-none cursor-grab items-center gap-2 rounded-lg bg-[#f4f8fa] px-2 py-1.5 text-left text-xs font-bold leading-tight hover:bg-[#eaf2f6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-current active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="grid size-6 shrink-0 place-items-center rounded-md text-white" style={{ backgroundColor: color }}>
                          <Icon size={14} aria-hidden="true" />
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
          <div inert={checking || undefined} className="h-[54px] shrink-0 flex items-center gap-2 px-4 bg-white border-b border-[#e1eaee]">
            <span className="text-[13px] font-extrabold text-[#57717d] hidden sm:inline">
              Рабочая область
            </span>
            <button
              type="button"
              disabled={!project}
              onClick={openChassisDialog}
              aria-label="Настройки шасси"
              title="Настройки шасси"
              className={`min-h-[40px] h-[40px] px-3 rounded-[10px] border text-xs font-extrabold flex items-center gap-1.5 transition-colors disabled:opacity-40 ${
                !projectChassis.configured && blocks.some(b => b.type === "chassis")
                  ? "border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100"
                  : "border-[#dce7ec] bg-white hover:bg-[#f1f9fb] text-[#31525f]"
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

          {(checking || robotState.transport === "uploading" || robotState.transport === "starting-hub" || robotState.transport === "fault" || startError) && (
            <div
              role={robotState.transport === "fault" ? "alert" : "status"}
              className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-1.5 text-xs font-semibold ${
                robotState.transport === "fault"
                  ? "border-red-200 bg-red-50 text-red-900"
                  : "border-[#dce8ec] bg-[#f4fafc] text-[#31525f]"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate">{startError || robotState.message}</span>
                {robotState.transport === "uploading" && (
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#d3e8ef]">
                    <div
                      className="h-full bg-[#087996] transition-all duration-150"
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
                      className="underline text-[#086985]"
                    >
                      Скачать вручную
                    </a>
                  )}
                  {bleSupport.available && (
                    <button
                      type="button"
                      disabled={starting}
                      onClick={() => checking ? void connectAndStart() : void sessionRef.current?.connect()}
                      className="rounded-lg bg-red-700 px-2.5 py-1 text-xs font-extrabold text-white hover:bg-red-800 disabled:opacity-50"
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
                  className="shrink-0 rounded-lg bg-[#087996] px-2.5 py-1 text-xs font-extrabold text-white hover:bg-[#06637a] disabled:opacity-50"
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
              backgroundImage:
                "radial-gradient(#bbcbd2 1.15px, transparent 1.15px)",
              backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
              backgroundPosition: `${panX}px ${panY}px`,
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
                setLibraryDropTarget(pointerOver(paletteRef.current, e.clientX, e.clientY))
              }
            }}
            onPointerUp={(e) => {
              if (!gesture) return
              if (gesture.kind === "block") {
                const { id, originX, originY, startX, startY, moved } = gesture
                setGesture(null)
                setSnapTargetSlot(null)
                setLibraryDropTarget(false)
                if (moved) {
                  const droppedInLibrary = pointerOver(paletteRef.current, e.clientX, e.clientY)
                  if (droppedInLibrary) {
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
                    targetBlock.type === "if"
                  const isBodyBranch =
                    snapTargetSlot.branch === "body" &&
                    targetBlock.type === "if"
                  const isElseBranch =
                    snapTargetSlot.branch === "else" &&
                    targetBlock.type === "if"
                  if (isCondBranch) {
                    return (
                      <div
                        aria-hidden="true"
                        style={{
                          left: `${targetBlock.x + 68}px`,
                          top: `${targetBlock.y + 11}px`,
                        }}
                        className="absolute z-30 w-[132px] h-[36px] rounded-full border-2 border-dashed border-[#fbbf24] bg-[#fef3c7]/65 shadow-[0_0_20px_rgba(251,191,36,0.55)] pointer-events-none animate-lego-magnet"
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
                      className="absolute z-20 w-[320px] h-[58px] rounded-[12px] border-2 border-dashed border-[#fbbf24] bg-[#fef3c7]/55 shadow-[0_0_24px_rgba(251,191,36,0.45)] pointer-events-none animate-lego-magnet"
                    >
                      <span className="absolute -top-[8px] left-[32px] w-[44px] h-[11px] rounded-t-[6px] bg-[#fbbf24]" />
                    </div>
                  )
                })()}

              <div inert={checking || undefined}>
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
                      targetBlock.type === "if"
                    const isBodyBranch =
                      snapTargetSlot.branch === "body" &&
                      targetBlock.type === "if"
                    const isElseBranch =
                      snapTargetSlot.branch === "else" &&
                      targetBlock.type === "if"
                    const snapX = isCondBranch
                      ? targetBlock.x + 68
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
                const bodySpineHeight = isIfBlock
                  ? ifInnerHeight(blocks, block.id, "body")
                  : 0
                const elseSpineHeight = isIfBlock
                  ? ifInnerHeight(blocks, block.id, "else")
                  : 0

                const radiusClass = isIfBlock
                  ? ""
                  : isButtonBlock
                    ? `rounded-t-[22px] ${
                        hasChild ? "rounded-b-[5px]" : "rounded-b-[14px]"
                      }`
                    : motorBlock || isStopBlock || isChassisBlock || isSensorBlock
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
                    role={motorBlock || isChassisBlock || isIfBlock || isStopBlock || isSensorBlock || isMotorButtons ? "group" : "button"}
                    aria-label={
                      isIfBlock
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
                    className={`absolute touch-none select-none ${checking && isMotorButtons ? "cursor-default" : "cursor-grab"} ${
                      isMoving
                        ? "z-30 cursor-grabbing scale-[1.02] shadow-2xl"
                        : checking && isMotorButtons
                          ? "z-40 transition-[left,top,box-shadow] duration-200 ease-out"
                          : "z-10 transition-[left,top,box-shadow] duration-200 ease-out"
                    } ${
                      openMenuBlockId === block.id ? "z-40" : ""
                    } ${radiusClass} ${
                      isIfBlock
                        ? "pointer-events-none text-white"
                        : isMotorButtons
                          ? `${buttonDrag?.blockId === block.id ? "overflow-visible" : "overflow-hidden"} rounded-[14px] border border-[#b9d0da] bg-[#f4f8fa] text-[#18313b] shadow-[inset_0_-4px_#d6e4e9,0_8px_18px_rgba(20,105,123,0.12)]`
                        : isButtonBlock
                          ? "w-max min-h-[58px] bg-[#e85d2a] text-white shadow-[inset_0_-4px_#c2410c,0_8px_18px_rgba(232,93,42,0.16)]"
                          : isSensorBlock
                            ? "w-max min-h-[64px] bg-[#4f46e5] text-white shadow-[inset_0_-4px_#3730a3,0_8px_18px_rgba(79,70,229,0.18)]"
                          : isStopBlock
                            ? "w-max min-h-[64px] bg-[#b1372c] text-white shadow-[inset_0_-4px_#8f2a21,0_8px_18px_rgba(177,55,44,0.16)]"
                            : isChassisBlock
                              ? "w-max min-h-[64px] bg-[#0284c7] text-white shadow-[inset_0_-4px_#0369a1,0_8px_18px_rgba(3,105,161,0.16)]"
                              : motorBlock
                                ? paired
                                  ? "w-max min-h-[64px] bg-[#107e79] text-white shadow-[inset_0_-4px_#086560,0_8px_18px_rgba(20,105,123,0.16)]"
                                  : "w-max min-h-[64px] bg-[#0589b1] text-white shadow-[inset_0_-4px_#00759b,0_8px_18px_rgba(20,105,123,0.16)]"
                                : "w-[320px] min-h-[58px] bg-[#f59e0b] text-white px-5 flex items-center shadow-[inset_0_-4px_#d97706,0_8px_18px_rgba(120,53,15,0.16)]"
                    } ${
                      isJustAdded ? "animate-lego-spawn" : ""
                    } ${
                      isJustSnapped ? "animate-lego-snap" : ""
                    } ${
                      !isIfBlock && !isMotorButtons && blockError
                        ? "ring-2 ring-[#dc2626]"
                        : ""
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
                    {/* Top LEGO connector stud for motor, chassis, if, and stop blocks */}
                    {(motorBlock || isChassisBlock || isIfBlock || isStopBlock || isSensorBlock) && (
                      <span
                        aria-hidden="true"
                        className={`absolute -top-[8px] left-[32px] w-[44px] h-[11px] rounded-t-[6px] pointer-events-auto ${
                          isIfBlock
                            ? "bg-[#7c3aed]"
                            : isSensorBlock
                              ? "bg-[#4f46e5]"
                            : isStopBlock
                              ? "bg-[#b1372c]"
                              : isChassisBlock
                                ? "bg-[#0284c7]"
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
                    {isSelected && !isMotorButtons && (
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
                    {isMotorButtons ? (
                      <div data-button-panel="true" data-panel-drag={!checking ? "true" : undefined} className="relative flex h-full w-full flex-col">
                        {!checking && (
                          <button
                            type="button"
                            aria-label="Удалить кнопки моторов"
                            title="Удалить"
                            onPointerDown={e => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedId(null)
                              saveBlocks(removeBlock(blocks, block.id))
                            }}
                            className="pointer-events-auto absolute right-1 top-1 z-20 grid size-[22px] place-items-center rounded-full border border-[#b9d0da] bg-white/95 text-xs font-extrabold leading-none text-[#31525f] shadow-sm hover:bg-[#fee2e2] hover:text-[#991b1b]"
                          >
                            ×
                          </button>
                        )}
                        {(() => {
                          const hiddenButtons = block.hiddenControlButtons || []
                          const colors = (["blue", ...(block.controlModules || [])] as MotorPanelButton[])
                            .filter(color => !hiddenButtons.includes(color))
                          const panelErrors = [...new Set(colors.map(color => inputErrors[`${block.id}:${color}`]).filter(Boolean))]
                          const paint: Record<MotorPanelButton, { face: string; shade: string }> = {
                            blue: { face: "#1687b3", shade: "#0e688a" },
                            red: { face: "#d9473d", shade: "#a92b26" },
                            green: { face: "#32a66a", shade: "#21804e" },
                            yellow: { face: "#edc13d", shade: "#c59b24" },
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
                              e.currentTarget.setPointerCapture(e.pointerId)
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
                            className="pointer-events-auto absolute left-1 top-1 z-20 grid size-5 place-items-center rounded-full bg-[#dc2626] text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
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
                                  className={`block touch-none appearance-none p-0 rounded-full border border-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${checking?"cursor-pointer":"cursor-grab"} ${isCross ? fourButtonPositions[color] : ""} ${buttonDrag?.blockId === block.id && buttonDrag.color === color ? "z-30 cursor-grabbing opacity-80" : ""}`}
                                  style={{
                                    width: buttonSize,
                                    height: buttonSize,
                                    background: paint[color].face,
                                    boxShadow: `inset 0 -${Math.max(3,Math.round(buttonSize*0.12))}px ${paint[color].shade},0 2px 3px #78909a`,
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
                                  className="grid shrink-0 place-items-center rounded-full border border-[#b9d0da] bg-white text-lg font-bold text-[#31525f]"
                                >+</button>
                              )}
                            </div>
                            </>
                          )
                        })()}
                        {!checking && <button type="button" aria-label="Изменить размер панели кнопок" onPointerDown={e=>resizeMotorPanel(e,block)} className="absolute bottom-0 right-0 z-20 grid h-6 w-6 cursor-nwse-resize place-items-center rounded-tl bg-white/80 text-sm text-[#31525f]">◢</button>}
                      </div>
                    ) : isIfBlock ? (
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
                        return (
                      <div className="flex flex-col items-start">
                        {/* 1. Top Header Bar of E-shaped If/Else block */}
                        <div
                          className={`pointer-events-auto relative flex flex-nowrap items-center min-h-[58px] h-[58px] w-max min-w-[260px] px-5 gap-3 bg-[#7c3aed] shadow-[inset_0_-4px_#5b21b6,0_8px_18px_rgba(91,33,182,0.2)] ${
                            isConnected
                              ? "rounded-tl-[5px] rounded-tr-[14px]"
                              : "rounded-t-[14px]"
                          } rounded-br-[14px] ${
                            isSelected
                              ? "ring-3 ring-[#087996]"
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
                            className="absolute -bottom-[7px] left-[60px] w-[44px] h-[10px] rounded-b-[6px] bg-[#7c3aed] z-20"
                          />

                          <span className="text-[16px] font-extrabold whitespace-nowrap tracking-tight">
                            Если
                          </span>
                          {conditionBlock && !isDraggingCondition ? (
                            <div className="relative flex items-center shrink-0">
                              <SensorBlock
                                block={conditionBlock}
                                slotted
                                errorMessage={condError}
                                onChange={(changes) => {
                                  if (!project) return
                                  saveBlocks(
                                    updateDrive(blocks, conditionBlock.id, changes, project.hub)
                                  )
                                }}
                                onStartDrag={(e) => {
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
                              {selectedId === conditionBlock.id && (
                                <button
                                  type="button"
                                  aria-label="Удалить датчик из условия"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedId(null)
                                    saveBlocks(removeBlock(blocks, conditionBlock.id))
                                  }}
                                  className="pointer-events-auto absolute -top-2 -right-2 z-30 w-[22px] h-[22px] rounded-full bg-white text-[#18313b] shadow-md text-sm leading-none font-bold grid place-items-center"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          ) : (
                            <span
                              role="region"
                              aria-label="Слот для датчика"
                              className={`w-[88px] h-[32px] shrink-0 rounded-full border shadow-inner transition-colors ${
                                isConditionSnap
                                  ? "border-2 border-dashed border-[#fbbf24] bg-[#fef3c7]/45"
                                  : "bg-[#4c1d95]/55 border-white/25"
                              }`}
                            />
                          )}
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
                      <div className="text-[16px] font-extrabold tracking-tight whitespace-nowrap drop-shadow-xs">
                        ▶ &nbsp;Когда программа запускается
                      </div>
                    ) : (
                      <div className="flex flex-col">
                      <div className="group flex flex-nowrap items-center min-h-[64px] px-5 gap-3">
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
                            className="min-h-[36px] min-w-[36px] h-[38px] w-[38px] rounded-full bg-white text-[#0d3b4c] hover:bg-[#e7f4f8] font-black text-lg shadow-xs grid place-items-center cursor-pointer"
                          >
                            {block.direction === "backward" ? "↺" : "↻"}
                          </button>

                          {paired && (
                            <div className="shrink-0 flex flex-nowrap items-center gap-2 min-h-[36px]">
                              <span className="text-[16px] font-extrabold opacity-95 whitespace-nowrap">
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
                                className="min-h-[36px] min-w-[36px] h-[38px] w-[38px] rounded-full bg-white text-[#0d3b4c] hover:bg-[#e7f4f8] font-black text-lg shadow-xs grid place-items-center cursor-pointer shrink-0"
                              >
                                {block.direction2 === "backward" ? "↺" : "↻"}
                              </button>
                              <button
                                type="button"
                                aria-label="Удалить второй мотор"
                                title="Удалить второй мотор"
                                onClick={() =>
                                  project &&
                                  saveBlocks(
                                    updateDrive(
                                      blocks,
                                      block.id,
                                      {
                                        ...(block.type === "pair" ? { type: "drive" as BlockType } : {}),
                                        modules: modules.filter((m) => m !== "pair"),
                                      },
                                      project.hub
                                    )
                                  )
                                }
                                className="min-h-[36px] min-w-[36px] rounded-full bg-white/20 hover:bg-white/40 text-white text-base leading-none font-black grid place-items-center cursor-pointer shrink-0"
                              >
                                ×
                              </button>
                            </div>
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
                                    <option value="rotations">об</option>
                                    <option value="degrees">°</option>
                                    <option value="seconds">с</option>
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
                        <div
                          data-module-picker="true"
                          className="relative shrink-0 flex items-center ml-1"
                        >
                          <button
                            type="button"
                            aria-label="Добавить модуль мотора"
                            aria-expanded={openMenuBlockId === block.id}
                            onClick={() =>
                              setOpenMenuBlockId((prev) =>
                                prev === block.id ? null : block.id
                              )
                            }
                            className="w-[36px] h-[36px] rounded-full border border-white/55 bg-white/15 hover:bg-white/30 text-white text-xl leading-none font-black grid place-items-center"
                          >
                            +
                          </button>

                          {openMenuBlockId === block.id && (
                            <div className="absolute top-[calc(100%+8px)] right-0 z-50 w-[240px] p-2.5 rounded-[12px] border border-[#dce8ec] bg-white text-[#18313b] shadow-xl flex flex-col gap-1.5">
                              {(
                                [
                                  ["pair", "второй мотор (связь)"],
                                  ["speed", "со скоростью"],
                                  ["power", "с мощностью"],
                                  ["travel", "на [значение] [ед. изм.]"],
                                ] as const
                              ).map(([modName, label]) => (
                                <button
                                  key={modName}
                                  type="button"
                                  disabled={modName === "pair" ? paired : modules.includes(modName)}
                                  onClick={() => {
                                    if (!project) return
                                    const filtered = modules.filter(
                                      (m) =>
                                        !(modName === "speed" && m === "power") &&
                                        !(modName === "power" && m === "speed")
                                    )
                                    saveBlocks(
                                      updateDrive(
                                        blocks,
                                        block.id,
                                        {
                                          modules: [
                                            ...filtered,
                                            modName as MotorModule,
                                          ],
                                          ...(modName === "pair"
                                            ? {
                                                motor2: (block.motor || "A") === "B" ? "A" : "B",
                                                direction2: "backward",
                                              }
                                            : {}),
                                          ...(modName === "power"
                                            ? { unit: "seconds" }
                                            : {}),
                                        },
                                        project.hub
                                      )
                                    )
                                    setOpenMenuBlockId(null)
                                  }}
                                  className="text-left px-3.5 py-2.5 rounded-lg bg-[#eff8fb] hover:bg-[#dff2f8] text-sm font-extrabold text-[#18313b] disabled:opacity-45"
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <BlockErrorBar errorMessage={blockError} />
                      </div>
                    )}
                  </div>
                )
              })}
              </div>
            </div>

            {loadError && !project && <div className="absolute inset-0 z-30 overflow-y-auto bg-white p-6"><h2 className="text-lg font-bold">{loadError}</h2><div className="flex flex-col gap-2 mt-4">{projects.map(p=><Link key={p.id} className="rounded-lg border p-3 text-[#086985]" href={`/editor?id=${encodeURIComponent(p.id)}`}>{p.name}</Link>)}{projects.length===0&&<Link href="/dashboard" className="text-[#086985] underline">К списку проектов</Link>}</div></div>}
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
              : gesture.type === "sensor"
                ? "w-[200px] h-[48px] rounded-full bg-[#4f46e5] shadow-[inset_0_-6px_#3730a3]"
                : gesture.type === "pair"
                  ? "w-[220px] h-[56px] rounded-[12px] bg-[#107e79] shadow-[inset_0_-6px_#086560]"
                  : gesture.type === "button"
                    ? "w-[200px] h-[52px] rounded-t-[20px] rounded-b-[12px] bg-[#e85d2a] shadow-[inset_0_-6px_#c2410c]"
                    : gesture.type === "motor-buttons"
                      ? "w-[160px] h-[52px] rounded-[14px] border border-[#b9d0da] bg-[#f4f8fa] text-[#18313b] shadow-[inset_0_-4px_#d6e4e9]"
                      : gesture.type === "stop"
                        ? "w-[220px] h-[56px] rounded-[12px] bg-[#b1372c] shadow-[inset_0_-6px_#8f2a21]"
                        : gesture.type === "chassis"
                          ? "w-[220px] h-[56px] rounded-[12px] bg-[#0284c7] shadow-[inset_0_-6px_#0369a1]"
                          : "w-[220px] h-[56px] rounded-[12px] bg-[#0589b1] shadow-[inset_0_-6px_#00759b]"
          }`}
        >
          {gesture.type === "start"
            ? "▶  Когда программа запускается"
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
          className="fixed inset-0 z-50 bg-[#112a36]/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full max-w-[420px] rounded-t-[24px] sm:rounded-[20px] bg-white p-5 pb-6 sm:pb-5 shadow-2xl border border-[#dce8ec]">
            <h2 className="text-lg font-black text-[#18313b]">
              {bleSupport.checked && !bleSupport.available
                ? "Bluetooth недоступен в этом браузере"
                : robotState.transport === "fault"
                  ? "Связь с роботом потеряна"
                  : "Робот ещё не подключён"}
            </h2>
            <p className="mt-1.5 text-sm text-[#475569]">
              {bleSupport.checked && !bleSupport.available
                ? `${bleSupport.reason} Можно проверить управление в пробном режиме или скачать код Pybricks.`
                : robotState.transport === "fault"
                  ? "Переподключите хаб по Bluetooth, и программа сразу запустится."
                  : "IDE сама подготовит хаб по Bluetooth и сразу запустит ваше управление."}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {(!bleSupport.checked || bleSupport.available) && (
                <Button
                  type="button"
                  onClick={() => void connectAndStart()}
                  className="min-h-[44px] w-full rounded-xl bg-emerald-700 hover:bg-emerald-800 text-sm font-extrabold text-white"
                >
                  {robotState.transport === "fault" ? "Переподключить и запустить" : "Подключить и запустить"}
                </Button>
              )}
              <Button
                type="button"
                variant={bleSupport.checked && !bleSupport.available ? "default" : "outline"}
                onClick={() => { setRunPromptOpen(false); void startProgram() }}
                className={`min-h-[44px] w-full rounded-xl text-sm font-bold ${
                  bleSupport.checked && !bleSupport.available
                    ? "bg-[#087996] hover:bg-[#06637a] text-white font-extrabold"
                    : "border-[#c6dce2] text-[#18313b]"
                }`}
              >
                Пробный режим (без робота)
              </Button>
              {bleSupport.checked && !bleSupport.available && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setRunPromptOpen(false); handleExportCode() }}
                  className="min-h-[44px] w-full rounded-xl border-[#c6dce2] text-sm font-bold text-[#086985]"
                >
                  Код Pybricks (.py)
                </Button>
              )}
              <button
                type="button"
                onClick={() => setRunPromptOpen(false)}
                className="mt-1 min-h-[40px] text-xs font-bold text-[#57717d] hover:text-[#18313b]"
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
          className="fixed inset-0 z-50 bg-[#112a36]/50 grid place-items-center p-4"
        >
          <div className="w-full max-w-[380px] rounded-[20px] border border-[#dce8ec] bg-white p-5 text-[#18313b] shadow-2xl">
            <h2 className="text-lg font-black mb-3">Настройки шасси</h2>
            <div className="flex flex-col gap-3">
              {([
                { label: "Левый мотор", portKey: "leftPort", revKey: "leftReversed" },
                { label: "Правый мотор", portKey: "rightPort", revKey: "rightReversed" },
              ] as const).map(({ label, portKey, revKey }) => (
                <div key={portKey} className="flex items-center justify-between gap-2 rounded-xl border border-[#e1eaee] bg-[#f8fbfc] px-3 py-2">
                  <span className="text-sm font-bold">{label}</span>
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
                      className="min-h-[36px] h-[36px] rounded-lg border border-[#c6dce2] bg-white px-2.5 text-sm font-black"
                    >
                      {motorPorts.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <button
                      type="button"
                      aria-label={`Инверсия: ${label.toLowerCase()}`}
                      aria-pressed={chassisDraft[revKey]}
                      title={chassisDraft[revKey] ? "Реверс (↺)" : "Прямо (↻)"}
                      onClick={() => setChassisDraft((prev) => ({ ...prev, [revKey]: !prev[revKey] }))}
                      className={`min-h-[36px] min-w-[36px] h-[36px] px-2.5 rounded-lg border text-sm font-black flex items-center gap-1 ${
                        chassisDraft[revKey]
                          ? "border-[#087996] bg-[#e7f4f8] text-[#086985]"
                          : "border-[#c6dce2] bg-white text-[#31525f]"
                      }`}
                    >
                      <span>{chassisDraft[revKey] ? "↺" : "↻"}</span>
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between gap-2 rounded-xl border border-[#e1eaee] bg-[#f8fbfc] px-3 py-2">
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
                    className="w-[80px] min-h-[36px] h-[36px] rounded-lg border border-[#c6dce2] bg-white px-2 text-center text-sm font-black"
                  />
                  <span className="text-xs font-bold text-[#57717d]">°/с</span>
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" className="min-h-[40px]" onClick={() => setChassisDialogOpen(false)}>Отмена</Button>
              <Button
                type="button"
                className="min-h-[40px] bg-[#087996] hover:bg-[#06637a] text-white font-extrabold"
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
          className="fixed inset-0 z-50 bg-[#112a36]/50 grid place-items-center p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-[#dfae87] bg-white p-5 text-[#18313b] shadow-xl">
            <h2 className="mb-3 text-lg font-extrabold">Кнопка недоступна</h2>
            <p className="whitespace-pre-line text-sm">{panelErrorModal}</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setPanelErrorModal(null)}
                className="min-h-[40px] rounded-full bg-[#0e7668] px-4 py-2 font-bold text-white"
              >
                Понятно
              </button>
            </div>
          </div>
        </div>
      )}

      {codeModal.open && <div role="dialog" aria-modal="true" aria-label={codeModal.title} className="fixed inset-0 z-50 bg-[#112a36]/50 grid place-items-center p-4"><div className="w-full max-w-[600px] rounded-[18px] bg-white p-6 shadow-2xl"><h2 className="text-xl font-black mb-3">{codeModal.title}</h2><p className="text-sm mb-3">Загрузите файл в Pybricks Code и запустите на хабе.</p><textarea readOnly aria-label="Код программы Pybricks" value={codeModal.code} className="w-full h-[210px] p-3 border rounded-lg font-mono text-sm"/><div className="flex justify-end gap-3 mt-4"><Button type="button" variant="outline" onClick={handleDownloadPy}>Скачать .py</Button><Button type="button" onClick={()=>setCodeModal(prev=>({...prev,open:false}))}>Закрыть</Button></div></div></div>}

    </div>
    {landscapeBlocked && (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-landscape-title"
        className="fixed inset-0 z-[13000] grid place-items-center bg-[#0f2430]/92 p-6 text-white backdrop-blur-md"
      >
        <div className="w-full max-w-sm rounded-3xl border border-white/15 bg-[#163140] p-6 text-center shadow-2xl">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-[#087996]/25 text-[#5eead4]">
            <RotateCw size={28} aria-hidden="true" />
          </div>
          <h2 id="editor-landscape-title" className="text-xl font-black tracking-tight">
            Поверните экран горизонтально
          </h2>
          <p className="mt-2 text-sm text-[#c7dce4]">
            Редактор работает только в альбомном режиме
          </p>
          {orientationManualHint && (
            <p role="status" className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-[#e0f2fe]">
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
              className="min-h-[44px] w-full rounded-xl bg-[#087996] px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-[#06637a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5eead4]"
            >
              Перейти в горизонт
            </button>
            <Link
              href="/dashboard"
              className="grid min-h-[44px] w-full place-items-center rounded-xl border border-white/20 px-4 py-2.5 text-sm font-bold text-[#e2f1f6] transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5eead4]"
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
