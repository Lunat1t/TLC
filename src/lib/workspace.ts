import type { HubType } from "./projects"

export const MAX_BLOCKS = 200
export const MOTOR_SPEED = 360
export const MAX_SHEETS = 32

export type BlockType = "start" | "drive" | "pair"
export type MotorDirection = "forward" | "backward"
export type TravelUnit = "rotations" | "degrees" | "seconds"
export type MotorModule = "speed" | "power" | "travel"

export interface WorkspaceBlock {
  id: string
  type: BlockType
  x: number
  y: number
  parentId?: string
  motor?: string
  motor2?: string
  direction?: MotorDirection
  direction2?: MotorDirection
  modules?: MotorModule[]
  speed?: number
  power?: number
  value?: number
  unit?: TravelUnit
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

export function blockHeight(block: Pick<WorkspaceBlock, "type">): number {
  return block.type === "pair" ? 64 : block.type === "drive" ? 64 : 58
}

export function cleanLinks(blocks: WorkspaceBlock[]): WorkspaceBlock[] {
  const ids = new Set(blocks.map((b) => b.id))
  const occupied = new Set<string>()
  const clean = blocks.map((b) => {
    const next: WorkspaceBlock = { ...b }
    if (
      !next.parentId ||
      !ids.has(next.parentId) ||
      next.parentId === next.id ||
      occupied.has(next.parentId)
    ) {
      delete next.parentId
    } else {
      occupied.add(next.parentId)
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
        break
      }
      seen.add(current.parentId)
      current = map.get(current.parentId)
    }
  }
  return clean
}

export function chainIds(blocks: WorkspaceBlock[], id: string): string[] {
  const children = new Map(
    blocks.filter((b) => b.parentId).map((b) => [b.parentId as string, b.id])
  )
  const result: string[] = []
  const seen = new Set<string>()
  let current: string | undefined = id
  while (current && !seen.has(current)) {
    seen.add(current)
    result.push(current)
    current = children.get(current)
  }
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
  for (const b of executionOrder(blocks)) {
    const next = map.get(b.id)
    const parent = b.parentId ? map.get(b.parentId) : undefined
    if (next && parent) {
      next.x = parent.x
      next.y = parent.y + blockHeight(parent) + 6
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
        ["start", "drive", "pair"].includes(String((block as { type?: unknown }).type)) &&
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
      }
      if (type === "start") return base

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
  if (!["start", "drive", "pair"].includes(type))
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
        delete next.parentId
        if (removed?.parentId) next.parentId = removed.parentId
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
        block.id === id && ["drive", "pair"].includes(block.type)
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
  parentId: string
): WorkspaceBlock[] {
  const moving = chainIds(blocks, id)
  if (
    !blocks.some((b) => b.id === id) ||
    !blocks.some((b) => b.id === parentId) ||
    moving.includes(parentId)
  ) {
    return blocks
  }
  const tail = moving[moving.length - 1]
  const detached = detachChain(blocks, id)
  const previousChild = detached.find((b) => b.parentId === parentId)
  return layoutChains(
    detached.map((b) => {
      if (b.id === id) return { ...b, parentId }
      if (previousChild && b.id === previousChild.id)
        return { ...b, parentId: tail }
      return b
    })
  )
}

export function snapTarget(
  blocks: WorkspaceBlock[],
  id: string,
  x: number,
  y: number,
  threshold = 36
): string | null {
  const moving = new Set(chainIds(blocks, id))
  let best: string | null = null
  let distance = Infinity
  for (const b of blocks) {
    if (moving.has(b.id)) continue
    const dx = Math.abs(b.x - x)
    const dy = Math.abs(b.y + blockHeight(b) + 6 - y)
    if (dx <= threshold && dy <= threshold && dx + dy < distance) {
      best = b.id
      distance = dx + dy
    }
  }
  return best
}

export function generatePybricks(
  blocks: WorkspaceBlock[],
  hub: HubType
): string {
  if (!PORTS[hub]) throw new Error("Неизвестный тип робота.")
  const driveBlocks = executionOrder(readBlocks({ blocks }, hub)).filter(
    (block) => ["drive", "pair"].includes(block.type)
  )
  if (!driveBlocks.length)
    throw new Error("Добавьте на доску блок движения.")
  const used = [
    ...new Set(
      driveBlocks.flatMap((block) =>
        block.type === "pair"
          ? [block.motor || "A", block.motor2 || "B"]
          : [block.motor || "A"]
      )
    ),
  ].sort()

  const lines = [
    "# TLC: команды выполняются сверху вниз",
    `from pybricks.${hub === "spike" ? "pupdevices" : "ev3devices"} import Motor`,
    "from pybricks.parameters import Port, Stop",
    "from pybricks.tools import wait",
    "",
    ...used.map((port) => `motor_${port.toLowerCase()} = Motor(Port.${port})`),
    "",
  ]

  for (const block of driveBlocks) {
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
    const speed = modules.includes("speed") ? block.speed || MOTOR_SPEED : MOTOR_SPEED
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
        "# Связанные моторы: независимые направления, общее движение",
        "try:"
      )
      if (block.unit === "seconds") {
        const command = powered ? "dc" : "run"
        const amount = powered ? power : speed
        lines.push(
          `    ${motor}.${command}(${sign * amount})`,
          `    ${motor2}.${command}(${sign2 * amount})`,
          `    wait(${Math.round(value * 1000)})`
        )
      } else {
        const angle = Math.max(
          1,
          Math.round(value * (block.unit === "rotations" ? 360 : 1))
        )
        const done = (name: string) =>
          hub === "ev3" ? `${name}.control.done()` : `${name}.done()`
        lines.push(
          `    ${motor}.run_angle(${sign * speed}, ${angle}, then=Stop.BRAKE, wait=False)`,
          `    ${motor2}.run_angle(${sign2 * speed}, ${angle}, then=Stop.BRAKE, wait=False)`,
          `    while not (${done(motor)} and ${done(motor2)}):`,
          "        wait(10)"
        )
      }
      lines.push("finally:", `    ${motor}.brake()`, `    ${motor2}.brake()`, "")
      continue
    }

    if (powered) {
      lines.push(
        `${motor}.dc(${sign * power})`,
        "try:",
        `    wait(${Math.round(value * 1000)})`,
        "finally:",
        `    ${motor}.brake()`
      )
    } else if (block.unit === "seconds") {
      lines.push(
        `${motor}.run_time(${sign * speed}, ${Math.round(value * 1000)}, then=Stop.BRAKE)`
      )
    } else {
      lines.push(
        `${motor}.run_angle(${sign * speed}, ${Math.max(1, Math.round(value * (block.unit === "rotations" ? 360 : 1)))}, then=Stop.BRAKE)`
      )
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
