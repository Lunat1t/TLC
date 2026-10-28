export const STORAGE_KEY = "robot-studio-projects-v1"
export const PROJECT_VERSION = 1

export type HubType = "spike" | "ev3"

export const HUBS: Record<HubType, string> = {
  spike: "SPIKE Prime",
  ev3: "LEGO EV3",
}

export interface RobotProject {
  version: number
  id: string
  name: string
  hub: HubType
  createdAt: string
  updatedAt: string
  devices: unknown[]
  workspace: Record<string, unknown> | null
}

export function projectName(value: unknown): string {
  const name = String(value ?? "").trim().replace(/\s+/g, " ")
  if (!name || name.length > 64) {
    throw new Error("Название должно содержать от 1 до 64 символов.")
  }
  return name
}

export function validateProject(value: unknown): RobotProject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Неверный файл проекта.")
  }
  const obj = value as Record<string, unknown>
  if (obj.version !== PROJECT_VERSION || !(String(obj.hub) in HUBS)) {
    throw new Error("Версия или тип робота не поддерживается.")
  }
  if (typeof obj.id !== "string" || !obj.id || typeof obj.createdAt !== "string") {
    throw new Error("Данные проекта повреждены.")
  }
  return {
    version: PROJECT_VERSION,
    id: obj.id,
    name: projectName(obj.name),
    hub: obj.hub as HubType,
    createdAt: obj.createdAt,
    updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : obj.createdAt,
    devices: Array.isArray(obj.devices) ? obj.devices : [],
    workspace:
      obj.workspace && typeof obj.workspace === "object" && !Array.isArray(obj.workspace)
        ? (obj.workspace as Record<string, unknown>)
        : null,
  }
}

export function loadProjects(storage: Storage): RobotProject[] {
  const raw = storage.getItem(STORAGE_KEY)
  if (raw === null) return []
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error("Список проектов повреждён.")
  return parsed.map(validateProject)
}

export function saveProjects(storage: Storage, projects: RobotProject[]): RobotProject[] {
  const clean = projects.map(validateProject)
  storage.setItem(STORAGE_KEY, JSON.stringify(clean))
  return clean
}

export function makeProject(
  name: string,
  hub: HubType,
  id: string,
  date: Date = new Date()
): RobotProject {
  if (!(hub in HUBS)) throw new Error("Выбери тип робота.")
  const time = date.toISOString()
  return validateProject({
    version: PROJECT_VERSION,
    id,
    name,
    hub,
    createdAt: time,
    updatedAt: time,
    devices: [],
    workspace: { blocks: [] },
  })
}

export function importProject(
  json: string,
  id: string,
  date: Date = new Date()
): RobotProject {
  const source = validateProject(JSON.parse(json))
  return validateProject({
    ...source,
    id,
    createdAt: date.toISOString(),
    updatedAt: date.toISOString(),
  })
}
