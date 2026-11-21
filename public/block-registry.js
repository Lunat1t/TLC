export const HUB_PORTS = Object.freeze({
  spike: Object.freeze(['A', 'B', 'C', 'D', 'E', 'F']),
  ev3: Object.freeze(['A', 'B', 'C', 'D']),
});

export const DRIVE_PORTS = HUB_PORTS.spike;
export const DEFAULT_SPEED = 360;
export const DEFAULT_POWER = 50;

export const DEFAULT_DRIVE_SETTINGS = Object.freeze({
  leftPort: 'A',
  rightPort: 'B',
  leftReversed: false,
  rightReversed: true,
  speed: DEFAULT_SPEED,
});

export const BLOCK_TYPES = Object.freeze([
  'start',
  'drive',
  'pair',
  'chassis',
  'if',
  'button',
  'stop',
  'motor-buttons',
]);

export const ACTION_BLOCK_TYPES = Object.freeze([
  'drive',
  'pair',
  'chassis',
  'stop',
]);

export const CONTROLLER_BUTTONS = Object.freeze([
  'up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'l', 'r',
]);

export const COLOR_BUTTONS = Object.freeze([
  'blue', 'red', 'green', 'yellow',
]);

export const CONTROLLER_EVENTS = Object.freeze([
  'hold', 'pressed', 'released',
]);

export const CHASSIS_DIRECTIONS = Object.freeze([
  'forward', 'backward', 'left', 'right',
]);

export const BUTTON_LABELS = Object.freeze({
  up: '▲',
  down: '▼',
  left: '◀',
  right: '▶',
  a: 'A',
  b: 'B',
  x: 'X',
  y: 'Y',
  l: 'L',
  r: 'R',
  blue: '🔵',
  red: '🔴',
  green: '🟢',
  yellow: '🟡',
});

export const INPUT_ICONS = Object.freeze({
  up: '▲',
  down: '▼',
  left: '◀',
  right: '▶',
  forward: '▲',
  backward: '▼',
  blue: '🔵',
  red: '🔴',
  green: '🟢',
  yellow: '🟡',
  a: 'A',
  b: 'B',
  x: 'X',
  y: 'Y',
  l: 'L',
  r: 'R',
});

export const BUTTON_KEYS = Object.freeze({
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyJ: 'a',
  KeyK: 'b',
  KeyU: 'x',
  KeyI: 'y',
  KeyQ: 'l',
  KeyE: 'r',
});

export const DIRECTION_INPUTS = Object.freeze({
  'drive-turn': Object.freeze(['left', 'right']),
  'drive-linear': Object.freeze(['up', 'down']),
});

export const CONTROL_KIND_INPUTS = Object.freeze({
  'drive-turn': DIRECTION_INPUTS['drive-turn'],
  'drive-linear': DIRECTION_INPUTS['drive-linear'],
  drivetrain: Object.freeze(['up', 'down', 'left', 'right']),
  motor: Object.freeze(['forward', 'backward']),
  'motor-group': Object.freeze(['forward', 'backward']),
  'legacy-buttons': CONTROLLER_BUTTONS,
  'motor-panel': COLOR_BUTTONS,
  display: Object.freeze([]),
});

export const WHEEL_DIRECTIONS = Object.freeze({
  up: Object.freeze([1, 1]),
  forward: Object.freeze([1, 1]),
  down: Object.freeze([-1, -1]),
  backward: Object.freeze([-1, -1]),
  left: Object.freeze([-1, 1]),
  right: Object.freeze([1, -1]),
});

export function isDriveSettings(value) {
  if (!value || typeof value !== 'object') return false;
  if (!DRIVE_PORTS.includes(value.leftPort) || !DRIVE_PORTS.includes(value.rightPort)) return false;
  if (value.leftPort === value.rightPort) return false;
  if (typeof value.leftReversed !== 'boolean' || typeof value.rightReversed !== 'boolean') return false;
  if (value.speed !== undefined && (!Number.isFinite(value.speed) || value.speed < 1 || value.speed > 1000)) return false;
  return true;
}

export function normalizeChassisSettings(value) {
  if (!isDriveSettings(value)) return undefined;
  return {
    leftPort: value.leftPort,
    rightPort: value.rightPort,
    leftReversed: value.leftReversed,
    rightReversed: value.rightReversed,
    speed: Number.isFinite(value.speed) ? Math.max(1, Math.min(1000, Math.round(value.speed))) : DEFAULT_SPEED,
  };
}

