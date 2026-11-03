const HUB_PORTS = {
  prime: ["A", "B", "C", "D", "E", "F"],
  inventor: ["A", "B", "C", "D", "E", "F"],
  technic: ["A", "B", "C", "D"],
  move: ["A", "B", "C", "D"],
  city: ["A", "B"],
  essential: ["A", "B"],
} as const
const ALL_PORTS = ["A", "B", "C", "D", "E", "F"] as const
type Port = (typeof ALL_PORTS)[number]
type Hub = keyof typeof HUB_PORTS
type Control = {
  id: string
  type: "pair" | "single"
  label: string
  port: Port
  x: number
  y: number
  direction: 1 | -1
}
type ControllerDevice =
  | { id: string; type: "drivetrain"; name: string; leftPorts: Port[]; rightPorts: Port[] }
  | { id: string; type: "motor" | "motor-group"; name: string; ports: Port[] }
export type ControllerConfig = {
  version: 1
  hub: Hub
  ports: Record<Port, { speed: number; reverse: boolean }>
  devices: ControllerDevice[]
  moduleLayout: {deviceId: string; x: number; y: number; width: number; height: number; manual: boolean}[]
  gamepad: { driveId: string | null; actionDeviceId: string | null; leftPorts: Port[]; rightPorts: Port[]; actionPorts: Port[]; leftPort: Port | null; rightPort: Port | null; actionPort: Port | null; actionDirection: 1 | -1 }
  controls: Control[]
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}
export function validateControllerConfig(input: unknown): ControllerConfig {
  const raw = record(input)
  if (!raw || raw.version !== 1 || typeof raw.hub !== "string" ||
      !Object.prototype.hasOwnProperty.call(HUB_PORTS, raw.hub)) {
    throw new Error("Неизвестная конфигурация пульта.")
  }
  const hub = raw.hub as Hub
  const rawPorts = record(raw.ports)
  if (!rawPorts) throw new Error("Не указаны скорости моторов.")
  const ports = {} as ControllerConfig["ports"]
  for (const port of ALL_PORTS) {
    const value = record(rawPorts[port])
    if (!value || !Number.isInteger(value.speed) || (value.speed as number) < 0 ||
        (value.speed as number) > 100 || typeof value.reverse !== "boolean") {
      throw new Error("Неверная скорость порта " + port + ".")
    }
    ports[port] = { speed: value.speed as number, reverse: value.reverse }
  }
  if (!Array.isArray(raw.controls) || raw.controls.length > 12) {
    throw new Error("Допускается не более 12 кнопок.")
  }
  const ids = new Set<string>()
  const slots = new Set<string>()
  const controls: Control[] = raw.controls.map((value: unknown) => {
    const item = record(value)
    if (!item || (item.type !== "pair" && item.type !== "single") ||
        typeof item.id !== "string" || !/^[a-zA-Z0-9-]{1,50}$/.test(item.id) || ids.has(item.id)) {
      throw new Error("Неверная кнопка или повторяющийся идентификатор.")
    }
    ids.add(item.id)
    const label = typeof item.label === "string" ? item.label.trim() : ""
    if (!label || label.length > 32) throw new Error("Название кнопки: 1–32 символа.")
    if (typeof item.port !== "string" || !(HUB_PORTS[hub] as readonly string[]).includes(item.port)) {
      throw new Error("Порт отсутствует на выбранном хабе.")
    }
    if (!Number.isInteger(item.x) || (item.x as number) < 0 || (item.x as number) > 3 ||
        !Number.isInteger(item.y) || (item.y as number) < 0 || (item.y as number) > 2) {
      throw new Error("Кнопка расположена вне поля.")
    }
    const slot = item.x + ":" + item.y
    if (slots.has(slot)) throw new Error("Две кнопки занимают одно место.")
    slots.add(slot)
    if (item.direction !== 1 && item.direction !== -1) throw new Error("Неверное направление.")
    return { id: item.id, type: item.type, label, port: item.port as Port,
      x: item.x as number, y: item.y as number, direction: item.direction }
  })
  const rawGamepad = record(raw.gamepad) || {}
  const pairs = controls.filter(item => item.type === "pair")
  const firstPairPort = pairs[0]?.port || "A"
  const legacyLeftPort = rawGamepad.leftPort ?? firstPairPort
  const legacyRightPort = rawGamepad.rightPort ?? pairs.find(item => item.port !== firstPairPort)?.port ??
    (HUB_PORTS[hub] as readonly string[]).find(port => port !== firstPairPort)
  const legacyAction = controls.find(item => item.type === "single")
  const actionFromButton = legacyAction && legacyAction.port !== legacyLeftPort && legacyAction.port !== legacyRightPort
    ? legacyAction.port : undefined
  const actionDirection = rawGamepad.actionDirection ?? legacyAction?.direction ?? 1
  const allowed = HUB_PORTS[hub] as readonly string[]
  const legacyActionPort = rawGamepad.actionPort !== undefined ? rawGamepad.actionPort : actionFromButton ??
    (HUB_PORTS[hub] as readonly string[]).find(port => port !== legacyLeftPort && port !== legacyRightPort) ?? null
  const devices: ControllerDevice[] = Array.isArray(raw.devices) ? raw.devices.map((value: unknown) => {
    const item = record(value)
    if (!item || !["drivetrain", "motor", "motor-group"].includes(String(item.type)) ||
        typeof item.id !== "string" || !/^[a-zA-Z0-9-]{1,50}$/.test(item.id)) throw new Error("Неверный тип или идентификатор модуля.")
    const name = typeof item.name === "string" ? item.name.trim() : ""
    if (!name || name.length > 32) throw new Error("Название модуля: 1–32 символа.")
    if (item.type === "drivetrain") {
      const left = item.leftPorts, right = item.rightPorts
      if (!Array.isArray(left) || !Array.isArray(right) || !left.length || left.length > 2 || left.length !== right.length) throw new Error("Приводу нужны равные группы моторов слева и справа.")
      return {id: item.id, type: "drivetrain", name, leftPorts: left as Port[], rightPorts: right as Port[]}
    }
    const modulePorts = item.ports, count = item.type === "motor" ? 1 : 2
    if (!Array.isArray(modulePorts) || modulePorts.length !== count) throw new Error("Проверь порты модуля " + name + ".")
    return {id: item.id, type: item.type as "motor" | "motor-group", name, ports: modulePorts as Port[]}
  }) : [
    {id: "drive", type: "drivetrain", name: "Привод", leftPorts: [legacyLeftPort as Port], rightPorts: [legacyRightPort as Port]},
    ...(legacyActionPort ? [{id: "action", type: "motor" as const, name: "Мотор действия", ports: [legacyActionPort as Port]}] : []),
  ]
  if (devices.length > 12) throw new Error("Можно добавить не более 12 модулей.")
  const deviceIds = new Set<string>(), occupiedPorts = new Set<string>()
  for (const device of devices) {
    if (deviceIds.has(device.id)) throw new Error("Идентификатор модуля повторяется.")
    deviceIds.add(device.id)
    const assigned = device.type === "drivetrain" ? [...device.leftPorts, ...device.rightPorts] : device.ports
    for (const port of assigned) {
      if (!allowed.includes(port)) throw new Error("Порт отсутствует на выбранном хабе.")
      if (occupiedPorts.has(port)) throw new Error("Порт " + port + " уже занят другим модулем.")
      occupiedPorts.add(port)
    }
  }
  const drives = devices.filter((device): device is Extract<ControllerDevice, {type: "drivetrain"}> => device.type === "drivetrain")
  if (drives.length > 1) throw new Error("Можно добавить только один привод.")
  const rawLayout = raw.moduleLayout ?? devices.map((device, index) => ({deviceId: device.id, x: (index % 3) / 2, y: Math.floor(index / 3) / 3}))
  if (!Array.isArray(rawLayout) || rawLayout.length !== devices.length) throw new Error("У каждого модуля должен быть один блок управления.")
  const layoutIds = new Set<string>()
  const moduleLayout = rawLayout.map((value: unknown) => {
    const item = record(value)
    if (!item || typeof item.deviceId !== "string" || !deviceIds.has(item.deviceId) || layoutIds.has(item.deviceId) ||
        typeof item.x !== "number" || typeof item.y !== "number" || !Number.isFinite(item.x) || !Number.isFinite(item.y) ||
        item.x < 0 || item.x > 1 || item.y < 0 || item.y > 1) throw new Error("Неверное положение блока управления.")
    const width = item.width ?? 206, height = item.height ?? 176
    if (!Number.isInteger(width) || (width as number) < 190 || (width as number) > 480 ||
        !Number.isInteger(height) || (height as number) < 170 || (height as number) > 420 ||
        (item.manual !== undefined && typeof item.manual !== "boolean")) throw new Error("Неверный размер блока управления.")
    layoutIds.add(item.deviceId)
    return {deviceId: item.deviceId, x: item.x, y: item.y, width: width as number, height: height as number, manual: item.manual ?? false}
  })
  const drive = drives[0] || null
  const driveId = rawGamepad.driveId ?? drive?.id ?? null
  if (driveId && drive?.id !== driveId) throw new Error("Выбранный привод не найден.")
  const actionDevices = devices.filter((device): device is Extract<ControllerDevice, {type: "motor" | "motor-group"}> => device.type !== "drivetrain")
  const actionDeviceId = rawGamepad.actionDeviceId !== undefined ? rawGamepad.actionDeviceId : actionDevices.find(device => device.ports.includes(legacyActionPort as Port))?.id ?? null
  const actionDevice = actionDevices.find(device => device.id === actionDeviceId) || null
  if (actionDeviceId && !actionDevice) throw new Error("Модуль действия не найден.")
  const leftPorts = drive?.leftPorts || [], rightPorts = drive?.rightPorts || [], actionPorts = actionDevice?.ports || []
  if (actionDirection !== 1 && actionDirection !== -1) throw new Error("Неверное направление мотора действия.")
  return { version: 1, hub, ports, devices, moduleLayout, gamepad: {
    driveId: drive?.id || null, actionDeviceId: actionDevice?.id || null,
    leftPorts, rightPorts, actionPorts, leftPort: leftPorts[0] || null, rightPort: rightPorts[0] || null,
    actionPort: actionPorts[0] || null, actionDirection: actionDirection as 1 | -1,
  }, controls }
}
