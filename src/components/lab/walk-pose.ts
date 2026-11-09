/** Relaxed contact/down/passing/up cycle. Phase follows travelled distance, not time. */
export const WALK_CYCLE_DISTANCE = 64
const TAU = Math.PI * 2
const STANCE = .6
const unit = (n: number) => ((n % 1) + 1) % 1
const smooth = (n: number) => n * n * (3 - 2 * n)
const point = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`
function leg(phase: number, hipX: number, sway: number, bob: number, direction: number) {
  const p = unit(phase)
  // During contact the foot travels backwards relative to the body at ground speed.
  const stride = WALK_CYCLE_DISTANCE * STANCE * 1080 / 132
  const swing = p >= STANCE
  const t = swing ? (p - STANCE) / (1 - STANCE) : p / STANCE
  const reach = swing ? -stride / 2 + stride * smooth(t) : stride / 2 - stride * t
  const lift = swing ? Math.sin(t * Math.PI) * 100 : 0
  const ankle = { x: hipX + direction * reach, y: 970 - lift }
  const hip = { x: hipX + sway, y: 565 + bob }
  const dx = ankle.x - hip.x, dy = ankle.y - hip.y
  const length = Math.min(489, Math.max(1, Math.hypot(dx, dy)))
  const along = (230 ** 2 - 260 ** 2 + length ** 2) / (2 * length)
  const bend = Math.sqrt(Math.max(0, 230 ** 2 - along ** 2))
  const knee = { x: hip.x + dx / length * along + dy / length * bend * direction, y: hip.y + dy / length * along - dx / length * bend * direction }
  // Lift the toe at contact; peel off the heel before the recovery swing.
  const roll = direction * (swing ? -12 * Math.sin(t * Math.PI) : t < .18 ? -9 * (1 - t / .18) : t > .82 ? 13 * (t - .82) / .18 : 0)
  return {
    path: `M ${point(hip.x, hip.y)} Q ${point(knee.x, knee.y)} ${point(ankle.x, ankle.y)}`,
    foot: `translate(${point(ankle.x, ankle.y)}) rotate(${roll.toFixed(2)}) scale(${direction} 1)`,
  }
}
export function walkPose(distance: number, direction: number) {
  const phase = unit(distance / WALK_CYCLE_DISTANCE)
  const wave = Math.sin(phase * TAU)
  const bob = 5 + Math.cos((phase - .06) * TAU * 2) * 12
  const sway = wave * 9
  const torso = `translate(${point(sway, bob)}) rotate(${(direction * 2 + wave * 1.4).toFixed(2)} 344 550)`
  return {
    left: leg(phase, 265, sway, bob, direction),
    right: leg(phase + .5, 423, sway, bob, direction),
    torso,
    armLeft: `${torso} rotate(${(direction * wave * -11 + 3).toFixed(2)} 112 370)`,
    armRight: `${torso} rotate(${(direction * wave * 11 - 3).toFixed(2)} 576 370)`,
    shadow: (1 - Math.max(0, -bob) / 120).toFixed(3),
  }
}
