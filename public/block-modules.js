// Единый реестр модулей блоков.
//
// Блок — это база («Мотор A ↻»), а модули — необязательные детали, из которых
// ученик собирает нужное действие: второй мотор, скорость, ход (ограничитель).
// Здесь описано всё, что знают о модулях редактор, проверка и экспорт:
// какие модули есть у какого блока, что с чем не сочетается, какие значения
// подставляются при добавлении и какие тексты показываются. Остальной код
// не должен хранить эти правила у себя.

/** 100 % скорости = 1000 °/с. В блоке хранится °/с, ученик видит проценты. */
export const SPEED_PERCENT_STEP = 10;
export const DEFAULT_SPEED_PERCENT = 50;
export const DEFAULT_LOOP_TIMES = 4;
export const MAX_LOOP_TIMES = 999;

export function speedToPercent(speed) {
  const value = Number.isFinite(Number(speed)) ? Number(speed) : 360;
  return Math.max(1, Math.min(100, Math.round(value / SPEED_PERCENT_STEP)));
}

export function percentToSpeed(percent) {
  const value = Number.isFinite(Number(percent)) ? Number(percent) : DEFAULT_SPEED_PERCENT;
  return Math.max(1, Math.min(100, Math.round(value))) * SPEED_PERCENT_STEP;
}

/**
 * placement: 'base'  — модуль меняет базовую строку блока (второй мотор);
 *            'chip'  — модуль показывается отдельной «таблеткой» справа.
 * icon:      ключ значка для интерфейса или null, если у модуля только имя.
 * chip:      как рисуется таблетка: подпись перед полем и единица после него;
 *            `badge: false` — без кнопки-значка, убрать модуль можно через меню «+».
 * conflicts: модули, которые убираются при добавлении этого.
 */
export const MODULE_DEFS = Object.freeze({
  pair: Object.freeze({
    id: 'pair',
    label: 'Мотор 2',
    placement: 'base',
    icon: null,
    title: 'Второй мотор',
    description: 'Крутит два мотора вместе в одном шаге.',
    conflicts: Object.freeze([]),
  }),
  speed: Object.freeze({
    id: 'speed',
    label: 'Скорость %',
    placement: 'chip',
    icon: 'gauge',
    title: 'Скорость (%)',
    description: 'Скорость мотора в процентах от максимальной.',
    chip: Object.freeze({ prefix: 'со скоростью', unit: '%' }),
    conflicts: Object.freeze(['power']),
    overrides: Object.freeze({
      chassis: Object.freeze({
        title: 'Скорость шасси (%)',
        description: 'Меняет скорость обоих колёс только для этого блока.',
      }),
    }),
  }),
  power: Object.freeze({
    id: 'power',
    label: 'Мощность %',
    placement: 'chip',
    icon: 'zap',
    title: 'Мощность (%)',
    description: 'Задаёт силу мотора в процентах.',
    chip: Object.freeze({ prefix: 'с мощностью', unit: '%' }),
    conflicts: Object.freeze(['speed']),
  }),
  times: Object.freeze({
    id: 'times',
    label: 'Сколько раз',
    placement: 'chip',
    icon: null,
    title: 'Сколько раз',
    description: 'Повторить столько раз и пойти дальше. Без этого модуля цикл повторяется всегда.',
    chip: Object.freeze({ prefix: '', unit: 'раз', badge: false }),
    conflicts: Object.freeze(['while']),
  }),
  while: Object.freeze({
    id: 'while',
    label: 'Пока датчик',
    placement: 'base',
    icon: null,
    title: 'Пока датчик',
    description: 'Повторять, пока условие верно. Датчик вставляется в овал после слова «Пока».',
    conflicts: Object.freeze(['times']),
  }),
  travel: Object.freeze({
    id: 'travel',
    label: 'Ход',
    placement: 'chip',
    icon: null,
    title: 'Ход',
    description: 'Через сколько оборотов, градусов или секунд остановиться.',
    chip: Object.freeze({ prefix: 'на', unit: null, badge: false }),
    conflicts: Object.freeze([]),
  }),
});

/**
 * menu:     модули, которые предлагает меню «+», в порядке показа;
 * legacy:   модули старых проектов — открываются и работают, но в меню их нет;
 * required: модули, без которых экспорт Pybricks отказывается собирать блок.
 *           Пульт исполняет такой блок и без них (мотор едет, пока его не
 *           остановят), поэтому правило относится только к экспорту.
 * fallback: набор модулей, если в проекте поле `modules` отсутствует.
 */
