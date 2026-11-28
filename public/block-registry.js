import { validateModuleRules } from './block-modules.js';
export const HUB_PORTS = Object.freeze({
  spike: Object.freeze(['A', 'B', 'C', 'D', 'E', 'F']),
  ev3: Object.freeze(['A', 'B', 'C', 'D']),
});

export const DRIVE_PORTS = HUB_PORTS.spike;
export const SENSOR_PORTS = Object.freeze(['C', 'D', 'E', 'F']);
export const SENSOR_TYPES = Object.freeze(['ultrasonic', 'color', 'force', 'imu']);
export const SENSOR_MODULES = Object.freeze(['threshold', 'lights']);
export const SENSOR_MODULES_BY_TYPE = Object.freeze({
  ultrasonic: Object.freeze(['threshold', 'lights']),
  color: Object.freeze(['color', 'reflection', 'lights']),
  force: Object.freeze(['pressed', 'force']),
  imu: Object.freeze(['heading', 'tilt', 'reset']),
});
export const DEFAULT_SENSOR_MODULE = Object.freeze({
  ultrasonic: 'threshold',
  color: 'color',
  force: 'pressed',
  imu: 'heading',
});
export const SENSOR_COLORS = Object.freeze(['red', 'yellow', 'green', 'blue', 'white', 'black', 'none']);
export const IMU_AXES = Object.freeze(['pitch', 'roll']);
export const TRAVEL_UNITS = Object.freeze(['rotations', 'degrees', 'seconds']);
export const DEFAULT_SENSOR_DISTANCE = 20;
export const DEFAULT_SENSOR_LIGHT = 100;
export const DEFAULT_SENSOR_COLOR = 'red';
export const DEFAULT_SENSOR_REFLECTION = 50;
export const DEFAULT_SENSOR_FORCE = 3;
export const DEFAULT_SENSOR_ANGLE = 90;
export const DEFAULT_SENSOR_TILT = 30;
export const DEFAULT_SENSOR_AXIS = 'pitch';
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
  'loop',
  'button',
  'stop',
  'motor-buttons',
  'sensor',
  'sound',
]);

