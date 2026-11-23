import { InstructionError, serverClient } from "./access"
import {
  checkInstructionGateWithClient,
  parseInstructionAccessPayload,
  requireInstructionGateWithClient,
  type GateSupabaseClient,
  type InstructionGateResult,
} from "./roadmap-gate-core"

export { parseInstructionAccessPayload, type InstructionGateResult }

function makeInstructionError(status: number, code: string, message: string) {
  return new InstructionError(status, code, message)
}

export async function checkInstructionGate(slug: string): Promise<InstructionGateResult> {
  const client = (await serverClient()) as unknown as GateSupabaseClient
  return checkInstructionGateWithClient(client, slug, makeInstructionError)
}

export async function requireInstructionGate(slug: string): Promise<void> {
  const client = (await serverClient()) as unknown as GateSupabaseClient
  return requireInstructionGateWithClient(client, slug, makeInstructionError)
}
