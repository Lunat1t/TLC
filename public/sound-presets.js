// Готовые звуки библиотеки. Они не лежат файлами: звук считается из нот прямо
// в браузере, поэтому работает без сети. Новый готовый звук добавляется только здесь.
//
// note: [частота начала, частота конца, длительность в секундах, форма волны]
// Частота 0 означает паузу.

export const DEFAULT_SOUND_ID = 'preset:beep';
export const DEFAULT_SOUND_VOLUME = 80;

export const SOUND_PRESETS = Object.freeze([
  { id: 'preset:beep', name: 'Бип', notes: [[880, 880, 0.25, 'square']] },
  { id: 'preset:double-beep', name: 'Двойной бип', notes: [[880, 880, 0.12, 'square'], [0, 0, 0.08], [880, 880, 0.12, 'square']] },
  { id: 'preset:start', name: 'Старт', notes: [[440, 440, 0.18], [0, 0, 0.12], [440, 440, 0.18], [0, 0, 0.12], [880, 880, 0.5]] },
  { id: 'preset:success', name: 'Победа', notes: [[523, 523, 0.12], [659, 659, 0.12], [784, 784, 0.12], [1047, 1047, 0.4]] },
  { id: 'preset:error', name: 'Ошибка', notes: [[220, 220, 0.2, 'square'], [165, 165, 0.35, 'square']] },
  { id: 'preset:siren', name: 'Сирена', notes: [[500, 1000, 0.45], [1000, 500, 0.45], [500, 1000, 0.45], [1000, 500, 0.45]] },
  { id: 'preset:horn', name: 'Гудок', notes: [[311, 311, 0.7, 'saw']] },
  { id: 'preset:laser', name: 'Лазер', notes: [[1800, 200, 0.28, 'square']] },
  { id: 'preset:jump', name: 'Прыжок', notes: [[300, 900, 0.22]] },
  { id: 'preset:robot', name: 'Робот', notes: [[700, 700, 0.07, 'square'], [400, 400, 0.07, 'square'], [950, 950, 0.07, 'square'], [0, 0, 0.05], [550, 550, 0.14, 'square']] },
].map(Object.freeze));

export function findSoundPreset(id) {
  return SOUND_PRESETS.find(preset => preset.id === id) || null;
}