export function resolveProjectChassis(project) {
  const ws = project?.workspace;
  const direct = normalizeChassisSettings(ws?.chassis);
  if (direct) return { configured: true, settings: direct };
  const areas = Array.isArray(ws?.controlLayout?.areas) ? ws.controlLayout.areas : [];
  for (const area of areas) {
    const areaDrive = normalizeChassisSettings(area?.drive);
    if (areaDrive) return { configured: true, settings: areaDrive };
  }
  return { configured: false, settings: DEFAULT_DRIVE_SETTINGS };
}

export function getRawStopPorts(block) {
  if (block?.stopAll === true) {
    return { stopAll: true, ports: [] };
  }
  if (Array.isArray(block?.motors) && block.motors.length > 0) {
    return { stopAll: false, ports: block.motors.map(port => String(port)) };
  }
  const motor = String(block?.motor || 'A');
  const ports = [motor];
  if (block?.motor2 !== undefined && block.motor2 !== null && block.motor2 !== '') {
    ports.push(String(block.motor2));
  }
  return { stopAll: false, ports };
}

export function getStopPorts(block, hub = 'spike') {
  const valid = HUB_PORTS[hub] || HUB_PORTS.spike;
  const raw = getRawStopPorts(block);
  if (raw.stopAll) return { stopAll: true, ports: [...valid] };
  const filtered = raw.ports.filter(port => valid.includes(port));
  return { stopAll: false, ports: filtered.length ? filtered : ['A'] };
}

