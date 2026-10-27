export const STORAGE_KEY = 'robot-studio-projects-v1';
export const PROJECT_VERSION = 1;
export const HUBS = Object.freeze({spike: 'SPIKE Prime', ev3: 'LEGO EV3'});

export function projectName(value) {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 64) throw new Error('Название должно содержать от 1 до 64 символов.');
  return name;
}

export function validateProject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Неверный файл проекта.');
  if (value.version !== PROJECT_VERSION || !Object.hasOwn(HUBS, value.hub)) throw new Error('Версия или тип робота не поддерживается.');
  if (typeof value.id !== 'string' || !value.id || typeof value.createdAt !== 'string') throw new Error('Данные проекта повреждены.');
  return {
    version: PROJECT_VERSION,
    id: value.id,
    name: projectName(value.name),
    hub: value.hub,
    createdAt: value.createdAt,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : value.createdAt,
    devices: Array.isArray(value.devices) ? value.devices : [],
    workspace: value.workspace && typeof value.workspace === 'object' && !Array.isArray(value.workspace) ? value.workspace : null,
  };
}

export function loadProjects(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Список проектов повреждён.');
  return parsed.map(validateProject);
}

export function saveProjects(storage, projects) {
  const clean = projects.map(validateProject);
  storage.setItem(STORAGE_KEY, JSON.stringify(clean));
  return clean;
}

export function makeProject(name, hub, id, date = new Date()) {
  if (!Object.hasOwn(HUBS, hub)) throw new Error('Выбери тип робота.');
  const time = date.toISOString();
  return validateProject({
    version: PROJECT_VERSION,
    id,
    name,
    hub,
    createdAt: time,
    updatedAt: time,
    devices: [],
    workspace: null,
  });
}

export function importProject(json, id, date = new Date()) {
  const source = validateProject(JSON.parse(json));
  return validateProject({...source, id, createdAt: date.toISOString(), updatedAt: date.toISOString()});
}
