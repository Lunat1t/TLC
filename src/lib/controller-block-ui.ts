import type { ControllerEvent, ImuAxis, SensorColor, SensorModule, SensorType, TravelUnit } from "./workspace"
import type { SensorTelemetry } from "./controller-runtime"

export const TRAVEL_UNIT_ORDER: readonly TravelUnit[] = ["rotations", "degrees", "seconds"]

export const TRAVEL_UNIT_LABELS: Record<TravelUnit, string> = {
  rotations: "об",
  degrees: "°",
  seconds: "с",
}

export const TRAVEL_UNIT_ARIA_LABELS: Record<TravelUnit, string> = {
  rotations: "обороты",
  degrees: "градусы",
  seconds: "секунды",
}

export function nextTravelUnit(current?: TravelUnit): TravelUnit {
  const idx = current ? TRAVEL_UNIT_ORDER.indexOf(current) : -1
  return TRAVEL_UNIT_ORDER[(idx + 1) % TRAVEL_UNIT_ORDER.length]
}

export const SENSOR_LIGHT_ORDER: readonly number[] = [100, 50, 25, -1]

export const SENSOR_LIGHT_LABELS: Record<number, string> = {
  100: "100%",
  50: "50%",
  25: "25%",
  [-1]: "Выкл",
}

export function formatSensorLightLabel(light?: number): string {
  if (typeof light === "number" && light in SENSOR_LIGHT_LABELS) {
    return SENSOR_LIGHT_LABELS[light]
  }
  return typeof light === "number" && Number.isFinite(light) ? `${light}%` : "100%"
}

export function nextSensorLight(current?: number): number {
  const idx = typeof current === "number" ? SENSOR_LIGHT_ORDER.indexOf(current) : -1
  return SENSOR_LIGHT_ORDER[(idx + 1) % SENSOR_LIGHT_ORDER.length]
}

export const CONTROLLER_EVENT_ORDER: readonly ControllerEvent[] = ["hold", "pressed", "released"]

export const CONTROLLER_EVENT_LABELS: Record<ControllerEvent, string> = {
  hold: "Пока нажата",
  pressed: "Нажата",
  released: "Отпущена",
}

export function nextControllerEvent(current?: ControllerEvent): ControllerEvent {
  const idx = current ? CONTROLLER_EVENT_ORDER.indexOf(current) : -1
  return CONTROLLER_EVENT_ORDER[(idx + 1) % CONTROLLER_EVENT_ORDER.length]
}

export const COLOR_SWATCH_STYLES: Record<SensorColor, { hex: string; label: string }> = {
  red: { hex: "#ef4444", label: "Красный" },
  yellow: { hex: "#c4a6ec", label: "Жёлтый" },
  green: { hex: "#7392b5", label: "Зелёный" },
  blue: { hex: "#8350c4", label: "Синий" },
  white: { hex: "#f1f7fa", label: "Белый" },
  black: { hex: "#1c1a19", label: "Чёрный" },
  none: { hex: "transparent", label: "Нет цвета" },
}

export interface SensorLiveBadge {
  kind: "text" | "color"
  text?: string
  hex?: string
  label: string
  minWidthClass: string
}

