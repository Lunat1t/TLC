import * as RawRegistry from "../../public/block-registry.js"

export type HubId = "spike" | "ev3"
export type DrivePort = "A" | "B" | "C" | "D" | "E" | "F"
export type SensorPort = "C" | "D" | "E" | "F"
export type SensorType = "ultrasonic" | "color" | "force" | "imu"
export type SensorOp = "lt" | "gt"
export type SensorModule =
  | "threshold"
  | "lights"
  | "color"
  | "reflection"
  | "pressed"
  | "force"
  | "heading"
  | "tilt"
  | "reset"
export type SensorColor = "red" | "yellow" | "green" | "blue" | "white" | "black" | "none"
export type ImuAxis = "pitch" | "roll"
export type ChassisDirection = "forward" | "backward" | "left" | "right"

export interface DriveSettings {
  leftPort: DrivePort
  rightPort: DrivePort
  leftReversed: boolean
  rightReversed: boolean
  speed?: number
}

export const HUB_PORTS = RawRegistry.HUB_PORTS as Readonly<Record<HubId, readonly string[]>>
export const DRIVE_PORTS = RawRegistry.DRIVE_PORTS as readonly DrivePort[]
export const SENSOR_PORTS = RawRegistry.SENSOR_PORTS as readonly SensorPort[]
export const SENSOR_TYPES = RawRegistry.SENSOR_TYPES as readonly SensorType[]
export const SENSOR_MODULES = RawRegistry.SENSOR_MODULES as readonly SensorModule[]
export const SENSOR_MODULES_BY_TYPE = RawRegistry.SENSOR_MODULES_BY_TYPE as Readonly<Record<SensorType, readonly SensorModule[]>>
export const DEFAULT_SENSOR_MODULE = RawRegistry.DEFAULT_SENSOR_MODULE as Readonly<Record<SensorType, SensorModule>>
export const SENSOR_COLORS = RawRegistry.SENSOR_COLORS as readonly SensorColor[]
export const IMU_AXES = RawRegistry.IMU_AXES as readonly ImuAxis[]
export const TRAVEL_UNITS = RawRegistry.TRAVEL_UNITS as readonly ("rotations" | "degrees" | "seconds")[]
export const DEFAULT_SENSOR_DISTANCE = RawRegistry.DEFAULT_SENSOR_DISTANCE as number
export const DEFAULT_SENSOR_LIGHT = RawRegistry.DEFAULT_SENSOR_LIGHT as number
export const DEFAULT_SENSOR_COLOR = RawRegistry.DEFAULT_SENSOR_COLOR as SensorColor
export const DEFAULT_SENSOR_REFLECTION = RawRegistry.DEFAULT_SENSOR_REFLECTION as number
export const DEFAULT_SENSOR_FORCE = RawRegistry.DEFAULT_SENSOR_FORCE as number
export const DEFAULT_SENSOR_ANGLE = RawRegistry.DEFAULT_SENSOR_ANGLE as number
export const DEFAULT_SENSOR_TILT = RawRegistry.DEFAULT_SENSOR_TILT as number
export const DEFAULT_SENSOR_AXIS = RawRegistry.DEFAULT_SENSOR_AXIS as ImuAxis
export const DEFAULT_SPEED = RawRegistry.DEFAULT_SPEED as number
export const DEFAULT_POWER = RawRegistry.DEFAULT_POWER as number
export const DEFAULT_DRIVE_SETTINGS = RawRegistry.DEFAULT_DRIVE_SETTINGS as Readonly<DriveSettings>
export const BLOCK_TYPES = RawRegistry.BLOCK_TYPES as readonly string[]
export const ACTION_BLOCK_TYPES = RawRegistry.ACTION_BLOCK_TYPES as readonly string[]
export const CONTROLLER_BUTTONS = RawRegistry.CONTROLLER_BUTTONS as readonly string[]
export const COLOR_BUTTONS = RawRegistry.COLOR_BUTTONS as readonly string[]
export const CONTROLLER_EVENTS = RawRegistry.CONTROLLER_EVENTS as readonly string[]
export const CHASSIS_DIRECTIONS = RawRegistry.CHASSIS_DIRECTIONS as readonly ChassisDirection[]
export const BUTTON_LABELS = RawRegistry.BUTTON_LABELS as Readonly<Record<string, string>>
export const INPUT_ICONS = RawRegistry.INPUT_ICONS as Readonly<Record<string, string>>
export const BUTTON_KEYS = RawRegistry.BUTTON_KEYS as Readonly<Record<string, string>>
export const DIRECTION_INPUTS = RawRegistry.DIRECTION_INPUTS as Readonly<Record<string, readonly string[]>>
export const CONTROL_KIND_INPUTS = RawRegistry.CONTROL_KIND_INPUTS as Readonly<Record<string, readonly string[]>>
export const WHEEL_DIRECTIONS = RawRegistry.WHEEL_DIRECTIONS as unknown as Readonly<Record<string, readonly [number, number]>>
export const isDriveSettings = RawRegistry.isDriveSettings as (value: unknown) => value is DriveSettings
export const normalizeChassisSettings = RawRegistry.normalizeChassisSettings as (value: unknown) => DriveSettings | undefined
export const resolveProjectChassis = RawRegistry.resolveProjectChassis as (project: unknown) => { configured: boolean; settings: DriveSettings }
export const isPairedBlock = RawRegistry.isPairedBlock as (block: unknown) => boolean
export const getRawStopPorts = RawRegistry.getRawStopPorts as (block: unknown) => { stopAll: boolean; ports: string[] }
export const getStopPorts = RawRegistry.getStopPorts as (block: unknown, hub?: HubId) => { stopAll: boolean; ports: string[] }
export const compileSensorBlock = RawRegistry.compileSensorBlock as (block: unknown, context?: { button?: string; inCondition?: boolean }) => unknown
export const expandActionBlock = RawRegistry.expandActionBlock as (child: unknown, context?: unknown) => unknown
export const formatControlOptionLabel = RawRegistry.formatControlOptionLabel as (control: unknown, indexInKind: number, countInKind: number) => string
