import type { HubType } from "./projects"

export const MAX_BLOCKS = 200
export const MOTOR_SPEED = 360
export const MAX_SHEETS = 32

export type BlockType = "start" | "drive" | "pair" | "if"
export type MotorDirection = "forward" | "backward"
export type TravelUnit = "rotations" | "degrees" | "seconds"
export type MotorModule = "speed" | "power" | "travel"
export type ConditionSensor =
  | "distance"
  | "color"
  | "reflection"
  | "force"
  | "angle"
  | "number"
export type ConditionOperator = "<" | ">" | "=" | "!=" | "<=" | ">="
export type ColorValue = "red" | "blue" | "green" | "yellow" | "white" | "black"
export type TouchState = "pressed" | "released"
export type IfModule = "compare" | "logic"
export type LogicOperator = "and" | "or"
export type BranchSlot = "body"

export const IF_TOP_HEIGHT = 64
export const IF_FOOT_HEIGHT = 28
export const IF_INDENT = 28
export const IF_EMPTY_MOUTH = 52

export interface WorkspaceBlock {
  id: string
  type: BlockType
  x: number
  y: number
  parentId?: string
  branch?: BranchSlot
  motor?: string
  motor2?: string
  direction?: MotorDirection
  direction2?: MotorDirection
  modules?: MotorModule[]
  speed?: number
  power?: number
  value?: number
  unit?: TravelUnit
  // If-block modular fields
  sensor?: ConditionSensor
  sensorPort?: string
  leftValue?: number
  ifModules?: IfModule[]
  operator?: ConditionOperator
  compareValue?: number
  colorValue?: ColorValue
  touchState?: TouchState
  logicOp?: LogicOperator
  sensor2?: ConditionSensor
  sensorPort2?: string
  leftValue2?: number
  operator2?: ConditionOperator
  compareValue2?: number
  colorValue2?: ColorValue
  touchState2?: TouchState
}

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
}

export interface SheetState {
  activeSheetId: string
  sheets: WorkspaceSheet[]
}

const PORTS: Record<HubType, string[]> = {
  spike: ["A", "B", "C", "D", "E", "F"],
  ev3: ["A", "B", "C", "D"],
}

const UNITS: TravelUnit[] = ["rotations", "degrees", "seconds"]
const SENSORS: ConditionSensor[] = [
  "distance",
  "color",
  "reflection",
  "force",
  "angle",
  "number",
]
const OPERATORS: ConditionOperator[] = ["<", ">", "=", "!=", "<=", ">="]
const COLORS: ColorValue[] = [
  "red",
  "blue",
  "green",
  "yellow",
  "white",
  "black",
]
const PYBRICKS_COLOR: Record<ColorValue, string> = {
  red: "RED",
  blue: "BLUE",
  green: "GREEN",
  yellow: "YELLOW",
  white: "WHITE",
  black: "BLACK",
}

export function blockHeight(block: Pick<WorkspaceBlock, "type">): number {
  if (block.type === "if") return IF_TOP_HEIGHT + IF_EMPTY_MOUTH + IF_FOOT_HEIGHT
  return block.type === "pair" ? 64 : block.type === "drive" ? 64 : 58
}

export function ifInnerHeight(
  blocks: WorkspaceBlock[],
  id: string,
  visited = new Set<string>()
): number {
  if (visited.has(id)) return IF_EMPTY_MOUTH
  const nextVisited = new Set(visited)
  nextVisited.add(id)
  const firstBody = blocks.find(
    (b) => b.parentId === id && b.branch === "body"
  )
  if (!firstBody) return IF_EMPTY_MOUTH
  let span = 0
  let curr: WorkspaceBlock | undefined = firstBody
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
  if (block.type !== "if") return blockHeight(block)
  return (
    IF_TOP_HEIGHT +
    ifInnerHeight(blocks, id, visited) +
    IF_FOOT_HEIGHT
  )
}

