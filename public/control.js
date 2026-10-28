export const LEVELS = [0.35, 0.6, 1];
export const MAX_DRIVE_MM_S = 500;
export const DEFAULT_LIMITS = {speed: MAX_DRIVE_MM_S, turn: 150};
export function curve(value, deadzone = .12) {
  const v = Math.max(-1, Math.min(1, Number(value) || 0));
  if (Math.abs(v) <= deadzone) return 0;
  const n = (Math.abs(v) - deadzone) / (1 - deadzone);
  return Math.sign(v) * (.4 * n + .6 * n ** 3);
}
export function driveAxis(value, deadzone = .12) {
  const v = Math.max(-1, Math.min(1, Number(value) || 0));
  if (Math.abs(v) <= deadzone) return 0;
  return Math.sign(v) * (Math.abs(v) - deadzone) / (1 - deadzone);
}
export function turnAxis(value, deadzone = .15) {
  const v = Math.max(-1, Math.min(1, Number(value) || 0));
  if (Math.abs(v) <= deadzone) return 0;
  return Math.sign(v) * Math.min(1, (Math.abs(v) - deadzone) / .45);
}
export function command(move, level, kick = false, limits = DEFAULT_LIMITS) {
  const power = LEVELS[Math.max(0, Math.min(2, level))];
  const turn = limits.turn ? turnAxis(move.x) : 0;
  const drive = turn ? 0 : driveAxis(move.y);
  // Turn commands set speed=0 so both motors spin in opposite directions (one reverse, one forward).
  return {speed: (Math.round(-Math.sign(drive) * Math.abs(drive) * limits.speed * power) || 0), turn: Math.round(turn * limits.turn), kick: !!kick};
}
export function drivePercent(move, level, limits = DEFAULT_LIMITS) {
  const cmd = command(move, level, false, limits);
  if (cmd.turn && limits.turn) return Math.round(Math.abs(cmd.turn) / limits.turn * 100);
  return limits.speed ? Math.round(Math.abs(cmd.speed) / limits.speed * 100) : 0;
}
export function packet(cmd) { return `v,${cmd.speed},${cmd.turn},${Number(cmd.kick)}\n`; }
// There is never a backlog of stick positions; only the newest value is retained.
export class LatestWriter {
  constructor(write, fail) { this.write = write; this.fail = fail; this.pending = null; this.action = null; this.running = false; this.closed = false; }
  submit(value) { if (this.closed) return; this.pending = value; this.flush(); }
  submitAction(value) { if (this.closed) return; this.action = value; this.flush(); }
  submitStop(value) { if (this.closed) return; this.action = value; this.pending = null; this.flush(); }
  close() { this.closed = true; this.pending = null; this.action = null; }
  async flush() {
    if (this.running || this.closed) return;
    this.running = true;
    try {
      while ((this.action !== null || this.pending !== null) && !this.closed) {
        const value = this.action !== null ? this.action : this.pending;
        if (this.action !== null) this.action = null;
        else this.pending = null;
        let timer;
        try { await Promise.race([this.write(value), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Хаб не отвечает')), 1000); })]); }
        finally { clearTimeout(timer); }
      }
    } catch (error) { this.close(); this.fail(error); }
    finally { this.running = false; }
  }
}