export function expandActionBlock(child, context = {}) {
  const hub = context.hub === 'ev3' ? 'ev3' : 'spike';
  const validPorts = HUB_PORTS[hub] || HUB_PORTS.spike;
  const btn = context.button || 'up';
  const errors = [];
  const actions = [];
  const usedPorts = [];
  let maxProtocol = 2;

  if (!child || typeof child !== 'object') {
    return { actions, errors, usedPorts, maxProtocol };
  }

  if (child.type === 'stop') {
    const raw = getRawStopPorts(child);
    if (raw.stopAll) {
      actions.push({ kind: 'stopAll' });
      return { actions, errors, usedPorts, maxProtocol };
    }
    const invalid = raw.ports.filter(p => !validPorts.includes(p));
    if (invalid.length > 0) {
      errors.push({
        button: btn,
        blockId: child.id,
        code: 'invalid-port',
        message: 'Выберите порт мотора',
      });
    }
    const seen = new Set();
    let duplicatePort = null;
    for (const port of raw.ports) {
      if (seen.has(port)) duplicatePort = port;
      seen.add(port);
    }
    if (duplicatePort) {
      errors.push({
        button: btn,
        blockId: child.id,
        code: 'same-ports',
        message: `Порт ${duplicatePort} выбран дважды`,
      });
    }
    for (const port of seen) {
      if (validPorts.includes(port)) {
        actions.push({ kind: 'stop', port });
        usedPorts.push(port);
      }
    }
    return { actions, errors, usedPorts, maxProtocol };
  }

  if (child.type === 'chassis') {
    const chassis = context.chassis;
    if (!chassis?.configured || !isDriveSettings(chassis.settings)) {
      errors.push({
        button: btn,
        blockId: child.id,
        code: 'chassis-unconfigured',
        message: 'Настройте шасси (⚙)',
      });
      return { actions, errors, usedPorts, maxProtocol };
    }
    const settings = chassis.settings;
    const dir = CHASSIS_DIRECTIONS.includes(child.chassisDirection) ? child.chassisDirection : 'forward';
    const [leftMul, rightMul] = WHEEL_DIRECTIONS[dir] || WHEEL_DIRECTIONS.forward;
    const modules = Array.isArray(child.modules) ? child.modules : [];
    const baseSpeed = Number.isFinite(settings.speed) ? settings.speed : DEFAULT_SPEED;
    const rawSpeed = modules.includes('speed') && Number.isFinite(child.speed) ? Number(child.speed) : baseSpeed;
    const clampedSpeed = Math.max(1, Math.min(1000, Math.round(rawSpeed)));
    if (clampedSpeed > 600) maxProtocol = 3;

    const leftSpeed = leftMul * clampedSpeed * (settings.leftReversed ? -1 : 1);
    const rightSpeed = rightMul * clampedSpeed * (settings.rightReversed ? -1 : 1);
    actions.push({ kind: 'run', port: settings.leftPort, speed: leftSpeed });
    actions.push({ kind: 'run', port: settings.rightPort, speed: rightSpeed });
    usedPorts.push(settings.leftPort, settings.rightPort);
    return { actions, errors, usedPorts, maxProtocol };
  }

  if (child.type === 'drive' || child.type === 'pair') {
    const modules = Array.isArray(child.modules) ? child.modules : [];
    if (modules.includes('speed') && modules.includes('power')) {
      errors.push({
        button: btn,
        blockId: child.id,
        code: 'speed-and-power',
        message: 'Выберите скорость или мощность',
      });
    }

    const isPair = child.type === 'pair';
    const portA = String(child.motor || 'A');
    const portB = isPair ? String(child.motor2 || 'B') : null;
    if (![portA, ...(portB ? [portB] : [])].every(p => validPorts.includes(p))) {
      errors.push({
        button: btn,
        blockId: child.id,
        code: 'invalid-port',
        message: 'Выберите порт мотора',
      });
    }

    if (isPair && portA === portB) {
      errors.push({
        button: btn,
        blockId: child.id,
        code: 'same-ports',
        message: `Порт ${portA} занят`,
      });
    }

    const powered = modules.includes('power');
    const hasTravel = modules.includes('travel');
    const unit = child.unit || 'rotations';

    if (powered && hasTravel && unit !== 'seconds') {
      errors.push({
        button: btn,
        blockId: child.id,
        code: 'power-travel',
        message: 'Для мощности выберите секунды',
      });
    }

    const rawSpeed = modules.includes('speed') && Number.isFinite(child.speed) ? Number(child.speed) : DEFAULT_SPEED;
    const clampedSpeed = Math.max(1, Math.min(1000, Math.round(rawSpeed)));
    if (clampedSpeed > 600) maxProtocol = 3;

    const rawPower = Number.isFinite(child.power) ? Number(child.power) : DEFAULT_POWER;
    const clampedPower = Math.max(1, Math.min(100, Math.round(rawPower)));

    const value = Number.isFinite(child.value) && Number(child.value) > 0 ? Number(child.value) : 1;
    const signA = child.direction === 'backward' ? -1 : 1;
    const signB = child.direction2 === 'backward' ? -1 : 1;

    usedPorts.push(portA);
    if (portB) usedPorts.push(portB);

    if (!hasTravel) {
      if (powered) {
        maxProtocol = 3;
        actions.push({ kind: 'dc', port: portA, power: signA * clampedPower });
        if (portB) actions.push({ kind: 'dc', port: portB, power: signB * clampedPower });
      } else {
        actions.push({ kind: 'run', port: portA, speed: signA * clampedSpeed });
        if (portB) actions.push({ kind: 'run', port: portB, speed: signB * clampedSpeed });
      }
    } else {
      maxProtocol = 3;
      if (unit === 'seconds') {
        const ms = Math.max(10, Math.min(600000, Math.round(value * 1000)));
        if (powered) {
          actions.push({ kind: 'dcTime', port: portA, power: signA * clampedPower, ms });
          if (portB) actions.push({ kind: 'dcTime', port: portB, power: signB * clampedPower, ms });
        } else {
          actions.push({ kind: 'time', port: portA, speed: signA * clampedSpeed, ms });
          if (portB) actions.push({ kind: 'time', port: portB, speed: signB * clampedSpeed, ms });
        }
        actions.push({ kind: 'wait', ms });
        if (powered) {
          actions.push({ kind: 'stop', port: portA });
          if (portB) actions.push({ kind: 'stop', port: portB });
        }
      } else {
        const degrees = Math.max(1, Math.round(value * (unit === 'rotations' ? 360 : 1)));
        actions.push({ kind: 'angle', port: portA, speed: signA * clampedSpeed, degrees });
        if (portB) actions.push({ kind: 'angle', port: portB, speed: signB * clampedSpeed, degrees });
        const waitMs = Math.round((degrees / clampedSpeed) * 1000) + 150;
        actions.push({ kind: 'wait', ms: waitMs });
      }
    }
    return { actions, errors, usedPorts, maxProtocol };
  }

  return { actions, errors, usedPorts, maxProtocol };
}

export function formatControlOptionLabel(control, indexInKind, countInKind) {
  let base = control?.label || 'Пульт';
  if (control?.kind === 'drive-turn') base = '◀ ▶';
  else if (control?.kind === 'drive-linear') base = '▲ ▼';
  else if (control?.kind === 'motor-panel') {
    const inputs = Array.isArray(control.inputs) && control.inputs.length
      ? control.inputs
      : COLOR_BUTTONS.slice(0, 2);
    base = inputs.map(input => INPUT_ICONS[input] || input).join('');
  }
  return countInKind > 1 ? `${base} #${indexInKind}` : base;
}