export function cleanLinks(blocks: WorkspaceBlock[]): WorkspaceBlock[] {
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const occupied = new Set<string>()
  const clean = blocks.map((b) => {
    const next: WorkspaceBlock = { ...b }
    const parent = next.parentId ? byId.get(next.parentId) : undefined
    if (next.branch && parent?.type !== "if") {
      delete next.branch
    }
    const slotKey = next.parentId
      ? `${next.parentId}:${next.branch === "body" ? "body" : "next"}`
      : ""
    if (
      !next.parentId ||
      !parent ||
      next.parentId === next.id ||
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
  const result: string[] = []
  const seen = new Set<string>()
  function visit(currId: string | undefined) {
    let current = currId
    while (current && !seen.has(current)) {
      seen.add(current)
      result.push(current)
      const bodyId = bodyChildren.get(current)
      if (bodyId) visit(bodyId)
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
      if (next.branch === "body" && parent.type === "if") {
        next.x = parent.x + IF_INDENT
        next.y = parent.y + IF_TOP_HEIGHT - 4
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
        ["start", "drive", "pair", "if"].includes(
          String((block as { type?: unknown }).type)
        ) &&
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
      const base: WorkspaceBlock = {
        id: String(block.id),
        type,
        x: Math.round(Number(block.x)),
        y: Math.round(Number(block.y)),
        ...(typeof block.parentId === "string" ? { parentId: block.parentId } : {}),
        ...(block.branch === "body" ? { branch: "body" as BranchSlot } : {}),
      }
      if (type === "start") return base

      if (type === "if") {
        const rawIfModules = Array.isArray(block.ifModules)
          ? ([
              ...new Set(
                block.ifModules.filter((m): m is IfModule =>
                  ["compare", "logic"].includes(String(m))
                )
              ),
            ] as IfModule[])
          : (["compare"] as IfModule[])

        return {
          ...base,
          sensor: SENSORS.includes(block.sensor as ConditionSensor)
            ? (block.sensor as ConditionSensor)
            : "distance",
          sensorPort: PORTS[hub]?.includes(String(block.sensorPort))
            ? String(block.sensorPort)
            : "A",
          leftValue: Number.isFinite(block.leftValue)
            ? Number(block.leftValue)
            : 10,
          ifModules: rawIfModules,
          operator: OPERATORS.includes(block.operator as ConditionOperator)
            ? (block.operator as ConditionOperator)
            : "<",
          compareValue:
            Number.isFinite(block.compareValue) &&
            Number(block.compareValue) >= -10000 &&
            Number(block.compareValue) <= 10000
              ? Number(block.compareValue)
              : 20,
          colorValue: COLORS.includes(block.colorValue as ColorValue)
            ? (block.colorValue as ColorValue)
            : "red",
          touchState:
            block.touchState === "released" ? "released" : "pressed",
          logicOp: block.logicOp === "or" ? "or" : "and",
          sensor2: SENSORS.includes(block.sensor2 as ConditionSensor)
            ? (block.sensor2 as ConditionSensor)
            : "force",
          sensorPort2: PORTS[hub]?.includes(String(block.sensorPort2))
            ? String(block.sensorPort2)
            : "B",
          leftValue2: Number.isFinite(block.leftValue2)
            ? Number(block.leftValue2)
            : 10,
          operator2: OPERATORS.includes(block.operator2 as ConditionOperator)
            ? (block.operator2 as ConditionOperator)
            : "<",
          compareValue2:
            Number.isFinite(block.compareValue2) &&
            Number(block.compareValue2) >= -10000 &&
            Number(block.compareValue2) <= 10000
              ? Number(block.compareValue2)
              : 20,
          colorValue2: COLORS.includes(block.colorValue2 as ColorValue)
            ? (block.colorValue2 as ColorValue)
            : "blue",
          touchState2:
            block.touchState2 === "released" ? "released" : "pressed",
        }
      }

      const rawModules = Array.isArray(block.modules)
        ? ([
            ...new Set(
              block.modules.filter((m): m is MotorModule =>
                ["speed", "power", "travel"].includes(String(m))
              )
            ),
          ] as MotorModule[])
        : (["travel"] as MotorModule[])

      return {
        ...base,
        ...(type === "pair"
          ? {
              motor2: PORTS[hub]?.includes(String(block.motor2))
                ? String(block.motor2)
                : "B",
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
  if (!["start", "drive", "pair", "if"].includes(type))
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
  if (type === "if") {
    Object.assign(block, {
      sensor: "distance",
      sensorPort: "A",
      leftValue: 10,
      ifModules: ["compare"],
      operator: "<",
      compareValue: 20,
      colorValue: "red",
      touchState: "pressed",
      logicOp: "and",
      sensor2: "force",
      sensorPort2: "B",
      leftValue2: 10,
      operator2: "<",
      compareValue2: 20,
      colorValue2: "blue",
      touchState2: "pressed",
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
        const wasBody = next.branch === "body"
        delete next.parentId
        delete next.branch
        if (!wasBody && removed?.parentId) {
          next.parentId = removed.parentId
          if (removed.branch === "body") next.branch = "body"
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
  return readBlocks(
    {
      blocks: blocks.map((block) =>
        block.id === id && ["drive", "pair", "if"].includes(block.type)
          ? { ...block, ...changes }
          : block
      ),
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
  const moving = chainIds(blocks, id)
  const parent = blocks.find((b) => b.id === parentId)
  if (
    !blocks.some((b) => b.id === id) ||
    !parent ||
    moving.includes(parentId)
  ) {
    return blocks
  }
  const effectiveBranch =
    branch === "body" && parent.type === "if" ? "body" : undefined
  const outerMoving = outerChainIds(blocks, id)
  const tail = outerMoving[outerMoving.length - 1]
  const detached = detachChain(blocks, id)
  const previousChild = detached.find(
    (b) =>
      b.parentId === parentId &&
      (effectiveBranch === "body" ? b.branch === "body" : !b.branch)
  )
  return layoutChains(
    detached.map((b) => {
      if (b.id === id) {
        return {
          ...b,
          parentId,
          ...(effectiveBranch ? { branch: effectiveBranch } : {}),
        }
      }
      if (previousChild && b.id === previousChild.id) {
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
  threshold = 48
): { id: string; branch?: BranchSlot } | null {
  const moving = new Set(chainIds(blocks, id))
  let best: { id: string; branch?: BranchSlot } | null = null
  let distance = Infinity
  for (const b of blocks) {
    if (moving.has(b.id)) continue
    if (b.type === "if") {
      const innerDx = Math.abs(b.x + IF_INDENT - x)
      const innerDy = Math.abs(b.y + IF_TOP_HEIGHT - 4 - y)
      if (
        innerDx <= threshold &&
        innerDy <= threshold &&
        innerDx + innerDy < distance
      ) {
        best = { id: b.id, branch: "body" }
        distance = innerDx + innerDy
      }
    }
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

function buildSingleConditionExpr(
  sensor: ConditionSensor,
  port: string,
  leftVal: number,
  op: ConditionOperator,
  val: number,
  colorVal: ColorValue,
  touchState: TouchState
): string {
  const pyOp = op === "=" ? "==" : op
  const p = port.toLowerCase()
  switch (sensor) {
    case "distance":
      return `distance_sensor_${p}.distance() ${pyOp} ${Math.round(val * 10)}`
    case "color": {
      const colorOp = op === "!=" ? "!=" : "=="
      return `color_sensor_${p}.color() ${colorOp} Color.${PYBRICKS_COLOR[colorVal] || "RED"}`
    }
    case "reflection":
      return `color_sensor_${p}.reflection() ${pyOp} ${val}`
    case "force":
      return touchState === "released"
        ? `not force_sensor_${p}.pressed()`
        : `force_sensor_${p}.pressed()`
    case "angle":
      return `motor_${p}.angle() ${pyOp} ${val}`
    case "number":
      return `${leftVal} ${pyOp} ${val}`
  }
}

export function generatePybricks(
  blocks: WorkspaceBlock[],
  hub: HubType
): string {
  if (!PORTS[hub]) throw new Error("Неизвестный тип робота.")
  const clean = readBlocks({ blocks }, hub)
  const ordered = executionOrder(clean)
  const driveBlocks = ordered.filter((block) =>
    ["drive", "pair"].includes(block.type)
  )
  const ifBlocks = ordered.filter((block) => block.type === "if")
  if (!driveBlocks.length)
    throw new Error("Добавьте на доску блок движения.")

  for (const ifBlock of ifBlocks) {
    const mods = ifBlock.ifModules || []
    if (!mods.includes("compare")) {
      throw new Error(
        "Добавьте модуль операции в блок «Если», чтобы задать условие проверки."
      )
    }
  }

  const usedMotors = new Set<string>(
    driveBlocks.flatMap((block) =>
      block.type === "pair"
        ? [block.motor || "A", block.motor2 || "B"]
        : [block.motor || "A"]
    )
  )
  const usedDistancePorts = new Set<string>()
  const usedColorPorts = new Set<string>()
  const usedForcePorts = new Set<string>()
  let usesColorEnum = false

  function registerSensor(sensor: ConditionSensor, port: string) {
    if (sensor === "distance") usedDistancePorts.add(port)
    else if (sensor === "color") {
      usedColorPorts.add(port)
      usesColorEnum = true
    } else if (sensor === "reflection") usedColorPorts.add(port)
    else if (sensor === "force") usedForcePorts.add(port)
    else if (sensor === "angle") usedMotors.add(port)
  }

  for (const b of ifBlocks) {
    registerSensor(b.sensor || "distance", b.sensorPort || "A")
    if ((b.ifModules || []).includes("logic")) {
      registerSensor(b.sensor2 || "force", b.sensorPort2 || "B")
    }
  }

  const deviceImports = ["Motor"]
  if (usedDistancePorts.size) deviceImports.push("UltrasonicSensor")
  if (usedColorPorts.size) deviceImports.push("ColorSensor")
  if (usedForcePorts.size)
    deviceImports.push(hub === "spike" ? "ForceSensor" : "TouchSensor")

  const paramImports = usesColorEnum
    ? "Color, Port, Stop"
    : "Port, Stop"

  const sortedMotors = [...usedMotors].sort()
  const initLines = [
    ...sortedMotors.map(
      (port) => `motor_${port.toLowerCase()} = Motor(Port.${port})`
    ),
    ...[...usedDistancePorts]
      .sort()
      .map(
        (port) =>
          `distance_sensor_${port.toLowerCase()} = UltrasonicSensor(Port.${port})`
      ),
    ...[...usedColorPorts]
      .sort()
      .map(
        (port) =>
          `color_sensor_${port.toLowerCase()} = ColorSensor(Port.${port})`
      ),
    ...[...usedForcePorts]
      .sort()
      .map(
        (port) =>
          `force_sensor_${port.toLowerCase()} = ${
            hub === "spike" ? "ForceSensor" : "TouchSensor"
          }(Port.${port})`
      ),
  ]

  const lines = [
    "# TLC: команды выполняются сверху вниз",
    `from pybricks.${
      hub === "spike" ? "pupdevices" : "ev3devices"
    } import ${deviceImports.join(", ")}`,
    `from pybricks.parameters import ${paramImports}`,
    "from pybricks.tools import wait",
    "",
    ...initLines,
    "",
  ]

  function emitBlock(block: WorkspaceBlock, indent: string) {
    if (block.type === "start") return
    if (block.type === "if") {
      const cond1 = buildSingleConditionExpr(
        block.sensor || "distance",
        block.sensorPort || "A",
        block.leftValue ?? 10,
        block.operator || "<",
        block.compareValue ?? 20,
        block.colorValue || "red",
        block.touchState || "pressed"
      )
      const hasLogic = (block.ifModules || []).includes("logic")
      const fullCond = hasLogic
        ? `(${cond1}) ${block.logicOp === "or" ? "or" : "and"} (${buildSingleConditionExpr(
            block.sensor2 || "force",
            block.sensorPort2 || "B",
            block.leftValue2 ?? 10,
            block.operator2 || "<",
            block.compareValue2 ?? 20,
            block.colorValue2 || "blue",
            block.touchState2 || "pressed"
          )})`
        : cond1
      lines.push(`${indent}if ${fullCond}:`)
      const firstBody = clean.find(
        (b) => b.parentId === block.id && b.branch === "body"
      )
      const bodyChain = firstBody
        ? outerChainIds(clean, firstBody.id)
            .map((id) => clean.find((b) => b.id === id))
            .filter(
              (b): b is WorkspaceBlock => b !== undefined && b.type !== "start"
            )
        : []
      if (!bodyChain.length) {
        lines.push(`${indent}    pass`)
      } else {
        for (const inner of bodyChain) {
          emitBlock(inner, `${indent}    `)
        }
      }
      return
    }

    const modules = block.modules || []
    if (modules.includes("speed") && modules.includes("power"))
      throw new Error("Выберите скорость или мощность, а не оба режима.")
    const powered = modules.includes("power")
    const hasTravel = modules.includes("travel")
    if (!hasTravel)
      throw new Error(
        "Добавьте модуль «Величина движения», чтобы задать остановку мотора."
      )
    if (powered && block.unit !== "seconds")
      throw new Error(
        "Для мощности выберите секунды. Для точных оборотов и градусов используйте скорость."
      )
    const speed = modules.includes("speed")
      ? block.speed || MOTOR_SPEED
      : MOTOR_SPEED
    const power = block.power || 50
    const value = block.value || 1
    const sign = block.direction === "backward" ? -1 : 1
    const motor = `motor_${(block.motor || "A").toLowerCase()}`

    if (block.type === "pair") {
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

  const roots = clean
    .filter((b) => !b.parentId)
    .sort((a, b) => a.y - b.y || a.x - b.x)
  for (const root of roots) {
    for (const id of outerChainIds(clean, root.id)) {
      const b = clean.find((x) => x.id === id)
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
      return {
        id: String(s.id),
        name:
          String(s.name || `Лист ${i + 1}`)
            .trim()
            .slice(0, 40) || `Лист ${i + 1}`,
        blocks: readBlocks(s, hub),
        ...(validView ? { view: validView } : {}),
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
