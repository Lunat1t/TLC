import * as RawRegistry from "../../public/block-registry.js"

export type HubId = "spike" | "ev3"
export type DrivePort = "A" | "B" | "C" | "D" | "E" | "F"
export type ChassisDirection = "forward" | "backward" | "left" | "right"

export interface DriveSettings {
  leftPort: DrivePort
  rightPort: DrivePort
  leftReversed: boolean
  rightReversed: boolean
  speed?: number
}

export const HUB_PORTS = RawRegistry.HUB_PORTS as Readonly<Record<HubId, readonly string[]>>
export const DRIVE_PORTS = RawRegistry.DRIVE_PORTS as readonly DrivePort[]
export const DEFAULT_SPEED = RawRegistry.DEFAULT_SPEED as number
export const DEFAULT_POWER = RawRegistry.DEFAULT_POWER as number
export const DEFAULT_DRIVE_SETTINGS = RawRegistry.DEFAULT_DRIVE_SETTINGS as Readonly<DriveSettings>
export const BLOCK_TYPES = RawRegistry.BLOCK_TYPES as readonly string[]
export const ACTION_BLOCK_TYPES = RawRegistry.ACTION_BLOCK_TYPES as readonly string[]
export const CONTROLLER_BUTTONS = RawRegistry.CONTROLLER_BUTTONS as readonly string[]
export const COLOR_BUTTONS = RawRegistry.COLOR_BUTTONS as readonly string[]
export const CONTROLLER_EVENTS = RawRegistry.CONTROLLER_EVENTS as readonly ("hold" | "pressed" | "released")[]
export const CHASSIS_DIRECTIONS = RawRegistry.CHASSIS_DIRECTIONS as readonly ChassisDirection[]
export const BUTTON_LABELS = RawRegistry.BUTTON_LABELS as Readonly<Record<string, string>>
export const INPUT_ICONS = RawRegistry.INPUT_ICONS as Readonly<Record<string, string>>
export const BUTTON_KEYS = RawRegistry.BUTTON_KEYS as Readonly<Record<string, string>>
export const DIRECTION_INPUTS = RawRegistry.DIRECTION_INPUTS as Readonly<Record<"drive-turn" | "drive-linear", readonly string[]>>
export const WHEEL_DIRECTIONS = RawRegistry.WHEEL_DIRECTIONS as unknown as Readonly<Record<string, readonly [number, number]>>
export const CONTROL_KIND_INPUTS = RawRegistry.CONTROL_KIND_INPUTS as Readonly<Record<string, readonly string[]>>

export function isDriveSettings(value: unknown): value is DriveSettings {
  return RawRegistry.isDriveSettings(value)
}

export function normalizeChassisSettings(value: unknown): DriveSettings | undefined {
  return RawRegistry.normalizeChassisSettings(value) as DriveSettings | undefined
}

export function resolveProjectChassis(project: unknown): { configured: boolean; settings: DriveSettings } {
  return RawRegistry.resolveProjectChassis(project) as { configured: boolean; settings: DriveSettings }
}

export function isPairedBlock(block: unknown): boolean {
  return RawRegistry.isPairedBlock(block)
}

export function getRawStopPorts(block: unknown): { stopAll: boolean; ports: string[] } {
  return RawRegistry.getRawStopPorts(block)
}

export function getStopPorts(block: unknown, hub: HubId = "spike"): { stopAll: boolean; ports: string[] } {
  return RawRegistry.getStopPorts(block, hub)
}

export function formatControlOptionLabel(
  control: { kind?: string; label?: string; inputs?: readonly string[] },
  indexInKind: number,
  countInKind: number,
): string {
  return RawRegistry.formatControlOptionLabel(control, indexInKind, countInKind)
}
