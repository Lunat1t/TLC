import { DEFAULT_LOOP_TIMES, MAX_LOOP_TIMES, normalizeModules, validateModuleRules } from "./block-modules.ts"
import { DEFAULT_SOUND_ID, DEFAULT_SOUND_VOLUME, findSoundPreset, soundSteps } from "./sound/presets.ts"
import { HUB_PROGRAM_SOURCE } from "./hub-program-source.ts"
import type { HubType } from "./projects"
import {
  ACTION_BLOCK_TYPES,
  BLOCK_TYPES,
  CHASSIS_DIRECTIONS,
  DEFAULT_DRIVE_SETTINGS,
  DEFAULT_SENSOR_ANGLE,
  DEFAULT_SENSOR_AXIS,
  DEFAULT_SENSOR_COLOR,
  DEFAULT_SENSOR_DISTANCE,
  DEFAULT_SENSOR_FORCE,
  DEFAULT_SENSOR_LIGHT,
  DEFAULT_SENSOR_MODULE,
  DEFAULT_SENSOR_REFLECTION,
  DEFAULT_SENSOR_TILT,
  HUB_PORTS,
  IMU_AXES,
  SENSOR_COLORS,
  SENSOR_MODULES_BY_TYPE,
  SENSOR_PORTS,
  SENSOR_TYPES,
  WHEEL_DIRECTIONS,
  getStopPorts,
  isDriveSettings,
  isPairedBlock,
  type ChassisDirection,
  type DriveSettings,
  type ImuAxis,
  type SensorColor,
  type SensorModule,
  type SensorOp,
  type SensorType,
} from "./block-registry.ts"

export const MAX_BLOCKS = 200
export const MOTOR_SPEED = 360
export const MAX_SHEETS = 32

export type ControllerButton =
  | "up"
  | "down"
  | "left"
  | "right"
  | "a"
  | "b"
  | "x"
  | "y"
  | "l"
  | "r"
  | "blue"
  | "red"
  | "green"
  | "yellow"
export type ControllerEvent = "hold" | "pressed" | "released"
export { isPairedBlock }
export type { ChassisDirection, ImuAxis, SensorColor, SensorModule, SensorOp, SensorType }

export type BlockType = "start" | "drive" | "pair" | "chassis" | "if" | "loop" | "button" | "stop" | "motor-buttons" | "sensor" | "sound"
const LIBRARY_BLOCK_TYPES = new Set<BlockType>(BLOCK_TYPES as readonly BlockType[])
export type MotorDirection = "forward" | "backward"
export type TravelUnit = "rotations" | "degrees" | "seconds"
export type MotorModule = "pair" | "speed" | "power" | "travel" | "times" | "while" | "volume" | "wait"
export type MotorButtonModule = "red" | "green" | "yellow"
export type MotorPanelButton = "blue" | MotorButtonModule
export type BranchSlot = "body" | "else" | "condition"

export const IF_TOP_HEIGHT = 58
export const IF_MID_HEIGHT = 48
export const IF_FOOT_HEIGHT = 28
export const IF_INDENT = 28
export const IF_EMPTY_MOUTH = 52
export const LOOP_TOP_HEIGHT = IF_TOP_HEIGHT
export const LOOP_FOOT_HEIGHT = IF_FOOT_HEIGHT

/**
 * Сдвиг овала для датчика от левого края блока: у цикла подпись
 * «Повторять пока» длиннее, чем «Если».
 */
export function conditionSlotX(type: BlockType | undefined): number {
  return type === "loop" ? 178 : 68
}

/** Блоки с «ртом», в который вставляются другие блоки. */
export function isContainerType(type: BlockType | undefined): boolean {
  return type === "if" || type === "loop"
}

/**
 * Можно ли подключить блок к слоту `branch` родителя.
 * «Если» принимает условие, тело и «иначе»; цикл — тело и (с модулем «Пока») условие.
 */
export function acceptsBranch(
  parent: Pick<WorkspaceBlock, "type" | "modules"> | undefined,
  branch: BranchSlot | undefined,
  childType?: BlockType
): boolean {
  if (!parent || !branch) return false
  if (branch === "body") return isContainerType(parent.type)
  if (branch === "else") return parent.type === "if"
  if (childType !== "sensor") return false
  return parent.type === "if" || (parent.type === "loop" && Boolean(parent.modules?.includes("while")))
}

export interface WorkspaceBlock {
  id: string
  type: BlockType
  x: number
  y: number
  parentId?: string
  controlAreaId?: string
  branch?: BranchSlot
  motor?: string
  motor2?: string
  motors?: string[]
  stopAll?: boolean
  direction?: MotorDirection
  direction2?: MotorDirection
  chassisDirection?: ChassisDirection
  modules?: MotorModule[]
  controlModules?: MotorButtonModule[]
  hiddenControlButtons?: MotorPanelButton[]
  width?: number
  height?: number
  speed?: number
  power?: number
  value?: number
  /** Звук из библиотеки (блок «Звук»). */
  soundId?: string
  /** Громкость 0–100 % (модуль «Громкость»). */
  volume?: number
  /** Сколько раз повторять цикл или звук (модуль «Сколько раз»). */
  times?: number
  unit?: TravelUnit
  button?: ControllerButton
  target?: { controlId: string; input: string }
  event?: ControllerEvent
  sensorType?: SensorType
  sensorPort?: string
  sensorOp?: SensorOp
  sensorDistance?: number
  sensorLight?: number
  sensorColor?: SensorColor
  sensorReflection?: number
  sensorPressed?: boolean
  sensorForce?: number
  sensorAngle?: number
  sensorTiltOp?: SensorOp
  sensorTilt?: number
  sensorAxis?: ImuAxis
  sensorModules?: SensorModule[]
}

export type SheetEditorMode = "blocks" | "pybricks"
export const MAX_PYTHON_CODE_CHARS = 20_000

export interface SheetView {
  panX: number
  panY: number
  zoom: number
}

export interface WorkspaceSheet {
  id: string
  name: string
  blocks: WorkspaceBlock[]
  view?: SheetView
  editorMode?: SheetEditorMode
  pythonCode?: string
  pythonDirty?: boolean
}

export interface SheetState {
  activeSheetId: string
  sheets: WorkspaceSheet[]
}

const PORTS: Record<HubType, readonly string[]> = HUB_PORTS

const UNITS: TravelUnit[] = ["rotations", "degrees", "seconds"]

function findChainRoot(blocks: WorkspaceBlock[], id: string): WorkspaceBlock | undefined {
  let curr = blocks.find((b) => b.id === id)
  const seen = new Set<string>()
  while (curr?.parentId && !seen.has(curr.id)) {
    seen.add(curr.id)
    curr = blocks.find((b) => b.id === curr!.parentId)
  }
  return curr
}

export function blockHeight(block: Pick<WorkspaceBlock, "type" | "height">): number {
  if (block.type === "loop") return LOOP_TOP_HEIGHT + IF_EMPTY_MOUTH + LOOP_FOOT_HEIGHT
  if (block.type === "if")
    return (
      IF_TOP_HEIGHT +
      IF_EMPTY_MOUTH +
      IF_MID_HEIGHT +
      IF_EMPTY_MOUTH +
      IF_FOOT_HEIGHT
    )
  if (block.type === "button") return 58
  if (block.type === "stop" || block.type === "sensor" || block.type === "sound") return 64
  if (block.type === "motor-buttons") return block.height ?? 132
  return block.type === "pair" || block.type === "drive" || block.type === "chassis" ? 64 : 58
}