function isFiniteNum(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

export function formatSensorLiveBadge({
  module,
  port,
  sensorType,
  tiltAxis,
  sensorDistances,
  sensorTelemetry,
}: {
  module: SensorModule
  port: string
  sensorType: SensorType
  tiltAxis: ImuAxis
  sensorDistances?: Record<string, number | null>
  sensorTelemetry?: Record<string, SensorTelemetry>
}): SensorLiveBadge | null {
  const telKey = sensorType === "imu" ? "IMU" : port
  const tel = sensorTelemetry?.[telKey]

  switch (module) {
    case "threshold": {
      const dist = sensorDistances?.[port]
      if (isFiniteNum(dist)) {
        const rounded = Math.round(dist)
        return {
          kind: "text",
          text: `${rounded} см`,
          label: `Текущее расстояние: ${rounded} см`,
          minWidthClass: "min-w-[44px]",
        }
      }
      return {
        kind: "text",
        text: "—",
        label: "Текущее расстояние: нет данных",
        minWidthClass: "min-w-[44px]",
      }
    }
    case "color": {
      const rawColor = tel?.color
      if (rawColor === undefined || rawColor === null || rawColor === "") {
        return {
          kind: "text",
          text: "—",
          label: "Текущий цвет: нет данных",
          minWidthClass: "min-w-[26px]",
        }
      }
      if (rawColor === "none" || !(rawColor in COLOR_SWATCH_STYLES)) {
        return {
          kind: "text",
          text: "∅",
          label: "Текущий цвет: нет цвета",
          minWidthClass: "min-w-[26px]",
        }
      }
      const swatch = COLOR_SWATCH_STYLES[rawColor as SensorColor]
      return {
        kind: "color",
        hex: swatch.hex,
        label: `Текущий цвет: ${swatch.label}`,
        minWidthClass: "min-w-[26px]",
      }
    }
    case "reflection": {
      const refl = tel?.reflection
      if (isFiniteNum(refl)) {
        const rounded = Math.round(refl)
        return {
          kind: "text",
          text: `${rounded}%`,
          label: `Текущее отражение: ${rounded}%`,
          minWidthClass: "min-w-[36px]",
        }
      }
      return {
        kind: "text",
        text: "—",
        label: "Текущее отражение: нет данных",
        minWidthClass: "min-w-[36px]",
      }
    }
    case "pressed": {
      const pressed = tel?.pressed
      if (typeof pressed === "boolean") {
        return {
          kind: "text",
          text: pressed ? "●" : "○",
          label: pressed ? "Текущее состояние: нажата" : "Текущее состояние: отпущена",
          minWidthClass: "min-w-[22px]",
        }
      }
      return {
        kind: "text",
        text: "—",
        label: "Текущее состояние: нет данных",
        minWidthClass: "min-w-[22px]",
      }
    }
    case "force": {
      const force = tel?.force
      if (isFiniteNum(force)) {
        const formatted = Number(force.toFixed(1))
        return {
          kind: "text",
          text: `${formatted} Н`,
          label: `Текущая сила: ${formatted} Н`,
          minWidthClass: "min-w-[38px]",
        }
      }
      return {
        kind: "text",
        text: "—",
        label: "Текущая сила: нет данных",
        minWidthClass: "min-w-[38px]",
      }
    }
    case "heading": {
      const heading = sensorTelemetry?.IMU?.heading
      if (isFiniteNum(heading)) {
        const rounded = Math.round(heading)
        return {
          kind: "text",
          text: `${rounded}°`,
          label: `Текущий курс: ${rounded}°`,
          minWidthClass: "min-w-[40px]",
        }
      }
      return {
        kind: "text",
        text: "—",
        label: "Текущий курс: нет данных",
        minWidthClass: "min-w-[40px]",
      }
    }
    case "tilt": {
      const imu = sensorTelemetry?.IMU
      const val = tiltAxis === "roll" ? imu?.roll : imu?.pitch
      const axisName = tiltAxis === "roll" ? "крен" : "тангаж"
      if (isFiniteNum(val)) {
        const rounded = Math.round(val)
        return {
          kind: "text",
          text: `${rounded}°`,
          label: `Текущий наклон (${axisName}): ${rounded}°`,
          minWidthClass: "min-w-[40px]",
        }
      }
      return {
        kind: "text",
        text: "—",
        label: `Текущий наклон (${axisName}): нет данных`,
        minWidthClass: "min-w-[40px]",
      }
    }
    default:
      return null
  }
}

export function computePopoverPlacement(
  rect: { left: number; top: number; bottom: number },
  viewport: { width: number; height: number }
): { alignLeft: boolean; openUp: boolean } {
  const alignLeft = rect.left < 190 && rect.left + 196 <= viewport.width
  const spaceBelow = viewport.height - rect.bottom
  const openUp = spaceBelow < 190 && rect.top > spaceBelow
  return { alignLeft, openUp }
}

import type { DriveSettings } from "./block-registry"
import {
  DEFAULT_SENSOR_ANGLE,
  DEFAULT_SENSOR_AXIS,
  DEFAULT_SENSOR_COLOR,
  DEFAULT_SENSOR_DISTANCE,
  DEFAULT_SENSOR_FORCE,
  DEFAULT_SENSOR_LIGHT,
  DEFAULT_SENSOR_MODULE,
  DEFAULT_SENSOR_REFLECTION,
  DEFAULT_SENSOR_TILT,
  SENSOR_MODULES_BY_TYPE,
  getStopPorts,
  isPairedBlock,
} from "./block-registry.ts"
import type { ChassisDirection, SensorOp, WorkspaceBlock } from "./workspace"

export interface ModuleDescription {
  title: string
  description: string
}

export const SENSOR_MODULE_INFO: Record<SensorModule, ModuleDescription> = {
  threshold: { title: "Расстояние до стены", description: "Проверяет, как далеко стена в сантиметрах." },
  lights: { title: "Подсветка датчика", description: "Включает или выключает огонёк на датчике." },
  color: { title: "Цвет", description: "Определяет цвет предмета под датчиком." },
  reflection: { title: "Яркость света", description: "Измеряет, сколько света отражается от пола." },
  pressed: { title: "Нажатие кнопки", description: "Проверяет, нажата кнопка датчика или отпущена." },
  force: { title: "Сила нажатия", description: "Измеряет, насколько сильно нажали на датчик." },
  heading: { title: "Поворот (курс)", description: "Показывает, на сколько градусов повернулся хаб." },
  tilt: { title: "Наклон хаба", description: "Проверяет наклон хаба вперёд-назад или вбок." },
  reset: { title: "Сброс курса в 0°", description: "Запоминает текущее направление как 0 градусов." },
}

export const DRIVE_MODULE_INFO: Record<"pair" | "speed" | "power" | "travel", ModuleDescription> = {
  pair: { title: "Второй мотор", description: "Крутит два мотора вместе в одном шаге." },
  speed: { title: "Скорость (°/с)", description: "Задаёт скорость вращения мотора." },
  power: { title: "Мощность (%)", description: "Задаёт силу мотора в процентах." },
  travel: { title: "Сколько ехать", description: "Через сколько оборотов, градусов или секунд остановиться." },
}

export const CHASSIS_MODULE_INFO: Record<"speed" | "travel", ModuleDescription> = {
  speed: { title: "Скорость шасси", description: "Меняет скорость обоих колёс только для этого блока." },
  travel: { title: "Сколько ехать", description: "Через сколько оборотов, градусов или секунд остановиться." },
}

export function getSensorComparisonWord(
  kind: "threshold" | "reflection" | "force" | "heading" | "tilt",
  op: SensorOp
): string {
  switch (kind) {
    case "threshold":
      return op === "lt" ? "ближе" : "дальше"
    case "reflection":
      return op === "lt" ? "темнее" : "светлее"
    case "force":
      return op === "lt" ? "слабее" : "сильнее"
    case "heading":
    case "tilt":
      return op === "lt" ? "меньше" : "больше"
  }
}

const TRAVEL_WORD: Record<TravelUnit, string> = {
  rotations: "об",
  degrees: "°",
  seconds: "с",
}

const CHASSIS_DIR_WORDS: Record<ChassisDirection, string> = {
  forward: "вперёд",
  backward: "назад",
  left: "налево",
  right: "направо",
}

const BUTTON_WORDS: Record<string, string> = {
  up: "Вверх",
  down: "Вниз",
  left: "Влево",
  right: "Вправо",
  a: "A",
  b: "B",
  x: "X",
  y: "Y",
  l: "L",
  r: "R",
  blue: "Синяя",
  red: "Красная",
  green: "Зелёная",
  yellow: "Жёлтая",
}

function describeSensorPhrase(block: WorkspaceBlock): string {
  const sensorType: SensorType = block.sensorType || "ultrasonic"
  const port = block.sensorPort || "C"
  const allowed = SENSOR_MODULES_BY_TYPE[sensorType]
  const rawMods = Array.isArray(block.sensorModules)
    ? block.sensorModules.filter((m) => allowed.includes(m))
    : [DEFAULT_SENSOR_MODULE[sensorType]]
  const slotted = block.branch === "condition"
  const filteredMods = slotted && sensorType === "imu" ? rawMods.filter((m) => m !== "reset") : rawMods
  const mods = filteredMods.length > 0 ? filteredMods : [DEFAULT_SENSOR_MODULE[sensorType]]
  const op: SensorOp = block.sensorOp === "gt" ? "gt" : "lt"

  const parts: string[] = []
  if ((sensorType === "ultrasonic" || sensorType === "color") && mods.includes("lights")) {
    const light = block.sensorLight ?? DEFAULT_SENSOR_LIGHT
    parts.push(light < 0 ? `выключить подсветку на ${port}` : `подсветка на ${port}: ${light}%`)
  }
  if (sensorType === "imu" && mods.includes("reset")) {
    parts.push("сбросить курс на 0°")
  }
  if (sensorType === "ultrasonic" && mods.includes("threshold")) {
    const cm = block.sensorDistance ?? DEFAULT_SENSOR_DISTANCE
    parts.push(`датчик на ${port} видит стену ${getSensorComparisonWord("threshold", op)} ${cm} см`)
  }
  if (sensorType === "color" && mods.includes("color")) {
    const color = block.sensorColor || DEFAULT_SENSOR_COLOR
    const colorName = COLOR_SWATCH_STYLES[color]?.label?.toLowerCase() || color
    parts.push(color === "none" ? `датчик цвета на ${port} не видит цвет` : `датчик цвета на ${port} видит ${colorName}`)
  }
  if (sensorType === "color" && mods.includes("reflection")) {
    const refl = block.sensorReflection ?? DEFAULT_SENSOR_REFLECTION
    parts.push(`свет на ${port} ${getSensorComparisonWord("reflection", op)} ${refl}%`)
  }
  if (sensorType === "force" && mods.includes("pressed")) {
    const pressed = block.sensorPressed !== false
    parts.push(`кнопка на ${port} ${pressed ? "нажата" : "отпущена"}`)
  }
  if (sensorType === "force" && mods.includes("force")) {
    const force = block.sensorForce ?? DEFAULT_SENSOR_FORCE
    parts.push(`сила на ${port} ${getSensorComparisonWord("force", op)} ${force} Н`)
  }
  if (sensorType === "imu" && mods.includes("heading")) {
    const deg = block.sensorAngle ?? DEFAULT_SENSOR_ANGLE
    parts.push(`поворот хаба ${getSensorComparisonWord("heading", op)} ${deg}°`)
  }
  if (sensorType === "imu" && mods.includes("tilt")) {
    const axis = block.sensorAxis === "roll" ? "вбок" : "вперёд-назад"
    const tiltOp: SensorOp = (block.sensorTiltOp ?? block.sensorOp) === "gt" ? "gt" : "lt"
    const deg = block.sensorTilt ?? DEFAULT_SENSOR_TILT
    parts.push(`наклон хаба ${axis} ${getSensorComparisonWord("tilt", tiltOp)} ${deg}°`)
  }

  return parts.join(" и ") || `датчик на ${port}`
}

export function describeBlockForKid(
  block: WorkspaceBlock | undefined,
  allBlocks: WorkspaceBlock[],
  chassis?: DriveSettings
): string {
  if (!block) return ""
  switch (block.type) {
    case "start":
      return "Когда нажмёшь «Запуск» — блоки под ним выполняются по очереди сверху вниз."
    case "button": {
      const btnKey = block.target?.input || block.button || "up"
      const btnName = BUTTON_WORDS[btnKey] || btnKey.toUpperCase()
      const ev = block.event === "hold" ? "Пока держишь" : block.event === "released" ? "Когда отпустишь" : "Когда нажмёшь"
      return `${ev} кнопку «${btnName}» — сработают блоки снизу.`
    }
    case "motor-buttons":
      return "Пульт с цветными кнопками: жми на них при запуске, чтобы управлять роботом."
    case "stop": {
      const stopInfo = getStopPorts(block)
      return stopInfo.stopAll
        ? "Остановить сразу все моторы."
        : `Остановить ${stopInfo.ports.length > 1 ? "моторы" : "мотор"} ${stopInfo.ports.join(" и ")}.`
    }
    case "chassis": {
      const dir = CHASSIS_DIR_WORDS[block.chassisDirection || "forward"]
      const mods = block.modules || []
      const parts = [`Робот едет ${dir}`]
      if (mods.includes("speed")) parts.push(`со скоростью ${block.speed ?? chassis?.speed ?? 360}°/с`)
      if (mods.includes("travel")) {
        const unit = TRAVEL_WORD[block.unit || "rotations"]
        parts.push(`на ${block.value ?? 1} ${unit}`)
      }
      return parts.join(" ") + "."
    }
    case "drive":
    case "pair": {
      const p1 = block.motor || "A"
      const d1 = block.direction === "backward" ? "назад" : "вперёд"
      const paired = isPairedBlock(block)
      const mods = block.modules || []
      const parts = [
        paired
          ? `Мотор ${p1} ${d1} и мотор ${block.motor2 || "B"} ${block.direction2 === "backward" ? "назад" : "вперёд"}`
          : `Мотор ${p1} крутится ${d1}`,
      ]
      if (mods.includes("speed")) parts.push(`со скоростью ${block.speed ?? 360}°/с`)
      else if (mods.includes("power")) parts.push(`с мощностью ${block.power ?? 50}%`)
      if (mods.includes("travel")) parts.push(`на ${block.value ?? 1} ${TRAVEL_WORD[block.unit || "rotations"]}`)
      return parts.join(" ") + "."
    }
    case "sensor": {
      const phrase = describeSensorPhrase(block)
      if (block.branch === "condition") {
        return `Условие: ${phrase}.`
      }
      const sensorType: SensorType = block.sensorType || "ultrasonic"
      const allowed = SENSOR_MODULES_BY_TYPE[sensorType]
      const rawMods = Array.isArray(block.sensorModules)
        ? block.sensorModules.filter((m) => allowed.includes(m))
        : [DEFAULT_SENSOR_MODULE[sensorType]]
      const mods = rawMods.length > 0 ? rawMods : [DEFAULT_SENSOR_MODULE[sensorType]]
      if (mods.length === 1 && mods[0] === "lights") return `${phrase[0].toUpperCase() + phrase.slice(1)}.`
      if (mods.length === 1 && mods[0] === "reset") return "Сбросить курс хаба на 0°."
      return `Ждать: ${phrase}.`
    }
    case "if": {
      const cond = allBlocks.find((b) => b.parentId === block.id && b.branch === "condition")
      if (cond && cond.type === "sensor") {
        return `Если ${describeSensorPhrase(cond)} — сделать верхние блоки, иначе — нижние.`
      }
      return "Если условие в овале верно — сделать верхние блоки, иначе — нижние."
    }
    default:
      return ""
  }
}
