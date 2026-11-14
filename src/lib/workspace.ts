import type { HubType } from "./projects"

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
export type ControllerEvent = "pressed" | "released"

export type BlockType = "start" | "drive" | "pair" | "if" | "button" | "stop" | "motor-buttons"
const LIBRARY_BLOCK_TYPES = new Set<BlockType>(["start", "drive", "pair", "if", "stop", "motor-buttons"])
export type MotorDirection = "forward" | "backward"
export type TravelUnit = "rotations" | "degrees" | "seconds"
export type MotorModule = "speed" | "power" | "travel"
export type MotorButtonModule = "red" | "green" | "yellow"
export type MotorPanelButton = "blue" | MotorButtonModule
export type BranchSlot = "body" | "else"

export const IF_TOP_HEIGHT = 58
export const IF_MID_HEIGHT = 48
export const IF_FOOT_HEIGHT = 28
export const IF_INDENT = 28
export const IF_EMPTY_MOUTH = 52

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
  direction?: MotorDirection
  direction2?: MotorDirection
  modules?: MotorModule[]
  controlModules?: MotorButtonModule[]
  hiddenControlButtons?: MotorPanelButton[]
  width?: number
  height?: number
  speed?: number
  power?: number
  value?: number
  unit?: TravelUnit
  button?: ControllerButton
  target?: { controlId: string; input: string }
  event?: ControllerEvent
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
  if (block.type === "if")
    return (
      IF_TOP_HEIGHT +
      IF_EMPTY_MOUTH +
      IF_MID_HEIGHT +
      IF_EMPTY_MOUTH +
      IF_FOOT_HEIGHT
    )
  if (block.type === "button") return 58
  if (block.type === "stop") return 58
  if (block.type === "motor-buttons") return block.height ?? 132
  return block.type === "pair" ? 64 : block.type === "drive" ? 64 : 58
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
    if (next.branch && parent?.type !== "if") {
      delete next.branch
    }
    const slotKey = next.parentId
      ? `${next.parentId}:${next.branch || "next"}`
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

  for (const block of clean) {
    if (block.parentId && !["drive", "pair", "stop"].includes(block.type)) {
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
  const result: string[] = []
  const seen = new Set<string>()
  function visit(currId: string | undefined) {
    let current = currId
    while (current && !seen.has(current)) {
      seen.add(current)
      result.push(current)
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
      if (next.branch === "body" && parent.type === "if") {
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
        block.branch === "body" || block.branch === "else"
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
        ]
        const btn = allowedButtons.includes(block.button as ControllerButton)
          ? (block.button as ControllerButton)
          : "up"
        const ev: ControllerEvent =
          block.event === "released" ? "released" : "pressed"
        return {
          ...base,
          button: btn,
          ...(block.target && typeof block.target === "object" && typeof (block.target as {controlId?:unknown}).controlId === "string" && typeof (block.target as {input?:unknown}).input === "string" ? {target: {controlId: (block.target as {controlId:string}).controlId, input: (block.target as {input:string}).input}} : {}),
          event: ev,
        }
      }

      if (type === "stop") {
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
    Object.assign(block, { button: "up", event: "pressed" })
  }
  if (type === "stop") {
    Object.assign(block, { motor: "A" })
  }
  if (type === "motor-buttons") {
    Object.assign(block, { width: 180, height: 132, controlModules: [], hiddenControlButtons: [] })
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
  return readBlocks(
    {
      blocks: blocks.map((block) =>
        block.id === id && ["drive", "pair", "if", "button", "stop"].includes(block.type)
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
    if (movingBlock && !["drive", "pair", "stop"].includes(movingBlock.type)) {
      return blocks
    }
  }

  const effectiveBranch =
    (branch === "body" || branch === "else") && parent.type === "if"
      ? branch
      : undefined
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
  const movingBlock = blocks.find((b) => b.id === id)
  if (movingBlock?.type === "button" || movingBlock?.type === "motor-buttons") return null

  const moving = new Set(chainIds(blocks, id))
  let best: { id: string; branch?: BranchSlot } | null = null
  let distance = Infinity
  for (const b of blocks) {
    if (b.type === "motor-buttons") continue
    if (moving.has(b.id)) continue

    const rootOfB = findChainRoot(blocks, b.id)
    if (rootOfB?.type === "button") {
      if (movingBlock && !["drive", "pair", "stop"].includes(movingBlock.type)) {
        continue
      }
    }

    if (b.type === "if") {
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
        innerDx <= threshold &&
        elseDy <= threshold &&
        innerDx + elseDy < distance
      ) {
        best = { id: b.id, branch: "else" }
        distance = innerDx + elseDy
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

export function generatePybricks(
  blocks: WorkspaceBlock[],
  hub: HubType
): string {
  if (!PORTS[hub]) throw new Error("Неизвестный тип робота.")
  const clean = readBlocks({ blocks }, hub)
  const autonomousBlocks = clean.filter(
    (b) => findChainRoot(clean, b.id)?.type !== "button"
  )
  const ordered = executionOrder(autonomousBlocks)
  const driveBlocks = ordered.filter((block) =>
    ["drive", "pair", "stop"].includes(block.type)
  )
  if (!driveBlocks.length)
    throw new Error("Добавьте на доску блок движения.")

  const used = [
    ...new Set(
      driveBlocks.flatMap((block) =>
        block.type === "pair" || (block.type === "stop" && block.motor2)
          ? [block.motor || "A", block.motor2 || "B"]
          : [block.motor || "A"]
      )
    ),
  ].sort()

  const lines = [
    "# TLC: команды выполняются сверху вниз",
    `from pybricks.${
      hub === "spike" ? "pupdevices" : "ev3devices"
    } import Motor`,
    "from pybricks.parameters import Port, Stop",
    "from pybricks.tools import wait",
    "",
    ...used.map(
      (port) => `motor_${port.toLowerCase()} = Motor(Port.${port})`
    ),
    "",
  ]

  function emitBlock(block: WorkspaceBlock, indent: string) {
    if (block.type === "start" || block.type === "button") return
    if (block.type === "stop") {
      const motor = `motor_${(block.motor || "A").toLowerCase()}`
      lines.push(`${indent}${motor}.brake()`)
      if (block.motor2) {
        const motor2 = `motor_${block.motor2.toLowerCase()}`
        lines.push(`${indent}${motor2}.brake()`)
      }
      return
    }
    if (block.type === "if") {
      lines.push(`${indent}if True:`)
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

      lines.push(`${indent}else:`)
      const firstElse = clean.find(
        (b) => b.parentId === block.id && b.branch === "else"
      )
      const elseChain = firstElse
        ? outerChainIds(clean, firstElse.id)
            .map((id) => clean.find((b) => b.id === id))
            .filter(
              (b): b is WorkspaceBlock => b !== undefined && b.type !== "start"
            )
        : []
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
