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
  yellow: { hex: "#facc15", label: "Жёлтый" },
  green: { hex: "#22c55e", label: "Зелёный" },
  blue: { hex: "#3b82f6", label: "Синий" },
  white: { hex: "#f8fafc", label: "Белый" },
  black: { hex: "#0f172a", label: "Чёрный" },
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