export const ACTION_BLOCK_TYPES = Object.freeze([
  'drive',
  'pair',
  'chassis',
  'stop',
  'sensor',
  'sound',
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
  'distance-gauge': Object.freeze([]),
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

export function isPairedBlock(block) {
  if (!block || typeof block !== 'object') return false;
  if (block.type === 'pair') return true;
  return block.type === 'drive' && Array.isArray(block.modules) && block.modules.includes('pair');
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

function clampInt(value, min, max, fallback) {
  return Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Math.round(Number(value)))) : fallback;
}

export function compileSensorBlock(block, context = {}) {
  const btn = context.button || 'up';
  const inCondition = Boolean(context.inCondition);
  const errors = [];
  const preActions = [];
  const usedSensorPorts = [];
  const requiredSensorTypes = {};
  let usesImu = false;

  const rawType = String(block?.sensorType || 'ultrasonic');
  const sensorType = SENSOR_TYPES.includes(rawType) ? rawType : 'ultrasonic';
  if (block?.sensorType !== undefined && !SENSOR_TYPES.includes(rawType)) {
    errors.push({
      button: btn,
      blockId: block?.id,
      code: 'invalid-sensor-type',
      message: 'Неизвестный тип датчика',
    });
  }

  const isImu = sensorType === 'imu';
  const port = isImu ? 'IMU' : String(block?.sensorPort || 'C');
  if (isImu) {
    usesImu = true;
  } else if (!SENSOR_PORTS.includes(port)) {
    errors.push({
      button: btn,
      blockId: block?.id,
      code: 'invalid-sensor-port',
      message: 'Выберите порт C–F',
    });
  } else {
    usedSensorPorts.push(port);
    requiredSensorTypes[port] = sensorType;
  }

  const allowed = SENSOR_MODULES_BY_TYPE[sensorType];
  const modules = Array.isArray(block?.sensorModules)
    ? block.sensorModules
    : [DEFAULT_SENSOR_MODULE[sensorType]];

  if (modules.length === 0) {
    errors.push({
      button: btn,
      blockId: block?.id,
      code: 'empty-sensor',
      message: 'Добавьте условие или подсветку',
    });
  }

  if (modules.some(m => !allowed.includes(m))) {
    errors.push({
      button: btn,
      blockId: block?.id,
      code: 'incompatible-sensor-module',
      message: 'Модуль не подходит к выбранному датчику',
    });
  }

  if (inCondition && modules.includes('reset')) {
    errors.push({
      button: btn,
      blockId: block?.id,
      code: 'reset-in-if',
      message: 'Сброс 0° работает только в цепочке',
    });
  }

  if (modules.includes('lights') && (sensorType === 'ultrasonic' || sensorType === 'color')) {
    const rawLight = Number.isFinite(block?.sensorLight) ? Math.round(Number(block.sensorLight)) : DEFAULT_SENSOR_LIGHT;
    const brightness = rawLight < 0 ? -1 : Math.max(0, Math.min(100, rawLight));
    preActions.push({ kind: 'sensorLights', port, brightness });
  }

  if (!inCondition && isImu && modules.includes('reset')) {
    preActions.push({ kind: 'imuReset' });
  }

  let condition = null;
  let waitAction = null;

  if (sensorType === 'ultrasonic') {
    if (modules.includes('threshold')) {
      const op = block?.sensorOp === 'gt' ? 'gt' : 'lt';
      const cm = clampInt(block?.sensorDistance, 1, 200, DEFAULT_SENSOR_DISTANCE);
      condition = { port, op, cm };
      waitAction = { kind: 'waitSensor', port, op, cm };
    }
  } else {
    const checks = [];
    if (sensorType === 'color') {
      if (modules.includes('color')) {
        const color = SENSOR_COLORS.includes(block?.sensorColor) ? block.sensorColor : DEFAULT_SENSOR_COLOR;
        checks.push({ kind: 'color', port, color });
      }
      if (modules.includes('reflection')) {
        const op = block?.sensorOp === 'gt' ? 'gt' : 'lt';
        const value = clampInt(block?.sensorReflection, 0, 100, DEFAULT_SENSOR_REFLECTION);
        checks.push({ kind: 'reflection', port, op, value });
      }
    } else if (sensorType === 'force') {
      if (modules.includes('pressed')) {
        const pressed = typeof block?.sensorPressed === 'boolean' ? block.sensorPressed : true;
        checks.push({ kind: 'pressed', port, pressed });
      }
      if (modules.includes('force')) {
        const op = block?.sensorOp === 'gt' ? 'gt' : 'lt';
        const rawForce = Number.isFinite(Number(block?.sensorForce)) ? Number(block.sensorForce) : DEFAULT_SENSOR_FORCE;
        const value = Math.max(0, Math.min(10, Math.round(rawForce * 10) / 10));
        checks.push({ kind: 'force', port, op, value });
      }
    } else if (sensorType === 'imu') {
      if (modules.includes('heading')) {
        const op = block?.sensorOp === 'gt' ? 'gt' : 'lt';
        const value = clampInt(block?.sensorAngle, -360, 360, DEFAULT_SENSOR_ANGLE);
        checks.push({ kind: 'heading', port: 'IMU', op, value });
      }
      if (modules.includes('tilt')) {
        const axis = IMU_AXES.includes(block?.sensorAxis) ? block.sensorAxis : DEFAULT_SENSOR_AXIS;
        const op = (block?.sensorTiltOp ?? block?.sensorOp) === 'gt' ? 'gt' : 'lt';
        const value = clampInt(block?.sensorTilt ?? block?.sensorAngle, -90, 90, DEFAULT_SENSOR_TILT);
        checks.push({ kind: 'tilt', port: 'IMU', axis, op, value });
      }
    }
    if (checks.length > 0) {
      condition = { sensorType, port, checks };
      waitAction = { kind: 'waitSensor', sensorType, port, checks };
    }
  }

  if (inCondition && !condition && !errors.some(e => e.code === 'empty-sensor' || e.code === 'incompatible-sensor-module' || e.code === 'reset-in-if')) {
    errors.push({
      button: btn,
      blockId: block?.id,
      code: 'missing-threshold',
      message: sensorType === 'ultrasonic' ? 'Добавьте порог < / >' : 'Добавьте условие датчика',
    });
  }

  return { preActions, condition, waitAction, errors, usedSensorPorts, requiredSensorTypes, usesImu };
}

export function expandActionBlock(child, context = {}) {
  const hub = context.hub === 'ev3' ? 'ev3' : 'spike';
  const validPorts = HUB_PORTS[hub] || HUB_PORTS.spike;
  const btn = context.button || 'up';
  const errors = [];
  const actions = [];
  const usedPorts = [];
  const usedSensorPorts = [];
  let maxProtocol = 2;

  if (!child || typeof child !== 'object') {
    return { actions, errors, usedPorts, usedSensorPorts, maxProtocol };
  }

  if (child.type === 'sensor') {
    const compiled = compileSensorBlock(child, { button: btn, inCondition: false });
    errors.push(...compiled.errors);
    actions.push(...compiled.preActions);
    if (compiled.waitAction) actions.push(compiled.waitAction);
    usedSensorPorts.push(...compiled.usedSensorPorts);
    return { actions, errors, usedPorts, usedSensorPorts, maxProtocol };
  }

  if (child.type === 'stop') {
    const raw = getRawStopPorts(child);
    if (raw.stopAll) {
      actions.push({ kind: 'stopAll' });
      return { actions, errors, usedPorts, usedSensorPorts, maxProtocol };
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
    return { actions, errors, usedPorts, usedSensorPorts, maxProtocol };
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
      return { actions, errors, usedPorts, usedSensorPorts, maxProtocol };
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
    usedPorts.push(settings.leftPort, settings.rightPort);

    const hasTravel = modules.includes('travel');
    if (!hasTravel) {
      actions.push({ kind: 'run', port: settings.leftPort, speed: leftSpeed });
      actions.push({ kind: 'run', port: settings.rightPort, speed: rightSpeed });
      return { actions, errors, usedPorts, usedSensorPorts, maxProtocol };
    }

    maxProtocol = 3;
    const rawUnit = child.unit ?? 'rotations';
    if (!TRAVEL_UNITS.includes(String(rawUnit))) {
      errors.push({
        button: btn,
        blockId: child.id,
        code: 'invalid-travel-unit',
        message: 'Выберите °, об или с',
      });
    }
    const unit = TRAVEL_UNITS.includes(String(rawUnit)) ? String(rawUnit) : 'rotations';
    const rawValue = child.value;
    if (rawValue !== undefined && (!Number.isFinite(Number(rawValue)) || Number(rawValue) <= 0 || Number(rawValue) > 10000)) {
      errors.push({
        button: btn,
        blockId: child.id,
        code: 'invalid-travel-value',
        message: 'Задайте значение от 0.01 до 10000',
      });
    }
    const value = Number.isFinite(Number(rawValue)) && Number(rawValue) > 0 && Number(rawValue) <= 10000 ? Number(rawValue) : 1;

    if (unit === 'seconds') {
      const ms = Math.max(10, Math.min(600000, Math.round(value * 1000)));
      actions.push({ kind: 'time', port: settings.leftPort, speed: leftSpeed, ms });
      actions.push({ kind: 'time', port: settings.rightPort, speed: rightSpeed, ms });
      actions.push({ kind: 'wait', ms });
    } else {
      const degrees = Math.max(1, Math.round(value * (unit === 'rotations' ? 360 : 1)));
      actions.push({ kind: 'angle', port: settings.leftPort, speed: leftSpeed, degrees });
      actions.push({ kind: 'angle', port: settings.rightPort, speed: rightSpeed, degrees });
      const waitMs = Math.round((degrees / clampedSpeed) * 1000) + 150;
      actions.push({ kind: 'wait', ms: waitMs });
    }
    return { actions, errors, usedPorts, usedSensorPorts, maxProtocol };
  }

  if (child.type === 'drive' || child.type === 'pair') {
    const modules = Array.isArray(child.modules) ? child.modules : [];
    const isPair = isPairedBlock(child);
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
    const rawUnit = child.unit ?? 'rotations';
    if (hasTravel && !TRAVEL_UNITS.includes(String(rawUnit))) {
      errors.push({
        button: btn,
        blockId: child.id,
        code: 'invalid-travel-unit',
        message: 'Выберите °, об или с',
      });
    }
    const unit = TRAVEL_UNITS.includes(String(rawUnit)) ? String(rawUnit) : 'rotations';
    if (hasTravel && child.value !== undefined && (!Number.isFinite(Number(child.value)) || Number(child.value) <= 0 || Number(child.value) > 10000)) {
      errors.push({
        button: btn,
        blockId: child.id,
        code: 'invalid-travel-value',
        message: 'Задайте значение от 0.01 до 10000',
      });
    }

    for (const problem of validateModuleRules('drive', { ...child, unit }, { target: 'runtime' })) {
      errors.push({ button: btn, blockId: child.id, code: problem.code, message: problem.short });
    }

    const rawSpeed = modules.includes('speed') && Number.isFinite(child.speed) ? Number(child.speed) : DEFAULT_SPEED;
    const clampedSpeed = Math.max(1, Math.min(1000, Math.round(rawSpeed)));
    if (clampedSpeed > 600) maxProtocol = 3;

    const rawPower = Number.isFinite(child.power) ? Number(child.power) : DEFAULT_POWER;
    const clampedPower = Math.max(1, Math.min(100, Math.round(rawPower)));

    const value = Number.isFinite(Number(child.value)) && Number(child.value) > 0 && Number(child.value) <= 10000 ? Number(child.value) : 1;
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
    return { actions, errors, usedPorts, usedSensorPorts, maxProtocol };
  }

  return { actions, errors, usedPorts, usedSensorPorts, maxProtocol };
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
