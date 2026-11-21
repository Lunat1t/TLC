import {
  CONTROLLER_BUTTONS,
  BUTTON_LABELS,
  BUTTON_KEYS,
  DEFAULT_SPEED,
  DRIVE_PORTS,
  DEFAULT_DRIVE_SETTINGS,
  DIRECTION_INPUTS,
  CONTROL_KIND_INPUTS,
  WHEEL_DIRECTIONS,
  isDriveSettings,
  isPairedBlock,
  normalizeChassisSettings,
  resolveProjectChassis,
  getStopPorts,
  expandActionBlock,
} from './block-registry.js';

export {
  CONTROLLER_BUTTONS,
  BUTTON_LABELS,
  BUTTON_KEYS,
  DRIVE_PORTS,
  DEFAULT_DRIVE_SETTINGS,
  isDriveSettings,
  isPairedBlock,
  resolveProjectChassis,
  getStopPorts,
};

function compileDriveControls(layout, result, usedPorts, projectChassis, directWorkspaceChassis) {
  if (!Array.isArray(layout?.controls)) return 2;
  const areas = Array.isArray(layout.areas) ? layout.areas : [];
  let maxProtocol = 2;
  for (const control of layout.controls) {
    const inputs = Object.hasOwn(DIRECTION_INPUTS, control?.kind) ? DIRECTION_INPUTS[control.kind] : null;
    if (!inputs || typeof control.id !== 'string' || !control.id) continue;
    const area = typeof control.areaId === 'string' && control.areaId && areas.find(candidate => candidate?.id === control.areaId);
    const settings = directWorkspaceChassis
      ? directWorkspaceChassis
      : area?.drive !== undefined
        ? area.drive
        : projectChassis?.configured
          ? projectChassis.settings
          : DEFAULT_DRIVE_SETTINGS;
    if (!area || !isDriveSettings(settings)) {
      for (const input of inputs) {
        result.errors.push({
          target: { controlId: control.id, input }, scope: 'handler', severity: 'error',
          code: 'invalid-drive-settings', message: 'Выберите разные порты шасси',
        });
      }
      continue;
    }

    const { leftPort, rightPort, leftReversed, rightReversed } = settings;
    const speed = Number.isFinite(settings.speed) ? Math.max(1, Math.min(1000, Math.round(settings.speed))) : DEFAULT_SPEED;
    if (speed > 600) maxProtocol = 3;
    for (const input of inputs) {
      // Explicit event blocks replace automatic driving for this arrow.
      if (result.handlers.some(handler => handler.target?.controlId === control.id && handler.target.input === input && !handler.driveAreaId)) continue;
      usedPorts.add(leftPort);
      usedPorts.add(rightPort);
      const [left, right] = WHEEL_DIRECTIONS[input];
      const base = { target: { controlId: control.id, input }, button: input, sourceBlockId: control.id, driveAreaId: area.id };
      result.handlers.push({
        ...base, event: 'pressed', actions: [
          { kind: 'run', port: leftPort, speed: left * speed * (leftReversed ? -1 : 1) },
          { kind: 'run', port: rightPort, speed: right * speed * (rightReversed ? -1 : 1) },
        ],
      }, {
        ...base, event: 'released', actions: [
          { kind: 'stop', port: leftPort },
          { kind: 'stop', port: rightPort },
        ],
      });
    }
  }
  return maxProtocol;
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
    case 'stopAll': {
      return 'Стоп всех моторов';
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
    case 'stopAll':
      return DRIVE_PORTS.map(port => `m,${port},0\n`);
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
  return program?.handlers?.find(handler => (typeof button === 'object' ? handler.target?.controlId === button.controlId && handler.target?.input === button.input : handler.button === button) && handler.event === event) || null;
}

export function controllerRuntimeErrors(program, protocol, availablePorts) {
  if (!program || !protocol) return [];
  const ports = availablePorts instanceof Set ? availablePorts : new Set(availablePorts || []);
  const errors = [];
  for (const handler of program.handlers || []) {
    const missing = [...new Set(handler.actions.map(action => action.port).filter(port => port && !ports.has(port)))];
    if (missing.length) {
      errors.push({
        button: handler.button, target: handler.target, scope: 'handler', severity: 'error', blockId: handler.sourceBlockId,
        code: 'missing-port', message: `Подключите мотор ${missing.join(', ')}`,
      });
    }
    if (protocol < 3 && handler.actions.some(action =>
      ['dc', 'angle', 'time', 'dcTime'].includes(action.kind) ||
      (action.kind === 'run' && Math.abs(action.speed) > 600))) {
      errors.push({
        button: handler.button, target: handler.target, scope: 'handler', severity: 'error', blockId: handler.sourceBlockId,
        code: 'protocol-upgrade', message: 'Переподключите робота для обновления хаба',
      });
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

function buildKnownControls(project, blocks) {
  const layoutControls = Array.isArray(project?.workspace?.controlLayout?.controls)
    ? project.workspace.controlLayout.controls
    : [];
  const areas = Array.isArray(project?.workspace?.controlLayout?.areas)
    ? project.workspace.controlLayout.areas
    : [];
  const knownIds = new Set(layoutControls.map(c => c?.id).filter(Boolean));
  const merged = [...layoutControls];
  for (const block of blocks) {
    if (block?.type !== 'motor-buttons' || !block.controlAreaId || knownIds.has(block.id)) continue;
    if (!areas.some(area => area?.id === block.controlAreaId)) continue;
    const hidden = Array.isArray(block.hiddenControlButtons) ? block.hiddenControlButtons : [];
    const mods = Array.isArray(block.controlModules) ? block.controlModules : [];
    const inputs = ['blue', ...mods].filter(color => !hidden.includes(color));
    merged.push({
      id: block.id,
      areaId: block.controlAreaId,
      kind: 'motor-panel',
      label: 'Панель моторов',
      inputs,
    });
    knownIds.add(block.id);
  }
  return merged;
}

function eventsConflict(a, b) {
  return a === b || a === 'hold' || b === 'hold';
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
      message: 'Пульт поддерживает только SPIKE Prime',
    });
    return result;
  }

  const rawBlocks = extractBlocks(project);
  const blocks = rawBlocks.filter(b => b && typeof b === 'object' && typeof b.id === 'string');
  const chassis = resolveProjectChassis(project);
  const controls = buildKnownControls(project, blocks);

  const buttonRoots = blocks.filter(b => b.type === 'button' && !b.parentId);
  const startRoots = blocks.filter(b => b.type === 'start' && !b.parentId);
  if (startRoots.length > 1) result.errors.push({ code: 'multiple-start', scope: 'startup', message: 'Оставьте одну шапку запуска' });

  const seenHandlers = new Map();
  const allUsedPorts = new Set();
  let maxProtocol = 2;

  for (const root of [...buttonRoots, ...(startRoots.length === 1 ? startRoots : [])]) {
    const isStart = root.type === 'start';
    const target = root.target && typeof root.target.controlId === 'string' && typeof root.target.input === 'string' ? root.target : null;
    const btn = target?.input || (CONTROLLER_BUTTONS.includes(root.button) ? root.button : 'up');
    const errorStart = result.errors.length;
    if (!isStart && !target && project.workspace?.controlLayout) {
      result.errors.push({ button: btn, blockId: root.id, code: 'missing-control', message: 'Выберите пульт и кнопку' });
    }
    if (target) {
      const control = controls.find(c => c.id === target.controlId);
      if (!control) {
        result.errors.push({ blockId: root.id, target, code: 'missing-control', message: 'Выберите пульт' });
      } else if (!CONTROL_KIND_INPUTS[control.kind]?.includes(target.input) || (Array.isArray(control.inputs) && !control.inputs.includes(target.input))) {
        result.errors.push({ blockId: root.id, target, code: 'invalid-input', message: 'Кнопка недоступна' });
      }
    }
    const ev = root.event === 'hold' ? 'hold' : root.event === 'released' ? 'released' : 'pressed';
    const inputKey = `${target?.controlId || 'legacy'}:${btn}`;

    if (!isStart) {
      const previous = seenHandlers.get(inputKey) || [];
      const conflicting = previous.filter(entry => eventsConflict(entry.event, ev));
      if (conflicting.length > 0) {
        const label = BUTTON_LABELS[btn] || btn;
        for (const prev of conflicting) {
          if (!result.errors.some(error => error.code === 'duplicate-handler' && error.blockId === prev.blockId)) {
            result.errors.push({
              button: btn,
              blockId: prev.blockId,
              code: 'duplicate-handler',
              message: `Дубль ${label}`,
            });
          }
        }
        result.errors.push({
          button: btn,
          blockId: root.id,
          code: 'duplicate-handler',
          message: `Дубль ${label}`,
        });
      }
      seenHandlers.set(inputKey, [...previous, { event: ev, blockId: root.id }]);
    }

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
          message: 'Блок здесь не работает',
        });
        continue;
      }

      if (['stop', 'drive', 'pair', 'chassis'].includes(child.type)) {
        const expanded = expandActionBlock(child, { hub, button: btn, chassis });
        result.errors.push(...expanded.errors);
        actions.push(...expanded.actions);
        for (const port of expanded.usedPorts) allUsedPorts.add(port);
        if (expanded.maxProtocol > maxProtocol) maxProtocol = expanded.maxProtocol;
        continue;
      }

      result.errors.push({ button: btn, blockId: child.id, code: 'unsupported-block', message: 'Блок не поддерживается' });
    }

    if (actions.length > 50) {
      result.errors.push({
        button: btn,
        blockId: root.id,
        code: 'too-many-actions',
        message: 'Максимум 50 действий',
      });
    }

    for (const error of result.errors.slice(errorStart)) {
      error.target = target || undefined;
      error.scope = isStart ? 'startup' : 'handler';
      error.severity = 'error';
    }
    if (!isStart && target && actions.length === 0 && result.errors.length === errorStart) {
      result.errors.push({ target, blockId: root.id, code: 'empty-handler', scope: 'handler', severity: 'warning', message: 'Добавьте действия под событием кнопки' });
    }
    if (isStart) { result.startup = actions; continue; }
    result.handlers.push({
      ...(target ? { target } : {}),
      button: btn,
      event: ev,
      sourceBlockId: root.id,
      actions,
    });
  }

  const directWorkspaceChassis = normalizeChassisSettings(project.workspace?.chassis);
  const driveProtocol = compileDriveControls(project.workspace?.controlLayout, result, allUsedPorts, chassis, directWorkspaceChassis);
  if (driveProtocol > maxProtocol) maxProtocol = driveProtocol;
  result.protocol = maxProtocol;
  result.ports = Array.from(allUsedPorts).sort();
  return result;
}
