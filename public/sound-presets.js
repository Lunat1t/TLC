// Звуки блока «Звук». Их играет динамик хаба, а он умеет только тоны, поэтому
// каждый звук записан нотами. Новый звук добавляется только здесь.
//
// note: [частота начала, частота конца, длительность в мс]; частота 0 — пауза.

export const DEFAULT_SOUND_ID = 'preset:beep';
export const DEFAULT_SOUND_VOLUME = 80;
/** Плавный переход частоты делится на ступеньки такой длины. */
export const SOUND_STEP_MS = 75;

export const SOUND_PRESETS = Object.freeze([
  { id: 'preset:beep', name: 'Бип', notes: [[880, 880, 250]] },
  { id: 'preset:double-beep', name: 'Двойной бип', notes: [[880, 880, 120], [0, 0, 80], [880, 880, 120]] },
  { id: 'preset:start', name: 'Старт', notes: [[440, 440, 180], [0, 0, 120], [440, 440, 180], [0, 0, 120], [880, 880, 500]] },
  { id: 'preset:success', name: 'Победа', notes: [[523, 523, 120], [659, 659, 120], [784, 784, 120], [1047, 1047, 400]] },
  { id: 'preset:error', name: 'Ошибка', notes: [[220, 220, 200], [165, 165, 350]] },
  { id: 'preset:siren', name: 'Сирена', notes: [[500, 1000, 450], [1000, 500, 450], [500, 1000, 450], [1000, 500, 450]] },
  { id: 'preset:horn', name: 'Гудок', notes: [[311, 311, 700]] },
  { id: 'preset:laser', name: 'Лазер', notes: [[1800, 200, 300]] },
  { id: 'preset:jump', name: 'Прыжок', notes: [[300, 900, 225]] },
  { id: 'preset:robot', name: 'Робот', notes: [[700, 700, 100], [400, 400, 100], [950, 950, 100], [0, 0, 75], [550, 550, 150]] },
].map(Object.freeze));

export function findSoundPreset(id) {
  return SOUND_PRESETS.find(preset => preset.id === id) || null;
}

/** Тоны звука по порядку. Незнакомый id играет звук по умолчанию. */
export function soundSteps(id) {
  const preset = findSoundPreset(id) || findSoundPreset(DEFAULT_SOUND_ID);
  return preset.notes.flatMap(([from, to, ms]) => {
    if (from === to) return [{ freq: from, ms }];
    const count = Math.max(2, Math.ceil(ms / SOUND_STEP_MS));
    return Array.from({ length: count }, (_, index) => ({
      freq: Math.round(from + (to - from) * (index / (count - 1))),
      ms: Math.round(ms / count),
    }));
  });
}