export function ifInnerHeight(
  blocks: WorkspaceBlock[],
  id: string,
  slot: BranchSlot = "body",
  visited = new Set<string>()
): number {
  if (visited.has(id)) return IF_EMPTY_MOUTH
  const nextVisited = new Set(visited)
  nextVisited.add(id)
  const firstChild = blocks.find(
    (b) => b.parentId === id && b.branch === slot
  )
  if (!firstChild) return IF_EMPTY_MOUTH
  let span = 0
  let curr: WorkspaceBlock | undefined = firstChild
  const seen = new Set<string>()
  while (curr && !seen.has(curr.id)) {
    const currId: string = curr.id
    seen.add(currId)
    span += blockTotalHeight(blocks, currId, nextVisited) - 4
    curr = blocks.find((b) => b.parentId === currId && !b.branch)
  }
  return Math.max(48, span - 4)
}

export function blockTotalHeight(
  blocks: WorkspaceBlock[],
  id: string,
  visited = new Set<string>()
): number {
  const block = blocks.find((b) => b.id === id)
  if (!block) return 64
  if (block.type === "loop")
    return LOOP_TOP_HEIGHT + ifInnerHeight(blocks, id, "body", visited) + LOOP_FOOT_HEIGHT
  if (block.type !== "if") return blockHeight(block)
  return (
    IF_TOP_HEIGHT +
    ifInnerHeight(blocks, id, "body", visited) +
    IF_MID_HEIGHT +
    ifInnerHeight(blocks, id, "else", visited) +
    IF_FOOT_HEIGHT
  )
}

export function cleanLinks(blocks: WorkspaceBlock[]): WorkspaceBlock[] {
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const occupied = new Set<string>()
  const clean = blocks.map((b) => {
    const next: WorkspaceBlock = { ...b }
    if (next.type === "button") {
      delete next.parentId
      delete next.branch
      return next
    }
    const parent = next.parentId ? byId.get(next.parentId) : undefined
    const invalidCondition = next.branch === "condition" && !acceptsBranch(parent, "condition", next.type)
    if (next.branch && !acceptsBranch(parent, next.branch, next.type)) {
      delete next.branch
    }
    const slotKey = next.parentId
      ? `${next.parentId}:${next.branch || "next"}`
      : ""
    if (
      !next.parentId ||
      !parent ||
      next.parentId === next.id ||
      invalidCondition ||
      occupied.has(slotKey)
    ) {
      delete next.parentId
      delete next.branch
    } else {
      occupied.add(slotKey)
    }
    return next
  })

  const map = new Map(clean.map((b) => [b.id, b]))
  for (const block of clean) {
    const seen = new Set([block.id])
    let current: WorkspaceBlock | undefined = block
    while (current?.parentId) {
      if (seen.has(current.parentId)) {
        delete current.parentId
        delete current.branch
        break
      }
      seen.add(current.parentId)
      current = map.get(current.parentId)
    }
  }

  for (const block of clean) {
    const parent = block.parentId ? map.get(block.parentId) : undefined
    if (parent?.branch === "condition") {
      delete block.parentId
      delete block.branch
      continue
    }
    if (block.parentId && !ACTION_BLOCK_TYPES.includes(block.type)) {
      const root = findChainRoot(clean, block.id)
      if (root?.type === "button") {
        delete block.parentId
        delete block.branch
      }
    }
  }

  return clean
}

export function outerChainIds(blocks: WorkspaceBlock[], id: string): string[] {
  const nextChildren = new Map(
    blocks
      .filter((b) => b.parentId && !b.branch)
      .map((b) => [b.parentId as string, b.id])
  )
  const result: string[] = []
  const seen = new Set<string>()
  let current: string | undefined = id
  while (current && !seen.has(current)) {
    seen.add(current)
    result.push(current)
    current = nextChildren.get(current)
  }
  return result
}

export function chainIds(blocks: WorkspaceBlock[], id: string): string[] {
  const nextChildren = new Map(
    blocks
      .filter((b) => b.parentId && !b.branch)
      .map((b) => [b.parentId as string, b.id])
  )
  const bodyChildren = new Map(
    blocks
      .filter((b) => b.parentId && b.branch === "body")
      .map((b) => [b.parentId as string, b.id])
  )
  const elseChildren = new Map(
    blocks
      .filter((b) => b.parentId && b.branch === "else")
      .map((b) => [b.parentId as string, b.id])
  )
  const conditionChildren = new Map(
    blocks
      .filter((b) => b.parentId && b.branch === "condition")
      .map((b) => [b.parentId as string, b.id])
  )
  const result: string[] = []
  const seen = new Set<string>()
  function visit(currId: string | undefined) {
    let current = currId
    while (current && !seen.has(current)) {
      seen.add(current)
      result.push(current)
      const conditionId = conditionChildren.get(current)
      if (conditionId) visit(conditionId)
      const bodyId = bodyChildren.get(current)
      if (bodyId) visit(bodyId)
      const elseId = elseChildren.get(current)
      if (elseId) visit(elseId)
      current = nextChildren.get(current)
    }
  }
  visit(id)
  return result
}

export function executionOrder(blocks: WorkspaceBlock[]): WorkspaceBlock[] {
  const clean = cleanLinks(blocks)
  const map = new Map(clean.map((b) => [b.id, b]))
  return clean
    .filter((b) => !b.parentId)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .flatMap((root) =>
      chainIds(clean, root.id)
        .map((id) => map.get(id))
        .filter((b): b is WorkspaceBlock => Boolean(b))
    )
}

export function layoutChains(blocks: WorkspaceBlock[]): WorkspaceBlock[] {
  const map = new Map(blocks.map((b) => [b.id, { ...b }]))
  const currentList = () => Array.from(map.values())
  for (const b of executionOrder(blocks)) {
    const next = map.get(b.id)
    const parent = b.parentId ? map.get(b.parentId) : undefined
    if (next && parent) {
      if (next.branch === "condition" && isContainerType(parent.type)) {
        next.x = parent.x + conditionSlotX(parent.type)
        next.y = parent.y + 11
      } else if (next.branch === "body" && isContainerType(parent.type)) {
        next.x = parent.x + IF_INDENT
        next.y = parent.y + IF_TOP_HEIGHT - 4
      } else if (next.branch === "else" && parent.type === "if") {
        const bodyH = ifInnerHeight(currentList(), parent.id, "body")
        next.x = parent.x + IF_INDENT
        next.y = parent.y + IF_TOP_HEIGHT + bodyH + IF_MID_HEIGHT - 4
      } else {
        next.x = parent.x
        next.y = parent.y + blockTotalHeight(currentList(), parent.id) - 4
      }
    }
  }
  return blocks
    .map((b) => map.get(b.id))
    .filter((b): b is WorkspaceBlock => Boolean(b))
}

