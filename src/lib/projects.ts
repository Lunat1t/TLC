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

/** Migration is prepared before readSheets; the original array is backed up first. */
export async function prepareEditorProjects(storage: Storage, projectId: string, locks: LockManager | undefined): Promise<{projects: RobotProject[]; raw: string | null; readOnly?: boolean}> {
  if (!locks) {
    const raw=storage.getItem(STORAGE_KEY)
    if (raw === null) return {projects:[],raw,readOnly:true}
    const parsed:unknown=JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('Список проектов повреждён. Исходные данные сохранены.')
    const clean=parsed.map(validateProject)
    const index=clean.findIndex(p=>p.id===projectId)
    if (index >= 0) {
      const {migrateControlWorkspace}=await import('./control-workspace.ts')
      clean[index]=validateProject(migrateControlWorkspace(parsed[index] as RobotProject).project)
    }
    return {projects:clean,raw,readOnly:true}
  }
  return locks.request('tlc-project-storage', async () => {
    const raw = storage.getItem(STORAGE_KEY)
    if (raw === null) return {projects: [], raw}
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('Список проектов повреждён. Исходные данные сохранены.')
    const clean = parsed.map(validateProject)
    const index = clean.findIndex(p => p.id === projectId)
    if (index < 0) return {projects:clean,raw}
    const {migrateControlWorkspace} = await import('./control-workspace.ts')
    // Keep all unrecognised fields in the original JSON during migration.
    const original = parsed[index] as RobotProject
    const result = migrateControlWorkspace(original)
    if (!result.changed) return {projects:clean,raw}
    const backupKey = `${STORAGE_KEY}.backup.${projectId}`
    if (storage.getItem(backupKey) === null) storage.setItem(backupKey, raw)
    if (storage.getItem(backupKey) !== raw) throw new Error('Не удалось подтвердить резервную копию. Сохранение остановлено.')
    if (storage.getItem(STORAGE_KEY) !== raw) throw new Error('Проекты изменены в другой вкладке. Перезагрузите страницу.')
    const next = parsed.slice(); next[index] = result.project
    const newRaw=JSON.stringify(next)
    storage.setItem(STORAGE_KEY,newRaw)
    return {projects:next.map(validateProject),raw:newRaw}
  })
}

/** Refuse stale writes; the caller updates its expected raw after each write. */
export async function saveEditorProjects(storage: Storage, projects: RobotProject[], expectedRaw: string | null, locks: LockManager | undefined): Promise<string> {
  if (!locks) throw new Error('Безопасное сохранение недоступно.')
  return locks.request('tlc-project-storage', () => {
    const raw=storage.getItem(STORAGE_KEY)
    if(raw!==expectedRaw) throw new Error('Проекты изменены в другой вкладке. Перезагрузите страницу.')
    const next=JSON.stringify(projects.map(validateProject))
    // Retain a recoverable copy of the pre-edit array before the first write.
    const backupKey=`${STORAGE_KEY}.backup.before-edit`
    if (raw !== null && storage.getItem(backupKey) === null) {
      storage.setItem(backupKey, raw)
      if (storage.getItem(backupKey) !== raw) throw new Error('Не удалось подтвердить резервную копию.')
    }
    if (storage.getItem(STORAGE_KEY) !== raw) throw new Error('Проекты изменены в другой вкладке. Перезагрузите страницу.')
    storage.setItem(STORAGE_KEY,next)
    return next
  })
}
