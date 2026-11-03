export const HUB_PORTS = Object.freeze({
  prime: ['A', 'B', 'C', 'D', 'E', 'F'],
  inventor: ['A', 'B', 'C', 'D', 'E', 'F'],
  technic: ['A', 'B', 'C', 'D'],
  move: ['A', 'B', 'C', 'D'],
  city: ['A', 'B'],
  essential: ['A', 'B'],
});
export const HUB_LABELS = Object.freeze({
  prime: 'SPIKE Prime', inventor: 'Robot Inventor', technic: 'Technic Hub',
  move: 'Move Hub', city: 'City Hub', essential: 'Essential Hub',
});
export const ALL_PORTS = ['A', 'B', 'C', 'D', 'E', 'F'];
export const MAX_MOTOR_SPEED = 600;
export const STORAGE_KEY = 'tlc.controller-layout.v1';
export function defaultConfig() {
  return {
    version: 1, hub: 'prime',
    ports: Object.fromEntries(ALL_PORTS.map(port => [port, {speed: 45, reverse: false}])),
    devices: [
      {id: 'drive', type: 'drivetrain', name: 'Привод', leftPorts: ['A'], rightPorts: ['D']},
      {id: 'action', type: 'motor', name: 'Мотор действия', ports: ['B']},
    ],
    moduleLayout: [{deviceId: 'drive', x: 0, y: 0}, {deviceId: 'action', x: 0.5, y: 0}],
    gamepad: {driveId: 'drive', actionDeviceId: 'action', leftPort: 'A', rightPort: 'D', actionPort: 'B', actionDirection: 1},
    controls: [
      {id: 'drive-a', type: 'pair', label: 'Мотор A', port: 'A', x: 0, y: 1, direction: 1},
      {id: 'drive-d', type: 'pair', label: 'Мотор D', port: 'D', x: 3, y: 1, direction: 1},
    ],
  };
}
export function validateConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1 || !Object.hasOwn(HUB_PORTS, raw.hub)) throw new Error('Неизвестная конфигурация пульта');
  const allowed = HUB_PORTS[raw.hub];
  const ports = {};
  for (const port of ALL_PORTS) {
    const value = raw.ports?.[port];
    const speed = Number(value?.speed);
    if (!Number.isInteger(speed) || speed < 0 || speed > 100 || typeof value?.reverse !== 'boolean') throw new Error('Неверная скорость или направление порта ' + port);
    ports[port] = {speed, reverse: value.reverse};
  }
  if (!Array.isArray(raw.controls) || raw.controls.length > 12) throw new Error('Слишком много кнопок');
  const ids = new Set(), slots = new Set();
  const controls = raw.controls.map(item => {
    if (!item || typeof item !== 'object' || !['pair', 'single'].includes(item.type)) throw new Error('Неверный тип кнопки');
    if (typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{1,50}$/.test(item.id) || ids.has(item.id)) throw new Error('Повторяется идентификатор кнопки');
    ids.add(item.id);
    const label = String(item.label ?? '').trim();
    if (!label || label.length > 32) throw new Error('Название кнопки: 1–32 символа');
    if (!allowed.includes(item.port)) throw new Error('Порт ' + item.port + ' отсутствует на выбранном хабе');
    if (!Number.isInteger(item.x) || item.x < 0 || item.x > 3 || !Number.isInteger(item.y) || item.y < 0 || item.y > 2) throw new Error('Кнопка вне поля');
    const slot = item.x + ':' + item.y;
    if (slots.has(slot)) throw new Error('Две кнопки занимают одно место');
    slots.add(slot);
    if (![1, -1].includes(item.direction)) throw new Error('Неверное направление кнопки');
    return {id: item.id, type: item.type, label, port: item.port, x: item.x, y: item.y, direction: item.direction};
  });
  const legacyPairs = controls.filter(item => item.type === 'pair');
  const legacyAction = controls.find(item => item.type === 'single');
  const leftDefault = legacyPairs[0]?.port || 'A';
  const rightDefault = legacyPairs.find(item => item.port !== leftDefault)?.port || allowed.find(port => port !== leftDefault) || null;
  const defaults = {
    leftPort: leftDefault,
    rightPort: rightDefault,
    actionPort: legacyAction && legacyAction.port !== leftDefault && legacyAction.port !== rightDefault
      ? legacyAction.port : allowed.find(port => port !== leftDefault && port !== rightDefault) || null,
    actionDirection: legacyAction?.direction || 1,
  };
  const previous = {...defaults, ...(raw.gamepad || {})};
  const devices = Array.isArray(raw.devices) ? raw.devices.map((item, index) => {
    if (!item || typeof item !== 'object' || !['drivetrain', 'motor', 'motor-group'].includes(item.type)) throw new Error('Неизвестный модуль');
    if (typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{1,50}$/.test(item.id)) throw new Error('Неверный номер модуля');
    const name = String(item.name || '').trim();
    if (!name || name.length > 32) throw new Error('Название модуля: 1–32 символа');
    if (item.type === 'drivetrain') {
      const leftPorts = Array.isArray(item.leftPorts) ? item.leftPorts : [];
      const rightPorts = Array.isArray(item.rightPorts) ? item.rightPorts : [];
      if (!leftPorts.length || leftPorts.length > 2 || leftPorts.length !== rightPorts.length) throw new Error('Приводу нужны равные группы моторов слева и справа');
      return {id: item.id, type: item.type, name, leftPorts, rightPorts};
    }
    const itemPorts = item.ports;
    const expected = item.type === 'motor' ? 1 : 2;
    if (!Array.isArray(itemPorts) || itemPorts.length !== expected) throw new Error('Проверь порты модуля ' + name);
    return {id: item.id, type: item.type, name, ports: itemPorts};
  }) : (() => {
    const pair = {id: 'drive', type: 'drivetrain', name: 'Привод', leftPorts: [previous.leftPort], rightPorts: [previous.rightPort]};
    const legacyDevices = [pair];
    if (previous.actionPort) legacyDevices.push({id: 'action', type: 'motor', name: 'Мотор действия', ports: [previous.actionPort]});
    return legacyDevices;
  })();
  if (devices.length > 12) throw new Error('Можно добавить не более 12 модулей');
  const deviceIds = new Set(), occupied = new Set();
  for (const device of devices) {
    if (deviceIds.has(device.id)) throw new Error('Номер модуля повторяется');
    deviceIds.add(device.id);
    const assigned = device.type === 'drivetrain' ? [...device.leftPorts, ...device.rightPorts] : device.ports;
    for (const port of assigned) {
      if (!allowed.includes(port)) throw new Error('Порт ' + port + ' отсутствует на выбранном хабе');
      if (occupied.has(port)) throw new Error('Порт ' + port + ' уже занят другим модулем');
      occupied.add(port);
    }
  }
  const drives = devices.filter(item => item.type === 'drivetrain');
  if (drives.length > 1) throw new Error('Можно добавить только один привод');
  const layoutInput = raw.moduleLayout ?? devices.map((item, index) => ({deviceId: item.id, x: (index % 3) / 2, y: Math.floor(index / 3) / 3}));
  if (!Array.isArray(layoutInput) || layoutInput.length !== devices.length) throw new Error('У каждого модуля должен быть один блок управления');
  const layoutIds = new Set();
  const moduleLayout = layoutInput.map(item => {
    if (!item || typeof item !== 'object' || typeof item.deviceId !== 'string' || !deviceIds.has(item.deviceId) || layoutIds.has(item.deviceId) ||
        typeof item.x !== 'number' || typeof item.y !== 'number' || !Number.isFinite(item.x) || !Number.isFinite(item.y) ||
        item.x < 0 || item.x > 1 || item.y < 0 || item.y > 1) throw new Error('Неверное положение блока управления');
    const width = item.width ?? 206, height = item.height ?? 176;
    if (!Number.isInteger(width) || width < 190 || width > 480 || !Number.isInteger(height) || height < 170 || height > 420 ||
        (item.manual !== undefined && typeof item.manual !== 'boolean')) throw new Error('Неверный размер блока управления');
    layoutIds.add(item.deviceId);
    return {deviceId: item.deviceId, x: item.x, y: item.y, width, height, manual: item.manual ?? false};
  });
  const drive = drives[0] || null;
  const driveId = previous.driveId ?? drive?.id ?? null;
  if (driveId && (!drive || drive.id !== driveId)) throw new Error('Выбранный привод не найден');
  const actionDevices = devices.filter(item => item.type !== 'drivetrain');
  const actionDeviceId = previous.actionDeviceId !== undefined ? previous.actionDeviceId : actionDevices.find(item => item.ports.includes(previous.actionPort))?.id ?? null;
  const actionDevice = actionDevices.find(item => item.id === actionDeviceId) || null;
  if (actionDeviceId && !actionDevice) throw new Error('Модуль действия не найден');
  const leftPorts = drive?.leftPorts || [];
  const rightPorts = drive?.rightPorts || [];
  const actionPorts = actionDevice?.ports || [];
  const gamepad = {driveId: drive?.id || null, actionDeviceId: actionDevice?.id || null,
    leftPorts, rightPorts, actionPorts, leftPort: leftPorts[0] || null, rightPort: rightPorts[0] || null,
    actionPort: actionPorts[0] || null, actionDirection: previous.actionDirection};
  if (![1, -1].includes(gamepad.actionDirection)) throw new Error('Неверное направление мотора действия');
  return {version: 1, hub: raw.hub, ports, devices, moduleLayout, gamepad, controls};
}
export function motorSpeed(config, port, direction) {
  const setting = config.ports[port];
  return Math.round(MAX_MOTOR_SPEED * setting.speed / 100) * direction * (setting.reverse ? -1 : 1);
}
export function nextFreeSlot(controls) {
  const occupied = new Set(controls.map(item => item.x + ':' + item.y));
  for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) if (!occupied.has(x + ':' + y)) return {x, y};
  return null;
}
export function commandFor(port, speed) {
  if (!ALL_PORTS.includes(port) || !Number.isInteger(speed) || Math.abs(speed) > MAX_MOTOR_SPEED) throw new Error('Недопустимая команда мотора');
  return 'm,' + port + ',' + speed + '\n';
}