export const BLOCK_MODULES = Object.freeze({
  drive: Object.freeze({
    menu: Object.freeze(['pair', 'speed', 'travel']),
    legacy: Object.freeze(['power']),
    required: Object.freeze(['travel']),
    fallback: Object.freeze(['travel']),
  }),
  pair: Object.freeze({
    menu: Object.freeze(['pair', 'speed', 'travel']),
    legacy: Object.freeze(['power']),
    required: Object.freeze(['travel']),
    fallback: Object.freeze(['travel']),
  }),
  loop: Object.freeze({
    menu: Object.freeze(['times', 'while']),
    legacy: Object.freeze([]),
    required: Object.freeze([]),
    fallback: Object.freeze([]),
  }),
  chassis: Object.freeze({
    menu: Object.freeze(['speed', 'travel']),
    legacy: Object.freeze([]),
    required: Object.freeze([]),
    fallback: Object.freeze([]),
  }),
});

function config(blockType) {
  return BLOCK_MODULES[blockType] || null;
}

/** Все модули, которые блок принимает при чтении проекта. */
export function allowedModules(blockType) {
  const c = config(blockType);
  return c ? [...c.menu, ...c.legacy] : [];
}

/** Описания модулей для меню «+», в порядке показа. */
export function moduleMenu(blockType) {
  const c = config(blockType);
  return c ? c.menu.map(id => MODULE_DEFS[id]) : [];
}

/** Название и описание модуля с учётом особенностей блока (например, шасси). */
export function moduleInfo(blockType, id) {
  const def = MODULE_DEFS[id];
  if (!def) return null;
  const own = def.overrides && def.overrides[blockType];
  return {
    title: (own && own.title) || def.title,
    description: (own && own.description) || def.description,
  };
}

/** Оставляет известные блоку модули без повторов; без списка берёт набор по умолчанию. */
export function normalizeModules(blockType, raw) {
  const c = config(blockType);
  if (!c) return [];
  if (!Array.isArray(raw)) return [...c.fallback];
  const allowed = allowedModules(blockType);
  return [...new Set(raw.map(String).filter(id => allowed.includes(id)))];
}

/** Включает или выключает модуль; при включении убирает несовместимые. */
export function toggleModule(blockType, modules, id) {
  const current = Array.isArray(modules) ? modules : [];
  if (!allowedModules(blockType).includes(id)) return { modules: current, active: current.includes(id) };
  if (current.includes(id)) {
    return { modules: current.filter(m => m !== id), active: false };
  }
  const conflicts = (MODULE_DEFS[id] && MODULE_DEFS[id].conflicts) || [];
  return { modules: [...current.filter(m => !conflicts.includes(m)), id], active: true };
}

/** Значения полей блока, которые подставляются, когда модуль только что добавлен. */
export function moduleAddPatch(blockType, id, block = {}) {
  switch (id) {
    case 'pair':
      return { motor2: (block.motor || 'A') === 'B' ? 'A' : 'B', direction2: 'backward' };
    case 'speed':
      return { speed: percentToSpeed(DEFAULT_SPEED_PERCENT) };
    case 'power':
      return { unit: 'seconds' };
    case 'times':
      return { times: DEFAULT_LOOP_TIMES };
    default:
      return {};
  }
}

/** Модули блока в порядке показа: сначала меню, затем модули старых проектов. */
export function activeModules(blockType, modules, placement) {
  const c = config(blockType);
  if (!c || !Array.isArray(modules)) return [];
  return [...c.menu, ...c.legacy]
    .filter(id => modules.includes(id))
    .map(id => MODULE_DEFS[id])
    .filter(def => !placement || def.placement === placement);
}

const SECONDS = 'seconds';

/**
 * Правила сочетания модулей. Возвращает список проблем
 * `{ code, message, short }`: `message` — подробный текст для экспорта,
 * `short` — короткая подсказка у блока на пульте.
 * target 'export' добавляет правила, которые нужны только для сборки Python.
 */
export function validateModuleRules(blockType, block, { target = 'runtime' } = {}) {
  const c = config(blockType);
  if (!c || !block || typeof block !== 'object') return [];
  const modules = Array.isArray(block.modules) ? block.modules : [];
  const problems = [];

  if (modules.includes('speed') && modules.includes('power')) {
    problems.push({
      code: 'speed-and-power',
      message: 'Выберите скорость или мощность, а не оба режима.',
      short: 'Выберите скорость или мощность',
    });
  }
  if (target === 'export') {
    for (const id of c.required) {
      if (!modules.includes(id)) {
        problems.push({
          code: `missing-${id}`,
          message: 'Добавьте модуль «Величина движения», чтобы задать остановку мотора.',
          short: 'Добавьте модуль «Ход»',
        });
      }
    }
  }
  if (modules.includes('power') && modules.includes('travel') && block.unit !== SECONDS) {
    problems.push({
      code: 'power-travel',
      message: 'Для мощности выберите секунды. Для точных оборотов и градусов используйте скорость.',
      short: 'Для мощности выберите секунды',
    });
  }
  return problems;
}
