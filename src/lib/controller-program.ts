// Typed re-export of public/controller-program.js
import * as RawControllerProgram from "../../public/controller-program.js"

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

export type ControllerEvent = "pressed" | "released"

export type ControllerAction =
  | { kind: "run"; port: string; speed: number }
  | { kind: "dc"; port: string; power: number }
  | { kind: "angle"; port: string; speed: number; degrees: number }
  | { kind: "time"; port: string; speed: number; ms: number }
  | { kind: "dcTime"; port: string; power: number; ms: number }
  | { kind: "stop"; port: string }
  | { kind: "wait"; ms: number }

export interface ControllerHandler {
  target?: { controlId: string; input: string }
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
  availablePorts: ReadonlySet<string>
): ProgramError[] {
  return RawControllerProgram.controllerRuntimeErrors(program, protocol, availablePorts) as ProgramError[]
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
