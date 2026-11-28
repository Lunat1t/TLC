/**
 * Браузер поворачивает кадры камеры только вместе с экраном. Когда поворот
 * экрана на телефоне заблокирован, положение телефона определяем по датчику
 * и передаём дисплею, на сколько повернуть видео.
 */
export const ROTATION_CHANNEL = "camera-rotation"

export type QuarterTurn = 0 | 90 | 180 | 270

const FLAT_LIMIT = 0.5
const SWITCH_LIMIT_DEG = 60

function normalize(angle: number) {
  return ((angle % 360) + 360) % 360
}

export function isQuarterTurn(value: unknown): value is QuarterTurn {
  return value === 0 || value === 90 || value === 180 || value === 270
}

/**
 * Положение телефона в тех же градусах, что и `screen.orientation.angle`.
 * Лежащий почти горизонтально телефон и положения у диагонали сохраняют прежнее значение.
 */
export function deviceAngle(beta: number | null, gamma: number | null, previous: QuarterTurn): QuarterTurn {
  if (beta === null || gamma === null) return previous
  const b = beta * Math.PI / 180
  const g = gamma * Math.PI / 180
  const x = -Math.cos(b) * Math.sin(g)
  const y = Math.sin(b)
  if (Math.hypot(x, y) < FLAT_LIMIT) return previous
  const angle = normalize(Math.atan2(x, y) * 180 / Math.PI)
  const distance = Math.abs(normalize(angle - previous + 180) - 180)
  if (distance <= SWITCH_LIMIT_DEG) return previous
  return normalize(Math.round(angle / 90) * 90) as QuarterTurn
}

/** Поворот по часовой стрелке, который выравнивает видео на дисплее. */
export function videoRotation(device: QuarterTurn, screen: number, frontCamera: boolean): QuarterTurn {
  const difference = frontCamera ? device - screen : screen - device
  return normalize(Math.round(difference / 90) * 90) as QuarterTurn
}

type PermissionedOrientationEvent = { requestPermission?: () => Promise<string> }

/**
 * Следит за положением телефона и сообщает нужный поворот видео.
 * Вызывать прямо из обработчика нажатия: iOS иначе не покажет запрос доступа к датчику.
 */
export function watchCameraRotation(
  isFrontCamera: () => boolean,
  onChange: (rotation: QuarterTurn) => void,
  signal: AbortSignal,
) {
  if (typeof DeviceOrientationEvent === "undefined") return
  let device: QuarterTurn | undefined
  const screenAngle = () => window.screen.orientation?.angle
    ?? Number((window as { orientation?: number }).orientation ?? 0)
  function report() {
    if (device !== undefined) onChange(videoRotation(device, screenAngle(), isFrontCamera()))
  }
  function tilt(event: DeviceOrientationEvent) {
    if (event.beta === null || event.gamma === null) return
    // Пока телефон не наклонён явно, считаем, что он совпадает с экраном.
    device = deviceAngle(event.beta, event.gamma, device ?? normalize(Math.round(screenAngle() / 90) * 90) as QuarterTurn)
    report()
  }
  function listen() {
    if (signal.aborted) return
    window.addEventListener("deviceorientation", tilt, { signal })
    window.addEventListener("orientationchange", report, { signal })
    window.screen.orientation?.addEventListener("change", report, { signal })
  }
  const { requestPermission } = DeviceOrientationEvent as unknown as PermissionedOrientationEvent
  if (!requestPermission) {
    listen()
    return
  }
  void requestPermission.call(DeviceOrientationEvent).then(
    state => { if (state === "granted") listen() },
    () => {
      // Без доступа к датчику видео поворачивается только вместе с экраном.
    },
  )
}
