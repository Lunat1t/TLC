export const CONTROLLER_BUTTONS = Object.freeze([
  'up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'l', 'r'
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
  blue: 'Синяя',
  red: 'Красная',
  green: 'Зелёная',
  yellow: 'Жёлтая',
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

const DEFAULT_SPEED = 360;
const DEFAULT_POWER = 50;

export const DRIVE_PORTS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F']);
export const DEFAULT_DRIVE_SETTINGS = Object.freeze({
  leftPort: 'A',
  rightPort: 'B',
  leftReversed: false,
  rightReversed: true,
});

export function isDriveSettings(value) {
  return DRIVE_PORTS.includes(value?.leftPort) && DRIVE_PORTS.includes(value?.rightPort) &&
    value.leftPort !== value.rightPort &&
    typeof value.leftReversed === 'boolean' && typeof value.rightReversed === 'boolean';
}

const DIRECTION_INPUTS = Object.freeze({
  'drive-turn': ['left', 'right'],
  'drive-linear': ['up', 'down'],
});
const WHEEL_DIRECTIONS = {
  up: [1, 1],
  down: [-1, -1],
  left: [-1, 1],
  right: [1, -1],
};

function compileDriveControls(layout, result, usedPorts) {
  if (!Array.isArray(layout?.controls)) return;
  const areas = Array.isArray(layout.areas) ? layout.areas : [];
  for (const control of layout.controls) {
    const inputs = Object.hasOwn(DIRECTION_INPUTS, control?.kind) ? DIRECTION_INPUTS[control.kind] : null;
    if (!inputs || typeof control.id !== 'string' || !control.id) continue;
    const area = typeof control.areaId === 'string' && control.areaId && areas.find(candidate => candidate?.id === control.areaId);
    const settings = area?.drive === undefined ? DEFAULT_DRIVE_SETTINGS : area.drive;
    if (!area || !isDriveSettings(settings)) {
      for (const input of inputs) {
        result.errors.push({
          target: {controlId: control.id, input}, scope: 'handler', severity: 'error',
          code: 'invalid-drive-settings', message: 'Выберите два разных порта для привода в области управления.',
        });
      }
      continue;
    }

    const {leftPort, rightPort, leftReversed, rightReversed} = settings;
    for (const input of inputs) {
      // Explicit event blocks replace automatic driving for this arrow.
      if (result.handlers.some(handler => handler.target?.controlId === control.id && handler.target.input === input && !handler.driveAreaId)) continue;
      usedPorts.add(leftPort);
      usedPorts.add(rightPort);
      const [left, right] = WHEEL_DIRECTIONS[input];
      const base = {target: {controlId: control.id, input}, button: input, sourceBlockId: control.id, driveAreaId: area.id};
      result.handlers.push({
        ...base, event: 'pressed', actions: [
          {kind: 'run', port: leftPort, speed: left * DEFAULT_SPEED * (leftReversed ? -1 : 1)},
          {kind: 'run', port: rightPort, speed: right * DEFAULT_SPEED * (rightReversed ? -1 : 1)},
        ],
      }, {
        ...base, event: 'released', actions: [
          {kind: 'stop', port: leftPort},
          {kind: 'stop', port: rightPort},
        ],
      });
    }
  }
}

export function describeAction(action) {
  if (!action || typeof action !== 'object') return '';
  switch (action.kind) {
    case 'run': {
      const dir = action.speed >= 0 ? 'вперёд' : 'назад';
      return `Мотор ${action.port} ${dir} ${Math.abs(action.speed)}°/с`;
    }
    case 'dc': {
      return `Мотор ${action.port} мощность ${action.power}%`;
    }
    case 'angle': {
      const dir = action.speed >= 0 ? 'вперёд' : 'назад';
      return `Мотор ${action.port} ${action.degrees}° ${dir} (${Math.abs(action.speed)}°/с)`;
    }
    case 'time': {
      const dir = action.speed >= 0 ? 'вперёд' : 'назад';
      const sec = (action.ms / 1000).toFixed(action.ms % 1000 === 0 ? 0 : 1);
      return `Мотор ${action.port} ${sec} сек ${dir} (${Math.abs(action.speed)}°/с)`;
    }
    case 'dcTime': {
      const sec = (action.ms / 1000).toFixed(action.ms % 1000 === 0 ? 0 : 1);
      return `Мотор ${action.port} мощность ${action.power}% ${sec} сек`;
    }
    case 'stop': {
      return `Стоп мотора ${action.port}`;
    }
    case 'wait': {
      return `Пауза ${action.ms} мс`;
    }
    default:
      return '';
  }
}

export function commandsFor(action, protocol = 3) {
  if (!action || typeof action !== 'object') return [];
  switch (action.kind) {
    case 'run':
      return [`m,${action.port},${action.speed}\n`];
    case 'stop':
      return [`m,${action.port},0\n`];
    case 'dc':
      if (protocol < 3) throw new Error('Мощность мотора требует прошивку протокола v3');
      return [`d,${action.port},${action.power}\n`];
    case 'angle':
      if (protocol < 3) throw new Error('Точные обороты требуют прошивку протокола v3');
      return [`a,${action.port},${action.speed},${action.degrees}\n`];
    case 'time':
      if (protocol < 3) throw new Error('Движение по времени требует прошивку протокола v3');
      return [`t,${action.port},${action.speed},${action.ms}\n`];
    case 'dcTime':
      if (protocol < 3) throw new Error('Мощность по времени требует прошивку протокола v3');
      return [`d,${action.port},${action.power}\n`];
    case 'wait':
      return [];
    default:
      return [];
  }
}

export function controllerHandler(program, button, event) {
  return program?.handlers?.find(handler => (typeof button === "object" ? handler.target?.controlId === button.controlId && handler.target?.input === button.input : handler.button === button) && handler.event === event) || null;
}

export function controllerRuntimeErrors(program, protocol, availablePorts) {
  if (!program || !protocol) return [];
  const ports = availablePorts instanceof Set ? availablePorts : new Set(availablePorts || []);
  const errors = [];
  for (const handler of program.handlers || []) {
    const missing = [...new Set(handler.actions.map(action => action.port).filter(port => port && !ports.has(port)))];
    if (missing.length) {
      errors.push({button: handler.button, target: handler.target, scope: "handler", severity: "error", blockId: handler.sourceBlockId,
        code: 'missing-port', message: `Кнопка ${BUTTON_LABELS[handler.button]}: подключите мотор к порту ${missing.join(', ')}`});
    }
    if (protocol < 3 && handler.actions.some(action =>
      ['dc', 'angle', 'time', 'dcTime'].includes(action.kind) ||
      (action.kind === 'run' && Math.abs(action.speed) > 600))) {
      errors.push({button: handler.button, target: handler.target, scope: "handler", severity: "error", blockId: handler.sourceBlockId,
        code: 'protocol-upgrade', message: `Кнопка ${BUTTON_LABELS[handler.button]}: переподключите робота для обновления программы хаба`});
    }
  }
  return errors;
}

function extractBlocks(project) {
  if (!project || typeof project !== 'object') return [];
  const ws = project.workspace;
  if (!ws || typeof ws !== 'object') return [];
  if (Array.isArray(ws.sheets) && ws.sheets.length > 0) {
    return ws.sheets.flatMap(s => (s && Array.isArray(s.blocks) ? s.blocks : []));
  }
  if (Array.isArray(ws.blocks)) {
    return ws.blocks;
  }
  return [];
}

export function compileControllerProgram(project) {
  const result = {
    projectId: project?.id ? String(project.id) : '',
    projectName: project?.name ? String(project.name) : 'Без названия',
    hub: 'spike',
    protocol: 2,
    ports: [],
    handlers: [],
    startup: [],
    errors: [],
  };

  if (!project || typeof project !== 'object') {
    result.errors.push({ code: 'invalid-project', message: 'Неверный файл проекта' });
    return result;
  }

  const hub = String(project.hub || 'spike');
  result.hub = hub;
  if (hub === 'ev3') {
    result.errors.push({
      code: 'unsupported-hub',
      message: 'Пульт поддерживает только роботов SPIKE Prime / Robot Inventor',
    });
    return result;
  }

  const rawBlocks = extractBlocks(project);
  const blocks = rawBlocks.filter(b => b && typeof b === 'object' && typeof b.id === 'string');

  // Find button roots
  const buttonRoots = blocks.filter(b => b.type === 'button' && !b.parentId);
  const startRoots = blocks.filter(b => b.type === 'start' && !b.parentId);
  if (startRoots.length > 1) result.errors.push({code:'multiple-start', scope:'startup', message:'Оставьте одну шапку запуска'});
  const seenHandlers = new Map();
  const allUsedPorts = new Set();
  let maxProtocol = 2;

  for (const root of [...buttonRoots, ...(startRoots.length === 1 ? startRoots : [])]) {
    const isStart = root.type === "start";
    const target = root.target && typeof root.target.controlId === 'string' && typeof root.target.input === 'string' ? root.target : null;
    const btn = target?.input || (CONTROLLER_BUTTONS.includes(root.button) ? root.button : 'up');
    const errorStart = result.errors.length;
    if (!isStart && !target && project.workspace?.controlLayout) result.errors.push({button:btn, blockId:root.id, code:'missing-control', message:'Выберите элемент управления и кнопку'});
    if (target) {
      const controls = project.workspace?.controlLayout?.controls || [];
      const control = controls.find(c => c.id === target.controlId);
      const inputs = {...DIRECTION_INPUTS, drivetrain:['up','down','left','right'],motor:['forward','backward'],'motor-group':['forward','backward'],'legacy-buttons':CONTROLLER_BUTTONS,'motor-panel':['blue','red','green','yellow']};
      if (!control) result.errors.push({blockId:root.id, target, code:'missing-control', message:'Выберите существующий элемент управления'});
      else if (!inputs[control.kind]?.includes(target.input) || (Array.isArray(control.inputs) && !control.inputs.includes(target.input))) result.errors.push({blockId:root.id, target, code:'invalid-input', message:'Выберите доступную кнопку элемента'});
    }
    const ev = root.event === 'released' ? 'released' : 'pressed';
    const handlerKey = `${target?.controlId || "legacy"}:${btn}:${ev}`;

    if (!isStart && seenHandlers.has(handlerKey)) {
      const first = seenHandlers.get(handlerKey);
      if (!result.errors.some(error => error.code === 'duplicate-handler' && error.blockId === first)) {
        result.errors.push({button: btn, blockId: first, code: 'duplicate-handler',
          message: `Дубликат обработчика: кнопка ${BUTTON_LABELS[btn]} ${ev === 'released' ? 'отпущена' : 'нажата'}`});
      }
      result.errors.push({
        button: btn,
        blockId: root.id,
        code: 'duplicate-handler',
        message: `Дубликат обработчика: кнопка ${BUTTON_LABELS[btn] || btn} ${ev === 'released' ? 'отпущена' : 'нажата'}`,
      });
    } else if (!isStart) {
      seenHandlers.set(handlerKey, root.id);
    }

    // Collect child chain
    const actions = [];
    let curr = root;
    const visited = new Set([root.id]);

    while (true) {
      const child = blocks.find(b => b.parentId === curr.id && !b.branch);
      if (!child || visited.has(child.id)) break;
      visited.add(child.id);
      curr = child;

      if (['if', 'start', 'button'].includes(child.type)) {
        result.errors.push({
          button: btn,
          blockId: child.id,
          code: isStart ? 'unsupported-block' : 'bad-child',
          message: 'В программе пульта нельзя использовать этот блок',
        });
        continue;
      }

      if (child.type === 'stop') {
        const port = String(child.motor || 'A');
        const port2 = child.motor2 ? String(child.motor2) : undefined;
        if (![port, ...(port2 ? [port2] : [])].every(p => ['A','B','C','D','E','F'].includes(p))) result.errors.push({button:btn,blockId:child.id,code:'invalid-port',message:'Выберите существующий порт мотора'});
        if (port2 && port2 === port) {
          result.errors.push({
            button: btn,
            blockId: child.id,
            code: 'same-ports',
            message: 'Для остановки двух моторов выберите разные порты',
          });
        }
        actions.push({ kind: 'stop', port });
        allUsedPorts.add(port);
        if (port2 && port2 !== port) {
          actions.push({ kind: 'stop', port: port2 });
          allUsedPorts.add(port2);
        }
        continue;
      }

      if (child.type === 'drive' || child.type === 'pair') {
        const modules = Array.isArray(child.modules) ? child.modules : [];
        if (modules.includes('speed') && modules.includes('power')) {
          result.errors.push({
            button: btn,
            blockId: child.id,
            code: 'speed-and-power',
            message: 'Выберите скорость или мощность, а не оба режима',
          });
        }

        const isPair = child.type === 'pair';
        const portA = String(child.motor || 'A');
        const portB = isPair ? String(child.motor2 || 'B') : null;
        if (![portA, ...(portB ? [portB] : [])].every(p => ['A','B','C','D','E','F'].includes(p))) result.errors.push({button:btn,blockId:child.id,code:'invalid-port',message:'Выберите существующий порт мотора'});

        if (isPair && portA === portB) {
          result.errors.push({
            button: btn,
            blockId: child.id,
            code: 'same-ports',
            message: 'Для связанных моторов выберите два разных порта',
          });
        }

        const powered = modules.includes('power');
        const hasTravel = modules.includes('travel');
        const unit = child.unit || 'rotations';

        if (powered && hasTravel && unit !== 'seconds') {
          result.errors.push({
            button: btn,
            blockId: child.id,
            code: 'power-travel',
            message: 'Для мощности выберите секунды. Для оборотов и градусов используйте скорость',
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

        allUsedPorts.add(portA);
        if (portB) allUsedPorts.add(portB);

        if (!hasTravel) {
          // Continuous run
          if (powered) {
            maxProtocol = 3;
            actions.push({ kind: 'dc', port: portA, power: signA * clampedPower });
            if (portB) actions.push({ kind: 'dc', port: portB, power: signB * clampedPower });
          } else {
            actions.push({ kind: 'run', port: portA, speed: signA * clampedSpeed });
            if (portB) actions.push({ kind: 'run', port: portB, speed: signB * clampedSpeed });
          }
        } else {
          // Travel with finish
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
            // Rotations or degrees
            const degrees = Math.max(1, Math.round(value * (unit === 'rotations' ? 360 : 1)));
            actions.push({ kind: 'angle', port: portA, speed: signA * clampedSpeed, degrees });
            if (portB) actions.push({ kind: 'angle', port: portB, speed: signB * clampedSpeed, degrees });
            const waitMs = Math.round((degrees / clampedSpeed) * 1000) + 150;
            actions.push({ kind: 'wait', ms: waitMs });
          }
        }
        continue;
      }
      result.errors.push({button:btn,blockId:child.id,code:'unsupported-block',message:'Этот блок не поддерживается при управлении'});
    }

    if (actions.length > 50) {
      result.errors.push({
        button: btn,
        blockId: root.id,
        code: 'too-many-actions',
        message: 'Слишком много действий в обработчике (максимум 50)',
      });
    }

    for (const error of result.errors.slice(errorStart)) { error.target = target || undefined; error.scope = isStart ? "startup" : "handler"; error.severity = "error"; }
    if (!isStart && target && actions.length === 0 && result.errors.length === errorStart) result.errors.push({target, blockId:root.id, code:'empty-handler', scope:'handler', severity:'warning', message:'Добавьте действия под событием кнопки'});
    if (isStart) { result.startup = actions; continue; }
    result.handlers.push({
      ...(target ? {target} : {}),
      button: btn,
      event: ev,
      sourceBlockId: root.id,
      actions,
    });
  }

  compileDriveControls(project.workspace?.controlLayout, result, allUsedPorts);
  result.protocol = maxProtocol;
  result.ports = Array.from(allUsedPorts).sort();
  return result;
}