export function readBlocks(
  workspace: unknown,
  hub: HubType = "spike"
): WorkspaceBlock[] {
  const rawBlocks = (workspace as { blocks?: unknown })?.blocks
  if (!workspace || !Array.isArray(rawBlocks)) return []
  const seen = new Set<string>()
  const clean = rawBlocks
    .filter(
      (block): block is Record<string, unknown> =>
        Boolean(block) &&
        typeof block === "object" &&
        LIBRARY_BLOCK_TYPES.has(String((block as { type?: unknown }).type) as BlockType) &&
        typeof (block as { id?: unknown }).id === "string" &&
        Number.isFinite((block as { x?: unknown }).x) &&
        Number.isFinite((block as { y?: unknown }).y)
    )
    .filter((block) => {
      const id = String(block.id)
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
    .slice(0, MAX_BLOCKS)
    .map((block): WorkspaceBlock => {
      const type = block.type as BlockType
      const branchVal =
        block.branch === "body" || block.branch === "else" || block.branch === "condition"
          ? (block.branch as BranchSlot)
          : undefined
      const base: WorkspaceBlock = {
        id: String(block.id),
        type,
        x: Math.round(Number(block.x)),
        y: Math.round(Number(block.y)),
        ...(typeof block.parentId === "string" ? { parentId: block.parentId } : {}),
        ...(typeof block.controlAreaId === "string" ? { controlAreaId: block.controlAreaId } : {}),
        ...(branchVal ? { branch: branchVal } : {}),
      }
      if (type === "start" || type === "if") return base

      if (type === "loop") {
        const times = Number(block.times)
        return {
          ...base,
          modules: normalizeModules("loop", block.modules) as MotorModule[],
          times:
            Number.isFinite(times) && times >= 1
              ? Math.min(MAX_LOOP_TIMES, Math.round(times))
              : DEFAULT_LOOP_TIMES,
        }
      }

      if (type === "sound") {
        const times = Number(block.times)
        const volume = Number(block.volume)
        return {
          ...base,
          modules: normalizeModules("sound", block.modules) as MotorModule[],
          soundId:
            findSoundPreset(String(block.soundId))
              ? String(block.soundId)
              : DEFAULT_SOUND_ID,
          volume: Number.isFinite(volume) ? Math.max(0, Math.min(100, Math.round(volume))) : DEFAULT_SOUND_VOLUME,
          times:
            Number.isFinite(times) && times >= 1
              ? Math.min(MAX_LOOP_TIMES, Math.round(times))
              : DEFAULT_LOOP_TIMES,
        }
      }

      if (type === "sensor") {
        const sensorType: SensorType = (SENSOR_TYPES as readonly string[]).includes(String(block.sensorType))
          ? (block.sensorType as SensorType)
          : "ultrasonic"
        const isImu = sensorType === "imu"
        const sensorPort = isImu
          ? "IMU"
          : (SENSOR_PORTS as readonly string[]).includes(String(block.sensorPort))
            ? String(block.sensorPort)
            : "C"
        const sensorOp: SensorOp = block.sensorOp === "gt" ? "gt" : "lt"
        const sensorDistance = Number.isFinite(block.sensorDistance)
          ? Math.max(1, Math.min(200, Math.round(Number(block.sensorDistance))))
          : DEFAULT_SENSOR_DISTANCE
        const sensorLight = Number.isFinite(block.sensorLight)
          ? Number(block.sensorLight) < 0
            ? -1
            : Math.max(0, Math.min(100, Math.round(Number(block.sensorLight))))
          : DEFAULT_SENSOR_LIGHT
        const sensorColor: SensorColor = (SENSOR_COLORS as readonly string[]).includes(String(block.sensorColor))
          ? (block.sensorColor as SensorColor)
          : DEFAULT_SENSOR_COLOR
        const sensorReflection = Number.isFinite(block.sensorReflection)
          ? Math.max(0, Math.min(100, Math.round(Number(block.sensorReflection))))
          : DEFAULT_SENSOR_REFLECTION
        const sensorPressed = typeof block.sensorPressed === "boolean" ? block.sensorPressed : true
        const sensorForce = Number.isFinite(block.sensorForce)
          ? Math.max(0, Math.min(10, Math.round(Number(block.sensorForce) * 10) / 10))
          : DEFAULT_SENSOR_FORCE
        const sensorAngle = Number.isFinite(block.sensorAngle)
          ? Math.max(-360, Math.min(360, Math.round(Number(block.sensorAngle))))
          : DEFAULT_SENSOR_ANGLE
        const sensorTiltOp: SensorOp = block.sensorTiltOp === "gt" ? "gt" : "lt"
        const sensorTilt = Number.isFinite(block.sensorTilt)
          ? Math.max(-90, Math.min(90, Math.round(Number(block.sensorTilt))))
          : DEFAULT_SENSOR_TILT
        const sensorAxis: ImuAxis = (IMU_AXES as readonly string[]).includes(String(block.sensorAxis))
          ? (block.sensorAxis as ImuAxis)
          : DEFAULT_SENSOR_AXIS
        const allowedMods = SENSOR_MODULES_BY_TYPE[sensorType]
        const rawMods = Array.isArray(block.sensorModules)
          ? ([...new Set(block.sensorModules.filter((m): m is SensorModule => (allowedMods as readonly string[]).includes(String(m))))] as SensorModule[])
          : ([DEFAULT_SENSOR_MODULE[sensorType]] as SensorModule[])
        const filteredMods = base.branch === "condition" && isImu
          ? rawMods.filter(m => m !== "reset")
          : rawMods
        const sensorModules: SensorModule[] = filteredMods.length > 0
          ? filteredMods
          : [DEFAULT_SENSOR_MODULE[sensorType]]
        return {
          ...base,
          sensorType,
          sensorPort,
          sensorOp,
          sensorDistance,
          sensorLight,
          sensorColor,
          sensorReflection,
          sensorPressed,
          sensorForce,
          sensorAngle,
          sensorTiltOp,
          sensorTilt,
          sensorAxis,
          sensorModules,
        }
      }

      if (type === "motor-buttons") {
        const allowed: MotorButtonModule[] = ["red", "green", "yellow"]
        const allowedButtons: MotorPanelButton[] = ["blue", ...allowed]
        const controlModules = Array.isArray(block.controlModules)
          ? allowed.filter(color => (block.controlModules as unknown[]).includes(color))
          : []
        const hiddenControlButtons = Array.isArray(block.hiddenControlButtons)
          ? allowedButtons.filter(color => (block.hiddenControlButtons as unknown[]).includes(color))
          : []
        return {
          ...base,
          width: Number.isFinite(block.width) ? Math.min(420, Math.max(144, Math.round(Number(block.width)))) : 180,
          height: Number.isFinite(block.height) ? Math.min(320, Math.max(112, Math.round(Number(block.height)))) : 132,
          controlModules,
          hiddenControlButtons,
        }
      }

      if (type === "button") {
        const allowedButtons: ControllerButton[] = [
          "up",
          "down",
          "left",
          "right",
          "a",
          "b",
          "x",
          "y",
          "l",
          "r",
          "blue",
          "red",
          "green",
          "yellow",
        ]
        const btn = allowedButtons.includes(block.button as ControllerButton)
          ? (block.button as ControllerButton)
          : "up"
        const ev: ControllerEvent =
          block.event === "hold" ? "hold" : block.event === "released" ? "released" : "pressed"
        return {
          ...base,
          button: btn,
          ...(block.target && typeof block.target === "object" && typeof (block.target as {controlId?:unknown}).controlId === "string" && typeof (block.target as {input?:unknown}).input === "string" ? {target: {controlId: (block.target as {controlId:string}).controlId, input: (block.target as {input:string}).input}} : {}),
          event: ev,
        }
      }

      if (type === "stop") {
        if (block.stopAll === true) {
          return {
            ...base,
            stopAll: true,
            motor: PORTS[hub]?.includes(String(block.motor)) ? String(block.motor) : "A",
          }
        }
        if (Array.isArray(block.motors) && block.motors.length > 0) {
          const valid = block.motors
            .map(String)
            .filter((p) => PORTS[hub]?.includes(p))
          const motors = valid.length ? valid : ["A"]
          return {
            ...base,
            motor: motors[0],
            ...(motors[1] ? { motor2: motors[1] } : {}),
            motors,
          }
        }
        const motor = PORTS[hub]?.includes(String(block.motor))
          ? String(block.motor)
          : "A"
        const motor2 =
          block.motor2 &&
          PORTS[hub]?.includes(String(block.motor2)) &&
          block.motor2 !== motor
            ? String(block.motor2)
            : undefined
        return {
          ...base,
          motor,
          ...(motor2 ? { motor2 } : {}),
        }
      }

      if (type === "chassis") {
        const chassisDirection = CHASSIS_DIRECTIONS.includes(block.chassisDirection as ChassisDirection)
          ? (block.chassisDirection as ChassisDirection)
          : "forward"
        const rawModules = normalizeModules("chassis", block.modules) as MotorModule[]
        return {
          ...base,
          chassisDirection,
          modules: rawModules,
          speed:
            Number.isFinite(block.speed) &&
            Number(block.speed) > 0 &&
            Number(block.speed) <= 1000
              ? Number(block.speed)
              : MOTOR_SPEED,
          value:
            Number.isFinite(block.value) &&
            Number(block.value) > 0 &&
            Number(block.value) <= 10000
              ? Number(block.value)
              : 1,
          unit: UNITS.includes(block.unit as TravelUnit)
            ? (block.unit as TravelUnit)
            : "rotations",
        }
      }

      const rawModules = normalizeModules(type, block.modules) as MotorModule[]

      const paired = type === "pair" || (type === "drive" && rawModules.includes("pair"))
      const defaultMotor2 = base.motor === "B" ? "A" : "B"
      return {
        ...base,
        ...(paired
          ? {
              motor2: PORTS[hub]?.includes(String(block.motor2))
                ? String(block.motor2)
                : defaultMotor2,
              direction2:
                block.direction2 === "backward" ? "backward" : "forward",
            }
          : {}),
        modules: rawModules,
        speed:
          Number.isFinite(block.speed) &&
          Number(block.speed) > 0 &&
          Number(block.speed) <= 1000
            ? Number(block.speed)
            : MOTOR_SPEED,
        power:
          Number.isFinite(block.power) &&
          Number(block.power) > 0 &&
          Number(block.power) <= 100
            ? Number(block.power)
            : 50,
        motor: PORTS[hub]?.includes(String(block.motor))
          ? String(block.motor)
          : "A",
        direction: block.direction === "backward" ? "backward" : "forward",
        value:
          Number.isFinite(block.value) &&
          Number(block.value) > 0 &&
          Number(block.value) <= 10000
            ? Number(block.value)
            : 1,
        unit: UNITS.includes(block.unit as TravelUnit)
          ? (block.unit as TravelUnit)
          : "rotations",
      }
    })
  return layoutChains(cleanLinks(clean))
}

export function addBlock(
  blocks: WorkspaceBlock[],
  id: string,
  x: number,
  y: number,
  type: BlockType = "start"
): WorkspaceBlock[] {
  if (blocks.length >= MAX_BLOCKS)
    throw new Error("На доске слишком много блоков.")
  if (!Number.isFinite(x) || !Number.isFinite(y))
    throw new Error("Не удалось определить место блока.")
  if (!LIBRARY_BLOCK_TYPES.has(type))
    throw new Error("Неизвестный блок.")
  const block: WorkspaceBlock = {
    id,
    type,
    x: Math.round(x),
    y: Math.round(y),
  }
  if (type === "drive" || type === "pair") {
    Object.assign(block, {
      motor: "A",
      direction: "forward",
      modules: [],
      speed: MOTOR_SPEED,
      power: 50,
      value: 1,
      unit: "rotations",
    })
  }
  if (type === "pair") {
    Object.assign(block, { motor2: "B", direction2: "backward" })
  }
  if (type === "button") {
    Object.assign(block, { button: "up", event: "hold" })
  }
  if (type === "stop") {
    Object.assign(block, { motor: "A", motors: ["A"] })
  }
  if (type === "chassis") {
    Object.assign(block, { chassisDirection: "forward", modules: [], speed: MOTOR_SPEED, value: 1, unit: "rotations" })
  }
  if (type === "loop") {
    Object.assign(block, { modules: [], times: DEFAULT_LOOP_TIMES })
  }
  if (type === "sound") {
    Object.assign(block, { modules: [], soundId: DEFAULT_SOUND_ID, volume: DEFAULT_SOUND_VOLUME, times: DEFAULT_LOOP_TIMES })
  }
  if (type === "motor-buttons") {
    Object.assign(block, { width: 180, height: 132, controlModules: [], hiddenControlButtons: [] })
  }
  if (type === "sensor") {
    Object.assign(block, {
      sensorType: "ultrasonic",
      sensorPort: "C",
      sensorOp: "lt",
      sensorDistance: DEFAULT_SENSOR_DISTANCE,
      sensorLight: DEFAULT_SENSOR_LIGHT,
      sensorColor: DEFAULT_SENSOR_COLOR,
      sensorReflection: DEFAULT_SENSOR_REFLECTION,
      sensorPressed: true,
      sensorForce: DEFAULT_SENSOR_FORCE,
      sensorAngle: DEFAULT_SENSOR_ANGLE,
      sensorTiltOp: "lt",
      sensorTilt: DEFAULT_SENSOR_TILT,
      sensorAxis: DEFAULT_SENSOR_AXIS,
      sensorModules: ["threshold"],
    })
  }
  return [...blocks, block]
}

export function moveBlock(
  blocks: WorkspaceBlock[],
  id: string,
  x: number,
  y: number
): WorkspaceBlock[] {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return blocks
  return blocks.map((block) =>
    block.id === id
      ? { ...block, x: Math.round(x), y: Math.round(y) }
      : block
  )
}

export function removeBlock(
  blocks: WorkspaceBlock[],
  id: string
): WorkspaceBlock[] {
  const removed = blocks.find((block) => block.id === id)
  return layoutChains(
    blocks
      .filter((block) => block.id !== id)
      .map((block) => {
        if (block.parentId !== id) return block
        const next: WorkspaceBlock = { ...block }
        const wasBranch = Boolean(next.branch)
        delete next.parentId
        delete next.branch
        if (!wasBranch && removed?.parentId) {
          next.parentId = removed.parentId
          if (removed.branch) next.branch = removed.branch
        }
        return next
      })
  )
}

export function updateDrive(
  blocks: WorkspaceBlock[],
  id: string,
  changes: Partial<WorkspaceBlock>,
  hub: HubType
): WorkspaceBlock[] {
  // Без модуля «Пока» датчик в овале цикла не нужен: выносим его рядом, а не теряем.
  const loop = blocks.find((b) => b.id === id && b.type === "loop")
  const loseCondition =
    Boolean(loop?.modules?.includes("while")) &&
    Array.isArray(changes.modules) &&
    !changes.modules.includes("while")
  const source = loseCondition && loop
    ? blocks.map((b) => {
        if (b.parentId !== id || b.branch !== "condition") return b
        const evicted: WorkspaceBlock = { ...b, x: loop.x + 280, y: loop.y }
        delete evicted.parentId
        delete evicted.branch
        return evicted
      })
    : blocks
  return readBlocks(
    {
      blocks: source.map((block) => {
        if (block.id !== id || !["drive", "pair", "chassis", "if", "loop", "button", "stop", "sensor", "sound"].includes(block.type)) return block
        const merged: WorkspaceBlock = { ...block, ...changes }
        if (block.type === "pair" && changes.type === "drive") {
          merged.type = "drive"
        } else {
          merged.type = block.type
        }
        if (merged.type === "drive" || merged.type === "pair") {
          const nextModules = Array.isArray(merged.modules) ? merged.modules : []
          const wasPaired = isPairedBlock(block)
          const nowPaired = merged.type === "pair" || nextModules.includes("pair")
          if (nowPaired) {
            if (!wasPaired) {
              const primary = merged.motor || "A"
              if (!changes.motor2) merged.motor2 = primary === "B" ? "A" : "B"
              if (!changes.direction2) merged.direction2 = "backward"
            }
          } else {
            delete merged.motor2
            delete merged.direction2
          }
        }
        if (block.type === "sensor" && changes.sensorType !== undefined) {
          const prevType = block.sensorType || "ultrasonic"
          const nextType: SensorType = (SENSOR_TYPES as readonly string[]).includes(String(changes.sensorType))
            ? (changes.sensorType as SensorType)
            : "ultrasonic"
          if (nextType !== prevType) {
            if (changes.sensorModules === undefined) {
              merged.sensorModules = [DEFAULT_SENSOR_MODULE[nextType]]
            }
            if (nextType === "imu") {
              merged.sensorPort = "IMU"
            } else if (prevType === "imu" || merged.sensorPort === "IMU") {
              merged.sensorPort = "C"
            }
          }
        }
        if (block.type === "stop") {
          if (changes.stopAll === true) {
            delete merged.motors
            delete merged.motor2
          } else if (changes.motors) {
            delete merged.stopAll
            merged.motor = changes.motors[0] || merged.motor || "A"
            if (changes.motors[1]) merged.motor2 = changes.motors[1]
            else delete merged.motor2
          } else if ("motor" in changes || "motor2" in changes) {
            delete merged.stopAll
            delete merged.motors
          }
        }
        return merged
      }),
    },
    hub
  )
}

export function detachChain(
  blocks: WorkspaceBlock[],
  id: string
): WorkspaceBlock[] {
  return blocks.map((b) => {
    if (b.id !== id) return b
    const next: WorkspaceBlock = { ...b }
    delete next.parentId
    delete next.branch
    return next
  })
}

export function moveChain(
  blocks: WorkspaceBlock[],
  id: string,
  x: number,
  y: number
): WorkspaceBlock[] {
  const root = blocks.find((b) => b.id === id)
  if (!root || !Number.isFinite(x) || !Number.isFinite(y)) return blocks
  const moving = new Set(chainIds(blocks, id))
  const dx = Math.round(x) - root.x
  const dy = Math.round(y) - root.y
  return layoutChains(
    detachChain(blocks, id).map((b) =>
      moving.has(b.id) ? { ...b, x: b.x + dx, y: b.y + dy } : b
    )
  )
}

export function attachChain(
  blocks: WorkspaceBlock[],
  id: string,
  parentId: string,
  branch?: BranchSlot
): WorkspaceBlock[] {
  const movingBlock = blocks.find((b) => b.id === id)
  if (movingBlock?.type === "button") return blocks

  const moving = chainIds(blocks, id)
  const parent = blocks.find((b) => b.id === parentId)
  if (
    !blocks.some((b) => b.id === id) ||
    !parent ||
    moving.includes(parentId)
  ) {
    return blocks
  }
  const rootOfParent = findChainRoot(blocks, parentId)
  if (rootOfParent?.type === "button") {
    if (movingBlock && !ACTION_BLOCK_TYPES.includes(movingBlock.type)) {
      return blocks
    }
  }

  if (parent.branch === "condition") return blocks
  const effectiveBranch = acceptsBranch(parent, branch, movingBlock?.type) ? branch : undefined
  const outerMoving = outerChainIds(blocks, id)
  const tail = outerMoving[outerMoving.length - 1]
  const detached = detachChain(blocks, id)
  const previousChild = detached.find(
    (b) =>
      b.parentId === parentId &&
      (effectiveBranch ? b.branch === effectiveBranch : !b.branch)
  )
  return layoutChains(
    detached.map((b) => {
      if (b.id === id) {
        const nextBlock: WorkspaceBlock = {
          ...b,
          parentId,
          ...(effectiveBranch ? { branch: effectiveBranch } : {}),
        }
        if (effectiveBranch === "condition" && nextBlock.type === "sensor" && nextBlock.sensorType === "imu") {
          const nextMods = (nextBlock.sensorModules || []).filter(m => m !== "reset")
          nextBlock.sensorModules = nextMods.length ? nextMods : ["heading"]
        }
        return nextBlock
      }
      if (effectiveBranch === "condition" && b.parentId === id && !b.branch) {
        const nextChild: WorkspaceBlock = { ...b, x: parent.x, y: parent.y + blockTotalHeight(detached, parent.id) + 12 }
        delete nextChild.parentId
        delete nextChild.branch
        return nextChild
      }
      if (previousChild && b.id === previousChild.id) {
        if (effectiveBranch === "condition") {
          const evicted: WorkspaceBlock = { ...b, x: parent.x + 280, y: parent.y }
          delete evicted.parentId
          delete evicted.branch
          return evicted
        }
        const reattached: WorkspaceBlock = { ...b, parentId: tail }
        delete reattached.branch
        return reattached
      }
      return b
    })
  )
}

export function snapTargetInfo(
  blocks: WorkspaceBlock[],
  id: string,
  x: number,
  y: number,
  threshold = 48,
  movingType?: BlockType
): { id: string; branch?: BranchSlot } | null {
  const movingBlock = blocks.find((b) => b.id === id)
  const resolvedType = movingBlock?.type ?? movingType
  if (resolvedType === "button" || resolvedType === "motor-buttons") return null

  const moving = new Set(chainIds(blocks, id))
  let best: { id: string; branch?: BranchSlot } | null = null
  let distance = Infinity
  for (const b of blocks) {
    if (b.type === "motor-buttons") continue
    if (moving.has(b.id)) continue

    const rootOfB = findChainRoot(blocks, b.id)
    if (rootOfB?.type === "button") {
      if (resolvedType && !ACTION_BLOCK_TYPES.includes(resolvedType)) {
        continue
      }
    }

    if (isContainerType(b.type)) {
      if (resolvedType === "sensor" && acceptsBranch(b, "condition", "sensor")) {
        const condThreshold = Math.max(threshold, 56)
        const condDx = Math.abs(b.x + conditionSlotX(b.type) - x)
        const condDy = Math.abs(b.y + 11 - y)
        if (
          condDx <= condThreshold &&
          condDy <= condThreshold &&
          condDx + condDy < distance
        ) {
          best = { id: b.id, branch: "condition" }
          distance = condDx + condDy
        }
      }
      const innerDx = Math.abs(b.x + IF_INDENT - x)
      const bodyDy = Math.abs(b.y + IF_TOP_HEIGHT - 4 - y)
      if (
        innerDx <= threshold &&
        bodyDy <= threshold &&
        innerDx + bodyDy < distance
      ) {
        best = { id: b.id, branch: "body" }
        distance = innerDx + bodyDy
      }
      const bodyH = ifInnerHeight(blocks, b.id, "body")
      const elseDy = Math.abs(
        b.y + IF_TOP_HEIGHT + bodyH + IF_MID_HEIGHT - 4 - y
      )
      if (
        b.type === "if" &&
        innerDx <= threshold &&
        elseDy <= threshold &&
        innerDx + elseDy < distance
      ) {
        best = { id: b.id, branch: "else" }
        distance = innerDx + elseDy
      }
    }
    if (b.branch === "condition") continue
    const dx = Math.abs(b.x - x)
    const dy = Math.abs(b.y + blockTotalHeight(blocks, b.id) - 4 - y)
    if (dx <= threshold && dy <= threshold && dx + dy < distance) {
      best = { id: b.id }
      distance = dx + dy
    }
  }
  return best
}

export function snapTarget(
  blocks: WorkspaceBlock[],
  id: string,
  x: number,
  y: number,
  threshold = 48
): string | null {
  return snapTargetInfo(blocks, id, x, y, threshold)?.id ?? null
}

export function generatePybricks(
  blocks: WorkspaceBlock[],
  hub: HubType,
  chassis?: DriveSettings,
  options?: { comments?: boolean }
): string {
  if (!PORTS[hub]) throw new Error("Неизвестный тип робота.")
  const clean = readBlocks({ blocks }, hub)
  const autonomousBlocks = clean.filter(
    (b) => findChainRoot(clean, b.id)?.type !== "button"
  )
  const ordered = executionOrder(autonomousBlocks)
  const driveBlocks = ordered.filter((block) =>
    ACTION_BLOCK_TYPES.includes(block.type)
  )
  if (!driveBlocks.length) {
    const hasButtonActions = clean.some(block =>
      ACTION_BLOCK_TYPES.includes(block.type) && findChainRoot(clean, block.id)?.type === "button"
    )
    if (hasButtonActions) {
      if (hub !== "spike") throw new Error("Экранный пульт через Bluetooth доступен для SPIKE Prime.")
      return "# Экранный пульт TLC. После загрузки отключите Pybricks Code, откройте этот проект в редакторе и запустите пульт через Bluetooth.\n" + HUB_PROGRAM_SOURCE
    }
    throw new Error("Добавьте на доску блок движения.")
  }

  const resolvedChassis = isDriveSettings(chassis) ? chassis : DEFAULT_DRIVE_SETTINGS
  const explicitPorts = new Set<string>()
  const explicitSensors = new Map<string, SensorType>()
  let usesImu = false
  let usesColorEnum = false
  const recordSensor = (b: WorkspaceBlock) => {
    const st: SensorType = b.sensorType || "ultrasonic"
    if (st === "imu") {
      usesImu = true
      return
    }
    const p = b.sensorPort || "C"
    explicitSensors.set(p, st)
    if (st === "color" && (b.sensorModules || ["color"]).includes("color")) {
      usesColorEnum = true
    }
  }
  let hasStopAll = false
  let usesSound = false
  for (const block of driveBlocks) {
    if (block.type === "sound") {
      // Динамик хаба не занимает портов.
      usesSound = true
    } else if (block.type === "sensor") {
      recordSensor(block)
    } else if (isPairedBlock(block)) {
      explicitPorts.add(block.motor || "A")
      explicitPorts.add(block.motor2 || "B")
    } else if (block.type === "chassis") {
      explicitPorts.add(resolvedChassis.leftPort)
      explicitPorts.add(resolvedChassis.rightPort)
    } else if (block.type === "stop") {
      if (block.stopAll) hasStopAll = true
      else for (const port of getStopPorts(block, hub).ports) explicitPorts.add(port)
    } else {
      explicitPorts.add(block.motor || "A")
    }
  }
  for (const cond of clean.filter(b => b.type === "sensor" && b.branch === "condition")) {
    recordSensor(cond)
  }
  if (hasStopAll && explicitPorts.size === 0) {
    explicitPorts.add(resolvedChassis.leftPort)
    explicitPorts.add(resolvedChassis.rightPort)
  }
  const used = [...explicitPorts].sort()
  const usedSensors = [...explicitSensors.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const sensorClassMap: Record<Exclude<SensorType, "imu">, string> = {
    ultrasonic: "UltrasonicSensor",
    color: "ColorSensor",
    force: "ForceSensor",
  }
  const sensorImports = [...new Set(usedSensors.map(([, st]) => st === "imu" ? "" : sensorClassMap[st]).filter(Boolean))]
  const imports = [
    ...(used.length > 0 ? ["Motor"] : []),
    ...sensorImports,
  ]
  const paramImports = [...(usesColorEnum ? ["Color"] : []), "Port", "Stop"]

  const lines = [
    "# Brick Studio: команды выполняются сверху вниз",
    ...(usesImu || (usesSound && hub === "spike") ? ["from pybricks.hubs import PrimeHub"] : []),
    `from pybricks.${
      hub === "spike" ? "pupdevices" : "ev3devices"
    } import ${imports.join(", ") || "Motor"}`,
    `from pybricks.parameters import ${paramImports.join(", ")}`,
    "from pybricks.tools import wait",
    "",
    ...(usesImu || (usesSound && hub === "spike") ? ["hub = PrimeHub()"] : []),
    ...used.map(
      (port) => `motor_${port.toLowerCase()} = Motor(Port.${port})`
    ),
    ...usedSensors.map(
      ([port, st]) => `sensor_${port.toLowerCase()} = ${st === "imu" ? "UltrasonicSensor" : sensorClassMap[st]}(Port.${port})`
    ),
    "",
    ...(usesSound && hub === "spike"
      ? [
          "def play_sound(notes, volume, times):",
          "    hub.speaker.volume(volume)",
          "    for _ in range(times):",
          "        for frequency, ms in notes:",
          "            if frequency:",
          "                hub.speaker.beep(frequency, ms)",
          "            else:",
          "                wait(ms)",
          "",
        ]
      : []),
  ]

  function emitBlock(block: WorkspaceBlock, indent: string) {
    if (block.type === "start" || block.type === "button") return
    if (block.type === "sound") {
      if (hub !== "spike") {
        lines.push(`${indent}pass  # Звук пока играет только на SPIKE Prime`)
        return
      }
      const mods = block.modules || []
      const soundId = block.soundId || DEFAULT_SOUND_ID
      const volume = mods.includes("volume") ? block.volume ?? DEFAULT_SOUND_VOLUME : DEFAULT_SOUND_VOLUME
      const times = mods.includes("times") ? block.times || DEFAULT_LOOP_TIMES : 1
      const notes = soundSteps(soundId).map((step) => `(${step.freq}, ${step.ms})`).join(", ")
      // В автономной программе звук всегда доигрывает до конца.
      if (options?.comments) lines.push(`${indent}# Звук «${findSoundPreset(soundId)?.name}»`)
      lines.push(`${indent}play_sound((${notes},), ${volume}, ${times})`)
      return
    }
    if (block.type === "stop") {
      const stopPorts = block.stopAll
        ? used
        : [...new Set(getStopPorts(block, hub).ports)]
      if (options?.comments && stopPorts.length > 0) {
        lines.push(`${indent}# Остановить ${block.stopAll ? "все моторы" : "мотор " + stopPorts.join(", ")}`)
      }
      for (const port of stopPorts) {
        lines.push(`${indent}motor_${port.toLowerCase()}.brake()`)
      }
      return
    }
    const branchChain = (parentId: string, branch: BranchSlot): WorkspaceBlock[] => {
      const first = clean.find((b) => b.parentId === parentId && b.branch === branch)
      return first
        ? outerChainIds(clean, first.id)
            .map((id) => clean.find((b) => b.id === id))
            .filter((b): b is WorkspaceBlock => b !== undefined && b.type !== "start")
        : []
    }
    const sensorExprs = (s: WorkspaceBlock): string[] => {
      const st: SensorType = s.sensorType || "ultrasonic"
      const p = (s.sensorPort || "C").toLowerCase()
      const mods = s.sensorModules || [DEFAULT_SENSOR_MODULE[st]]
      const exprs: string[] = []
      if (st === "ultrasonic" && mods.includes("threshold")) {
        const op = s.sensorOp === "gt" ? ">" : "<"
        const mm = (s.sensorDistance ?? DEFAULT_SENSOR_DISTANCE) * 10
        exprs.push(`sensor_${p}.distance() ${op} ${mm}`)
      } else if (st === "color") {
        if (mods.includes("color")) {
          const col = (s.sensorColor || DEFAULT_SENSOR_COLOR).toUpperCase()
          exprs.push(`sensor_${p}.color() == Color.${col}`)
        }
        if (mods.includes("reflection")) {
          const op = s.sensorOp === "gt" ? ">" : "<"
          const refl = s.sensorReflection ?? DEFAULT_SENSOR_REFLECTION
          exprs.push(`sensor_${p}.reflection() ${op} ${refl}`)
        }
      } else if (st === "force") {
        if (mods.includes("pressed")) {
          exprs.push(s.sensorPressed === false ? `not sensor_${p}.pressed()` : `sensor_${p}.pressed()`)
        }
        if (mods.includes("force")) {
          const op = s.sensorOp === "gt" ? ">" : "<"
          const f = s.sensorForce ?? DEFAULT_SENSOR_FORCE
          exprs.push(`sensor_${p}.force() ${op} ${f}`)
        }
      } else if (st === "imu") {
        if (mods.includes("heading")) {
          const op = s.sensorOp === "gt" ? ">" : "<"
          const deg = s.sensorAngle ?? DEFAULT_SENSOR_ANGLE
          exprs.push(`hub.imu.heading() ${op} ${deg}`)
        }
        if (mods.includes("tilt")) {
          const idx = s.sensorAxis === "roll" ? 1 : 0
          const op = (s.sensorTiltOp ?? s.sensorOp) === "gt" ? ">" : "<"
          const deg = s.sensorTilt ?? DEFAULT_SENSOR_TILT
          exprs.push(`hub.imu.tilt()[${idx}] ${op} ${deg}`)
        }
      }
      return exprs
    }

    if (block.type === "chassis") {
      const dir = block.chassisDirection || "forward"
      if (options?.comments) {
        const dirText = dir === "backward" ? "назад" : dir === "left" ? "налево" : dir === "right" ? "направо" : "вперёд"
        lines.push(`${indent}# Шасси: ехать ${dirText}`)
      }
      const [lMul, rMul] = WHEEL_DIRECTIONS[dir] || WHEEL_DIRECTIONS.forward
      const spd = block.modules?.includes("speed")
        ? block.speed || MOTOR_SPEED
        : resolvedChassis.speed || MOTOR_SPEED
      const leftSpeed = lMul * spd * (resolvedChassis.leftReversed ? -1 : 1)
      const rightSpeed = rMul * spd * (resolvedChassis.rightReversed ? -1 : 1)
      const lp = resolvedChassis.leftPort.toLowerCase()
      const rp = resolvedChassis.rightPort.toLowerCase()
      if (!block.modules?.includes("travel")) {
        lines.push(
          `${indent}motor_${lp}.run(${leftSpeed})`,
          `${indent}motor_${rp}.run(${rightSpeed})`
        )
      } else if (block.unit === "seconds") {
        const ms = Math.max(10, Math.min(600000, Math.round((block.value ?? 1) * 1000)))
        lines.push(
          `${indent}motor_${lp}.run_time(${leftSpeed}, ${ms}, then=Stop.BRAKE, wait=False)`,
          `${indent}motor_${rp}.run_time(${rightSpeed}, ${ms}, then=Stop.BRAKE, wait=False)`,
          `${indent}wait(${ms})`
        )
      } else {
        const deg = Math.max(1, Math.round((block.value ?? 1) * (block.unit === "rotations" ? 360 : 1)))
        const waitMs = Math.round((deg / Math.max(1, spd)) * 1000) + 150
        lines.push(
          `${indent}motor_${lp}.run_angle(${leftSpeed}, ${deg}, then=Stop.BRAKE, wait=False)`,
          `${indent}motor_${rp}.run_angle(${rightSpeed}, ${deg}, then=Stop.BRAKE, wait=False)`,
          `${indent}wait(${waitMs})`
        )
      }
      return
    }
    if (block.type === "sensor") {
      const st: SensorType = block.sensorType || "ultrasonic"
      if (options?.comments) lines.push(`${indent}# Датчик: ждём срабатывания`)
      const p = (block.sensorPort || "C").toLowerCase()
      const mods = block.sensorModules || [DEFAULT_SENSOR_MODULE[st]]
      if ((st === "ultrasonic" || st === "color") && mods.includes("lights")) {
        const light = block.sensorLight ?? DEFAULT_SENSOR_LIGHT
        lines.push(`${indent}sensor_${p}.lights.${light < 0 ? "off()" : `on(${light})`}`)
      }
      if (st === "imu" && mods.includes("reset")) {
        lines.push(`${indent}hub.imu.reset_heading(0)`)
      }
      const exprs = sensorExprs(block)
      if (exprs.length > 0) {
        lines.push(
          `${indent}while not (${exprs.join(" and ")}):`,
          `${indent}    wait(10)`
        )
      }
      return
    }
    if (block.type === "loop") {
      const mods = block.modules || []
      if (options?.comments) {
        lines.push(
          `${indent}# Цикл: ${
            mods.includes("while") ? "пока условие верно" : mods.includes("times") ? "повторить заданное число раз" : "повторять всегда"
          }`
        )
      }
      let endless = true
      if (mods.includes("while")) {
        const cond = clean.find((b) => b.parentId === block.id && b.branch === "condition")
        const condExprs = cond && cond.type === "sensor" ? sensorExprs(cond) : []
        if (!cond || condExprs.length === 0)
          throw new Error("Вставьте датчик в цикл «Пока».")
        const st: SensorType = cond.sensorType || "ultrasonic"
        const p = (cond.sensorPort || "C").toLowerCase()
        const condMods = cond.sensorModules || [DEFAULT_SENSOR_MODULE[st]]
        if ((st === "ultrasonic" || st === "color") && condMods.includes("lights")) {
          const light = cond.sensorLight ?? DEFAULT_SENSOR_LIGHT
          lines.push(`${indent}sensor_${p}.lights.${light < 0 ? "off()" : `on(${light})`}`)
        }
        lines.push(`${indent}while ${condExprs.join(" and ")}:`)
      } else if (mods.includes("times")) {
        endless = false
        const count = Math.max(1, Math.min(MAX_LOOP_TIMES, Math.round(Number(block.times) || DEFAULT_LOOP_TIMES)))
        lines.push(`${indent}for _ in range(${count}):`)
      } else {
        lines.push(`${indent}while True:`)
      }
      const bodyChain = branchChain(block.id, "body")
      for (const inner of bodyChain) emitBlock(inner, `${indent}    `)
      // Короткая пауза не даёт пустому или быстрому телу цикла занять хаб целиком.
      if (endless || !bodyChain.length) lines.push(`${indent}    wait(10)`)
      return
    }
    if (block.type === "if") {
      const cond = clean.find(
        (b) => b.parentId === block.id && b.branch === "condition"
      )
      const condExprs = cond && cond.type === "sensor" ? sensorExprs(cond) : []
      if (options?.comments) lines.push(`${indent}# Проверка условия датчика`)
      if (cond && cond.type === "sensor" && condExprs.length > 0) {
        const st: SensorType = cond.sensorType || "ultrasonic"
        const p = (cond.sensorPort || "C").toLowerCase()
        const condMods = cond.sensorModules || [DEFAULT_SENSOR_MODULE[st]]
        if ((st === "ultrasonic" || st === "color") && condMods.includes("lights")) {
          const light = cond.sensorLight ?? DEFAULT_SENSOR_LIGHT
          lines.push(`${indent}sensor_${p}.lights.${light < 0 ? "off()" : `on(${light})`}`)
        }
        lines.push(`${indent}if ${condExprs.join(" and ")}:`)
      } else {
        lines.push(`${indent}if True:`)
      }
      const bodyChain = branchChain(block.id, "body")
      if (!bodyChain.length) {
        lines.push(`${indent}    pass`)
      } else {
        for (const inner of bodyChain) {
          emitBlock(inner, `${indent}    `)
        }
      }

      lines.push(`${indent}else:`)
      const elseChain = branchChain(block.id, "else")
      if (!elseChain.length) {
        lines.push(`${indent}    pass`)
      } else {
        for (const inner of elseChain) {
          emitBlock(inner, `${indent}    `)
        }
      }
      return
    }

    const modules = block.modules || []
    const [problem] = validateModuleRules(block.type, block, { target: "export" })
    if (problem) throw new Error(problem.message)
    const powered = modules.includes("power")
    const speed = modules.includes("speed")
      ? block.speed || MOTOR_SPEED
      : MOTOR_SPEED
    const power = block.power || 50
    const value = block.value || 1
    const sign = block.direction === "backward" ? -1 : 1
    const motor = `motor_${(block.motor || "A").toLowerCase()}`

    if (isPairedBlock(block)) {
      if (block.motor === block.motor2)
        throw new Error("Для связанных моторов выберите два разных порта.")
      const motor2 = `motor_${(block.motor2 || "B").toLowerCase()}`
      const sign2 = block.direction2 === "backward" ? -1 : 1
      lines.push(
        `${indent}# Связанные моторы: независимые направления, общее движение`,
        `${indent}try:`
      )
      if (block.unit === "seconds") {
        const command = powered ? "dc" : "run"
        const amount = powered ? power : speed
        lines.push(
          `${indent}    ${motor}.${command}(${sign * amount})`,
          `${indent}    ${motor2}.${command}(${sign2 * amount})`,
          `${indent}    wait(${Math.round(value * 1000)})`
        )
      } else {
        const angle = Math.max(
          1,
          Math.round(value * (block.unit === "rotations" ? 360 : 1))
        )
        const done = (name: string) =>
          hub === "ev3" ? `${name}.control.done()` : `${name}.done()`
        lines.push(
          `${indent}    ${motor}.run_angle(${sign * speed}, ${angle}, then=Stop.BRAKE, wait=False)`,
          `${indent}    ${motor2}.run_angle(${sign2 * speed}, ${angle}, then=Stop.BRAKE, wait=False)`,
          `${indent}    while not (${done(motor)} and ${done(motor2)}):`,
          `${indent}        wait(10)`
        )
      }
      lines.push(
        `${indent}finally:`,
        `${indent}    ${motor}.brake()`,
        `${indent}    ${motor2}.brake()`,
        ""
      )
      return
    }

    if (options?.comments) lines.push(`${indent}# Мотор ${block.motor || "A"}: ${sign < 0 ? "назад" : "вперёд"}`)
    if (powered) {
      lines.push(
        `${indent}${motor}.dc(${sign * power})`,
        `${indent}try:`,
        `${indent}    wait(${Math.round(value * 1000)})`,
        `${indent}finally:`,
        `${indent}    ${motor}.brake()`
      )
    } else if (block.unit === "seconds") {
      lines.push(
        `${indent}${motor}.run_time(${sign * speed}, ${Math.round(value * 1000)}, then=Stop.BRAKE)`
      )
    } else {
      lines.push(
        `${indent}${motor}.run_angle(${sign * speed}, ${Math.max(1, Math.round(value * (block.unit === "rotations" ? 360 : 1)))}, then=Stop.BRAKE)`
      )
    }
  }

  const roots = autonomousBlocks
    .filter((b) => !b.parentId)
    .sort((a, b) => a.y - b.y || a.x - b.x)
  for (const root of roots) {
    for (const id of outerChainIds(autonomousBlocks, root.id)) {
      const b = autonomousBlocks.find((x) => x.id === id)
      if (b) emitBlock(b, "")
    }
  }

  return lines.join("\n") + "\n"
}

export function readSheets(
  workspace: unknown,
  hub: HubType = "spike"
): SheetState {
  const rawSheets = (workspace as { sheets?: unknown })?.sheets
  const rawActiveId = (workspace as { activeSheetId?: unknown })?.activeSheetId
  if (!Array.isArray(rawSheets) || !rawSheets.length) {
    return {
      activeSheetId: "sheet-main",
      sheets: [
        {
          id: "sheet-main",
          name: "Основная",
          blocks: readBlocks(workspace, hub),
        },
      ],
    }
  }
  const seen = new Set<string>()
  const sheets: WorkspaceSheet[] = rawSheets
    .filter(
      (s): s is Record<string, unknown> =>
        Boolean(s) &&
        typeof s === "object" &&
        typeof (s as { id?: unknown }).id === "string" &&
        Boolean((s as { id?: string }).id) &&
        !seen.has(String((s as { id?: string }).id)) &&
        Boolean(seen.add(String((s as { id?: string }).id)))
    )
    .slice(0, MAX_SHEETS)
    .map((s, i) => {
      const view = s.view as { panX?: unknown; panY?: unknown; zoom?: unknown } | undefined
      const validView =
        view &&
        [view.panX, view.panY, view.zoom].every((v) => Number.isFinite(v))
          ? {
              panX: Number(view.panX),
              panY: Number(view.panY),
              zoom: Math.max(0.5, Math.min(2, Number(view.zoom))),
            }
          : undefined
      const editorMode: SheetEditorMode | undefined =
        s.editorMode === "pybricks" ? "pybricks" : undefined
      const pythonCode =
        typeof s.pythonCode === "string" && s.pythonCode.length > 0
          ? s.pythonCode.slice(0, MAX_PYTHON_CODE_CHARS)
          : undefined
      const pythonDirty = s.pythonDirty === true ? true : undefined
      return {
        id: String(s.id),
        name:
          String(s.name || `Лист ${i + 1}`)
            .trim()
            .slice(0, 40) || `Лист ${i + 1}`,
        blocks: readBlocks(s, hub),
        ...(validView ? { view: validView } : {}),
        ...(editorMode ? { editorMode } : {}),
        ...(pythonCode !== undefined ? { pythonCode } : {}),
        ...(pythonDirty ? { pythonDirty } : {}),
      }
    })
  if (!sheets.length) return readSheets(null, hub)
  return {
    sheets,
    activeSheetId: sheets.some((s) => s.id === rawActiveId)
      ? String(rawActiveId)
      : sheets[0].id,
  }
}

function validateSheetName(
  state: SheetState,
  name: string,
  exceptId?: string
): string {
  const clean = String(name || "").trim()
  if (!clean || clean.length > 40)
    throw new Error("Название листа: от 1 до 40 символов.")
  if (
    state.sheets.some(
      (s) =>
        s.id !== exceptId &&
        s.name.toLocaleLowerCase() === clean.toLocaleLowerCase()
    )
  ) {
    throw new Error("Лист с таким названием уже есть.")
  }
  return clean
}

export function addSheet(
  state: SheetState,
  id: string,
  name: string
): SheetState {
  if (state.sheets.length >= MAX_SHEETS)
    throw new Error("Можно создать не больше 32 листов.")
  const clean = validateSheetName(state, name)
  if (state.sheets.some((s) => s.id === id))
    throw new Error("Лист уже существует.")
  return {
    sheets: [...state.sheets, { id, name: clean, blocks: [] }],
    activeSheetId: id,
  }
}

export function renameSheet(
  state: SheetState,
  id: string,
  name: string
): SheetState {
  const clean = validateSheetName(state, name, id)
  return {
    ...state,
    sheets: state.sheets.map((s) => (s.id === id ? { ...s, name: clean } : s)),
  }
}

export function deleteSheet(state: SheetState, id: string): SheetState {
  if (state.sheets.length <= 1)
    throw new Error("В проекте должен остаться хотя бы один лист.")
  const index = state.sheets.findIndex((s) => s.id === id)
  const sheets = state.sheets.filter((s) => s.id !== id)
  return {
    sheets,
    activeSheetId:
      state.activeSheetId === id
        ? sheets[Math.max(0, index - 1)].id
        : state.activeSheetId,
  }
}
