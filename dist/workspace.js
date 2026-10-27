export const MAX_BLOCKS = 200;
export const MOTOR_SPEED = 360;
const ports = {spike: ['A', 'B', 'C', 'D', 'E', 'F'], ev3: ['A', 'B', 'C', 'D']};
const units = ['rotations', 'degrees', 'seconds'];

export function readBlocks(workspace, hub = 'spike') {
  if (!workspace || !Array.isArray(workspace.blocks)) return [];
  return workspace.blocks.filter(block => block && ['empty', 'drive'].includes(block.type) &&
    typeof block.id === 'string' && Number.isFinite(block.x) && Number.isFinite(block.y))
    .slice(0, MAX_BLOCKS).map(block => {
      const base = {id: block.id, type: block.type, x: block.x, y: block.y};
      if (block.type === 'empty') return base;
      return {...base, motor: ports[hub]?.includes(block.motor) ? block.motor : 'A',
        direction: block.direction === 'backward' ? 'backward' : 'forward',
        value: Number.isFinite(block.value) && block.value > 0 && block.value <= 10000 ? block.value : 1,
        unit: units.includes(block.unit) ? block.unit : 'rotations'};
    });
}

export function addBlock(blocks, id, x, y, type = 'empty') {
  if (blocks.length >= MAX_BLOCKS) throw new Error('На доске слишком много блоков.');
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Не удалось определить место блока.');
  if (!['empty', 'drive'].includes(type)) throw new Error('Неизвестный блок.');
  const block = {id, type, x: Math.round(x), y: Math.round(y)};
  if (type === 'drive') Object.assign(block, {motor:'A', direction:'forward', value:1, unit:'rotations'});
  return [...blocks, block];
}

export function moveBlock(blocks, id, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return blocks;
  return blocks.map(block => block.id === id ? {...block, x: Math.round(x), y: Math.round(y)} : block);
}
export function removeBlock(blocks, id) { return blocks.filter(block => block.id !== id); }
export function updateDrive(blocks, id, changes, hub) {
  return readBlocks({blocks:blocks.map(block => block.id === id && block.type === 'drive' ? {...block, ...changes} : block)}, hub);
}

export function generatePybricks(blocks, hub) {
  if (!ports[hub]) throw new Error('Неизвестный тип робота.');
  const driveBlocks = readBlocks({blocks}, hub).filter(block => block.type === 'drive').sort((a,b) => a.y - b.y || a.x - b.x);
  if (!driveBlocks.length) throw new Error('Добавьте на доску блок движения.');
  const used = [...new Set(driveBlocks.map(block => block.motor))].sort();
  const lines = ['# TLC: команды выполняются сверху вниз', `from pybricks.${hub === 'spike' ? 'pupdevices' : 'ev3devices'} import Motor`, 'from pybricks.parameters import Port, Stop', '',
    ...used.map(port => `motor_${port.toLowerCase()} = Motor(Port.${port})`), ''];
  for (const block of driveBlocks) {
    const sign = block.direction === 'backward' ? -1 : 1;
    const motor = `motor_${block.motor.toLowerCase()}`;
    if (block.unit === 'seconds') lines.push(`${motor}.run_time(${sign * MOTOR_SPEED}, ${Math.round(block.value * 1000)}, then=Stop.BRAKE)`);
    else lines.push(`${motor}.run_angle(${sign * MOTOR_SPEED}, ${Math.max(1, Math.round(block.value * (block.unit === 'rotations' ? 360 : 1)))}, then=Stop.BRAKE)`);
  }
  return lines.join('\n') + '\n';
}
