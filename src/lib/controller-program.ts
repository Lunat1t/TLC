// Typed re-export of public/controller-program.js
import * as RawControllerProgram from "../../public/controller-program.js"
import type { DrivePort, DriveSettings } from "./block-registry.ts"

export type { DrivePort, DriveSettings }

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

export const DRIVE_PORTS = RawControllerProgram.DRIVE_PORTS as readonly DrivePort[]
export const DEFAULT_DRIVE_SETTINGS = RawControllerProgram.DEFAULT_DRIVE_SETTINGS as Readonly<DriveSettings>

export function isDriveSettings(value: unknown): value is DriveSettings {
  return RawControllerProgram.isDriveSettings(value)
}

export function resolveProjectChassis(project: unknown): { configured: boolean; settings: DriveSettings } {
  return RawControllerProgram.resolveProjectChassis(project) as { configured: boolean; settings: DriveSettings }
}

export function getStopPorts(block: unknown, hub: "spike" | "ev3" = "spike"): { stopAll: boolean; ports: string[] } {
  return RawControllerProgram.getStopPorts(block, hub)
}

export type SensorCheck =
  | { kind: "color"; port: string; color: string }
  | { kind: "reflection"; port: string; op: "lt" | "gt"; value: number }
  | { kind: "pressed"; port: string; pressed: boolean }
  | { kind: "force"; port: string; op: "lt" | "gt"; value: number }
  | { kind: "heading"; port: string; op: "lt" | "gt"; value: number }
  | { kind: "tilt"; port: string; axis: "pitch" | "roll"; op: "lt" | "gt"; value: number }

export type SensorCondition =
  | { port: string; op: "lt" | "gt"; cm: number }
  | { sensorType: "color" | "force" | "imu"; port: string; checks: SensorCheck[] }

export type ControllerAction =
  | { kind: "run"; port: string; speed: number }
  | { kind: "dc"; port: string; power: number }
  | { kind: "angle"; port: string; speed: number; degrees: number }
  | { kind: "time"; port: string; speed: number; ms: number }
  | { kind: "dcTime"; port: string; power: number; ms: number }
  | { kind: "stop"; port: string }
  | { kind: "stopAll" }
  | { kind: "wait"; ms: number }
  | { kind: "waitSensor"; port: string; op?: "lt" | "gt"; cm?: number; sensorType?: "color" | "force" | "imu"; checks?: SensorCheck[] }
  | { kind: "sensorLights"; port: string; brightness: number }
  | { kind: "imuReset" }
  | { kind: "branch"; condition: SensorCondition; thenActions: ControllerAction[]; elseActions: ControllerAction[] }
  | { kind: "loop"; times?: number; condition?: SensorCondition; bodyActions: ControllerAction[] }

export interface ControllerHandler {
  target?: { controlId: string; input: string }
  driveAreaId?: string
  button: ControllerButton
  event: ControllerEvent
  sourceBlockId: string
  actions: ControllerAction[]
}

export interface ProgramError {
  target?: { controlId: string; input: string }
  scope?: "global" | "startup" | "handler"
  severity?: "error" | "warning"
  button?: ControllerButton
  blockId?: string
  code: string
  message: string
}

export interface ControllerProgram {
  projectId: string
  projectName: string
  hub: string
  protocol: 2 | 3
  ports: string[]
  sensorPorts?: string[]
  handlers: ControllerHandler[]
  startup: ControllerAction[]
  errors: ProgramError[]
}

export const CONTROLLER_BUTTONS: readonly ControllerButton[] =
  RawControllerProgram.CONTROLLER_BUTTONS as unknown as readonly ControllerButton[]

export const BUTTON_LABELS: Record<ControllerButton, string> =
  RawControllerProgram.BUTTON_LABELS as unknown as Record<ControllerButton, string>

export const BUTTON_KEYS: Record<string, ControllerButton> =
  RawControllerProgram.BUTTON_KEYS as unknown as Record<string, ControllerButton>

export function compileControllerProgram(project: unknown): ControllerProgram {
  return RawControllerProgram.compileControllerProgram(project) as ControllerProgram
}

export function controllerHandler(
  program: ControllerProgram | null,
  button: ControllerButton | { controlId: string; input: string },
  event: ControllerEvent
): ControllerHandler | null {
  return RawControllerProgram.controllerHandler(program, button, event) as ControllerHandler | null
}

export function controllerRuntimeErrors(
  program: ControllerProgram | null,
  protocol: 2 | 3 | null,
  availablePorts: ReadonlySet<string>,
  availableSensors?: ReadonlySet<string> | null,
  availableSensorTypes?: Readonly<Record<string, string>> | null
): ProgramError[] {
  return RawControllerProgram.controllerRuntimeErrors(program, protocol, availablePorts, availableSensors, availableSensorTypes) as ProgramError[]
}

export function describeAction(action: ControllerAction): string {
  return RawControllerProgram.describeAction(action)
}

export function commandsFor(
  action: ControllerAction,
  protocol: 2 | 3 = 3
): string[] {
  return RawControllerProgram.commandsFor(action, protocol)
}
