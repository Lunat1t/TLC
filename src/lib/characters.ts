export const CHARACTER_IDS = ["cloud", "rectangle", "square", "triangle", "star"] as const

export type CharacterId = (typeof CHARACTER_IDS)[number]
export type CharacterEmotion = "base" | "joy" | "focus" | "wink" | "sleepy" | "cool"

export type CharacterLook = {
  bodyColor: string
  eyeColor: string
}

export const CHARACTER_CATALOG: {
  id: CharacterId
  label: string
  personality: string
  bodyColor: string
}[] = [
  { id: "cloud", label: "Облачко", personality: "Тихое, задумчивое, любит побыть в своём мире.", bodyColor: "#b79cf5" },
  { id: "rectangle", label: "Прямоугольник", personality: "Заботливый и добрый. Всегда готов помочь.", bodyColor: "#E2A2F6" },
  { id: "square", label: "Квадрат", personality: "Шумный и упрямый. Любит настоять на своём.", bodyColor: "#FF2D2D" },
  { id: "triangle", label: "Треугольник", personality: "Шустрый, легко отвлекается и всегда за игру.", bodyColor: "#FF6E1A" },
  { id: "star", label: "Звезда", personality: "Яркая душа компании. Любит быть среди друзей.", bodyColor: "#FFDF4D" },
]

export const CHARACTER_COLORS = [
  { name: "Голубой", color: "#b79cf5" },
  { name: "Красный", color: "#ef5b64" },
  { name: "Оранжевый", color: "#ff9b45" },
  { name: "Жёлтый", color: "#ffd34e" },
  { name: "Зелёный", color: "#57c785" },
  { name: "Бирюзовый", color: "#b79cf5" },
  { name: "Фиолетовый", color: "#b79cf5" },
  { name: "Розовый", color: "#ee82b4" },
  { name: "Белый", color: "#f6f3ec" },
  { name: "Графитовый", color: "#555047" },
] as const

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === "string" && CHARACTER_IDS.includes(value as CharacterId)
}

export function normalizeCharacterLook(
  id: CharacterId,
  value?: Partial<CharacterLook> | null,
  legacy?: { bodyColor?: string; characterEyeColor?: string } | null,
): CharacterLook {
  const character = CHARACTER_CATALOG.find((item) => item.id === id)!
  const bodyColor = value?.bodyColor || (id === "cloud" ? legacy?.bodyColor : undefined)
  const eyeColor = value?.eyeColor || (id === "cloud" ? legacy?.characterEyeColor : undefined)
  return {
    bodyColor: isHexColor(bodyColor) ? bodyColor : character.bodyColor,
    eyeColor: isHexColor(eyeColor) ? eyeColor : "#ffffff",
  }
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
}
