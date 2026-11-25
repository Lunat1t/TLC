// Pure layout helpers for the block editor board and its control areas.
// Kept free of React and DOM so they can be unit tested under Node.
import {
  CONTROL_INPUTS,
  isPlaceableControl,
  type ControlArea,
  type ControlInstance,
  type ControlLayout,
} from './control-workspace.ts'

/** Height of a control area's title bar; controls live below it. */
export const CONTROL_AREA_HEADER = 44

export const DEFAULT_KEY_BINDINGS: Readonly<Record<string, string>> = {
  up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
  a: 'KeyJ', b: 'KeyK', x: 'KeyU', y: 'KeyI', l: 'KeyQ', r: 'KeyE',
}

export type Point = { x: number; y: number }
export type Rect = { x: number; y: number; width: number; height: number }
export type ControlTarget = { controlId: string; input: string }
export type KeyTargets = Record<string, ControlTarget[]>

export function rectsOverlap(a: Rect, b: Rect) {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y
}

/** Whether a motor panel (in board coordinates) overlaps a placed control in the same area. */
export function panelOverlapsControls(area: ControlArea, controls: readonly ControlInstance[], panel: Rect) {
  return controls.some(control => {
    if (control.areaId !== area.id || !isPlaceableControl(control.kind)) return false
    return rectsOverlap(panel, {
      x: area.x + control.x,
      y: area.y + CONTROL_AREA_HEADER + control.y,
      width: control.width,
      height: control.height,
    })
  })
}

/** The control area on the sheet whose content region (below the header) contains the point. */
export function findAreaAt(areas: readonly ControlArea[], sheetId: string, point: Point) {
  return areas.find(area => area.sheetId === sheetId
    && point.x >= area.x && point.x <= area.x + area.width
    && point.y >= area.y + CONTROL_AREA_HEADER && point.y <= area.y + area.height)
}

/** Clamp a rectangle's top-left corner so it stays inside the area's content region. */
export function clampIntoArea(area: ControlArea, rect: Rect): Point {
  return {
    x: Math.max(area.x, Math.min(area.x + area.width - rect.width, rect.x)),
    y: Math.max(area.y + CONTROL_AREA_HEADER, Math.min(area.y + area.height - rect.height, rect.y)),
  }
}

/**
 * Find a free spot (area-local coordinates) for a control of the given size.
 * Prefers the spot centred on `location`, then scans a 16-unit grid row by row.
 */
export function findFreeControlSpot(
  area: ControlArea,
  occupied: readonly Rect[],
  size: readonly [number, number],
  location: Point,
  step = 16,
): Point | null {
  const [width, height] = size
  const maxX = area.width - width
  const maxY = area.height - CONTROL_AREA_HEADER - height
  const fits = (x: number, y: number) => !occupied.some(rect => rectsOverlap({ x, y, width, height }, rect))
  const x = Math.max(0, Math.min(maxX, location.x - area.x - width / 2))
  const y = Math.max(0, Math.min(maxY, location.y - area.y - CONTROL_AREA_HEADER - height / 2))
  if (fits(x, y)) return { x, y }
  for (let top = 0; top <= maxY; top += step) {
    for (let left = 0; left <= maxX; left += step) {
      if (fits(left, top)) return { x: left, y: top }
    }
  }
  return null
}

export function controlInputs(control: ControlInstance): readonly string[] {
  return control.inputs || CONTROL_INPUTS[control.kind]
}

/** Controls on the sheet that expose at least one pressable input. */
export function inputControlsOnSheet(
  controls: readonly ControlInstance[],
  areas: readonly ControlArea[],
  sheetId: string,
) {
  const areaIds = new Set(areas.filter(area => area.sheetId === sheetId).map(area => area.id))
  return controls.filter(control => areaIds.has(control.areaId) && controlInputs(control).length > 0)
}

/** Keyboard code → control inputs it triggers on the sheet. The first drive control gets default keys. */
export function buildKeyTargets(layout: Pick<ControlLayout, 'areas' | 'controls'>, sheetId: string): KeyTargets {
  const visible = new Set(layout.areas.filter(area => area.sheetId === sheetId).map(area => area.id))
  const controls = layout.controls.filter(control => visible.has(control.areaId))
  const first = controls.find(control => control.kind === 'drivetrain' || control.kind === 'legacy-buttons')
  const map: KeyTargets = {}
  for (const control of controls) {
    const bindings = control.keyBindings || (control.id === first?.id ? DEFAULT_KEY_BINDINGS : {})
    for (const [input, key] of Object.entries(bindings)) {
      if (CONTROL_INPUTS[control.kind].includes(input)) (map[key] ||= []).push({ controlId: control.id, input })
    }
  }
  return map
}

type TargetedError = { severity?: string; message: string; target?: { controlId?: string; input?: string } }

/** `controlId:input` → first blocking error message, including keys bound to several inputs. */
export function mapInputErrors(errors: readonly TargetedError[], keyTargets: KeyTargets) {
  const mapped: Record<string, string> = {}
  for (const error of errors) {
    if (error.severity !== 'warning' && error.target?.controlId && error.target.input) {
      mapped[`${error.target.controlId}:${error.target.input}`] = error.message
    }
  }
  for (const [key, targets] of Object.entries(keyTargets)) {
    if (targets.length < 2) continue
    for (const target of targets) mapped[`${target.controlId}:${target.input}`] = `Клавиша ${key} назначена нескольким кнопкам.`
  }
  return mapped
}

/** Drop legacy per-area drive settings once the project has its own chassis; undefined when nothing changes. */
export function stripLegacyAreaDrive(layout: ControlLayout): ControlLayout | undefined {
  if (!layout.areas.some(area => area.drive !== undefined)) return undefined
  return {
    ...layout,
    areas: layout.areas.map(area => {
      if (area.drive === undefined) return area
      const { drive: _drive, ...rest } = area
      return rest
    }),
  }
}

export function clampChassisSpeed(value: number | undefined, fallback = 360) {
  const speed = Number.isFinite(value) ? Number(value) : fallback
  return Math.max(1, Math.min(1000, Math.round(speed)))
}
