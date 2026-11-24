import { InstructionError } from "./instructions/access"
import { validateProject } from "./projects"

export const PROJECT_MAX_BYTES = 3_500_000
export const PROJECT_BODY_MAX_BYTES = 3_600_000
export const PROJECT_PAGE_SIZE = 100
export const projectHeaders = { "Cache-Control": "private, no-store" }

export function validateProjectId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value || value === "." || value === ".." || new TextEncoder().encode(value).byteLength > 1024 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new InstructionError(400, "invalid_project_id", "Неверный идентификатор программы.")
  }
}

/** Validate without rewriting the record: unknown fields and workspace payload stay intact. */
export function validateProjectValue(id: string, value: unknown) {
  if (value === null) return
  try {
    const clean = validateProject(value)
    const original = value as Record<string, unknown>
    if (clean.id !== id || (clean.hub !== "spike" && clean.hub !== "ev3") || typeof original.name !== "string") throw Error()
    if (original.devices !== undefined && !Array.isArray(original.devices)) throw Error()
    if (original.workspace !== undefined && original.workspace !== null && (typeof original.workspace !== "object" || Array.isArray(original.workspace))) throw Error()
    if (original.updatedAt !== undefined && typeof original.updatedAt !== "string") throw Error()
  } catch {
    throw new InstructionError(400, "invalid_project", "Данные программы повреждены или её идентификатор не совпадает.")
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > PROJECT_MAX_BYTES) {
    throw new InstructionError(413, "project_size", "Программа слишком большая. Максимум — 3,5 МБ на одну программу.")
  }
}

export function validateProjectRevision(value: unknown): asserts value is number {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) >= 2_147_483_647) {
    throw new InstructionError(400, "invalid_revision", "Неверная версия программы.")
  }
}

export function projectDatabaseError(error: { code?: string; message?: string }): never {
  if (error.code === "23514" && error.message?.includes("account_projects_value_size")) {
    throw new InstructionError(413, "project_size", "Программа слишком большая. Максимум — 3,5 МБ на одну программу.")
  }
  if (error.code === "23514" || error.code === "22023") {
    throw new InstructionError(400, "invalid_project", "Неверные данные программы.")
  }
  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code || "")) {
    throw new InstructionError(503, "projects_migration_required", "Новое хранилище программ ещё не настроено. Повторите позже.")
  }
  throw new InstructionError(503, "projects_unavailable", "Облачное хранилище программ временно недоступно.")
}
