export const MAX_BLOCKS = 200;
export const MOTOR_SPEED = 360;
const ports = {spike: ['A', 'B', 'C', 'D', 'E', 'F'], ev3: ['A', 'B', 'C', 'D']};
const units = ['rotations', 'degrees', 'seconds'];

export function readBlocks(workspace, hub = 'spike') {
  if (!workspace || !Array.isArray(workspace.blocks)) return [];
  return workspace.blocks.filter(block => block && ['empty', 'drive', 'pair'].includes(block.type) &&
    typeof block.id === 'string' && Number.isFinite(block.x) && Number.isFinite(block.y))
    .slice(0, MAX_BLOCKS).map(block => {
      const base = {id: block.id, type: block.type, x: block.x, y: block.y};
      if (block.type === 'empty') return base;
      return {...base, ...(block.type === 'pair' ? {
        motor2: ports[hub]?.includes(block.motor2) ? block.motor2 : 'B',
        direction2: block.direction2 === 'backward' ? 'backward' : 'forward'
      } : {}), modules: Array.isArray(block.modules) ? [...new Set(block.modules.filter(m => ['speed','power','travel'].includes(m)))] : ['travel'],
        speed: Number.isFinite(block.speed) && block.speed > 0 && block.speed <= 1000 ? block.speed : MOTOR_SPEED,
        power: Number.isFinite(block.power) && block.power > 0 && block.power <= 100 ? block.power : 50, motor: ports[hub]?.includes(block.motor) ? block.motor : 'A',
        direction: block.direction === 'backward' ? 'backward' : 'forward',
        value: Number.isFinite(block.value) && block.value > 0 && block.value <= 10000 ? block.value : 1,
        unit: units.includes(block.unit) ? block.unit : 'rotations'};
    });
}

export function addBlock(blocks, id, x, y, type = 'empty') {
  if (blocks.length >= MAX_BLOCKS) throw new Error('На доске слишком много блоков.');
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Не удалось определить место блока.');
  if (!['empty', 'drive', 'pair'].includes(type)) throw new Error('Неизвестный блок.');
  const block = {id, type, x: Math.round(x), y: Math.round(y)};
  if (type === 'drive' || type === 'pair') Object.assign(block, {motor:'A', direction:'forward', modules:[], speed:MOTOR_SPEED, power:50, value:1, unit:'rotations'});
  if (type === 'pair') Object.assign(block, {motor2:'B', direction2:'backward'});
  return [...blocks, block];
}

export function moveBlock(blocks, id, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return blocks;
  return blocks.map(block => block.id === id ? {...block, x: Math.round(x), y: Math.round(y)} : block);
}
export function removeBlock(blocks, id) { return blocks.filter(block => block.id !== id); }
export function updateDrive(blocks, id, changes, hub) {
  return readBlocks({blocks:blocks.map(block => block.id === id && ['drive','pair'].includes(block.type) ? {...block, ...changes} : block)}, hub);
}

export function generatePybricks(blocks, hub) {
  if (!ports[hub]) throw new Error('Неизвестный тип робота.');
  const driveBlocks = readBlocks({blocks}, hub).filter(block => ['drive','pair'].includes(block.type)).sort((a,b) => a.y - b.y || a.x - b.x);
  if (!driveBlocks.length) throw new Error('Добавьте на доску блок движения.');
  const used = [...new Set(driveBlocks.flatMap(block => block.type === 'pair' ? [block.motor, block.motor2] : [block.motor]))].sort();
  const lines = ['# TLC: команды выполняются сверху вниз', `from pybricks.${hub === 'spike' ? 'pupdevices' : 'ev3devices'} import Motor`, 'from pybricks.parameters import Port, Stop', 'from pybricks.tools import wait', '',
    ...used.map(port => `motor_${port.toLowerCase()} = Motor(Port.${port})`), ''];
  for (const block of driveBlocks) {
    if (block.modules.includes('speed') && block.modules.includes('power')) throw new Error('Выберите скорость или мощность, а не оба режима.');
    const powered = block.modules.includes('power');
    const hasTravel = block.modules.includes('travel');
    if (!hasTravel) throw new Error('Добавьте модуль «Величина движения», чтобы задать остановку мотора.');
    if (powered && block.unit !== 'seconds') throw new Error('Для мощности выберите секунды. Для точных оборотов и градусов используйте скорость.');
    const speed = block.modules.includes('speed') ? block.speed : MOTOR_SPEED;
    const sign = block.direction === 'backward' ? -1 : 1;
    const motor = `motor_${block.motor.toLowerCase()}`;
    if (block.type === 'pair') {
      if (block.motor === block.motor2) throw new Error('Для связанных моторов выберите два разных порта.');
      const motor2 = `motor_${block.motor2.toLowerCase()}`;
      const sign2 = block.direction2 === 'backward' ? -1 : 1;
      lines.push('# Связанные моторы: независимые направления, общее движение', 'try:');
      if (block.unit === 'seconds') {
        const command = powered ? 'dc' : 'run';
        const amount = powered ? block.power : speed;
        lines.push(`    ${motor}.${command}(${sign * amount})`, `    ${motor2}.${command}(${sign2 * amount})`, `    wait(${Math.round(block.value * 1000)})`);
      } else {
        const angle = Math.max(1, Math.round(block.value * (block.unit === 'rotations' ? 360 : 1)));
        const done = name => hub === 'ev3' ? `${name}.control.done()` : `${name}.done()`;
        lines.push(`    ${motor}.run_angle(${sign * speed}, ${angle}, then=Stop.BRAKE, wait=False)`,
          `    ${motor2}.run_angle(${sign2 * speed}, ${angle}, then=Stop.BRAKE, wait=False)`,
          `    while not (${done(motor)} and ${done(motor2)}):`, '        wait(10)');
      }
      lines.push('finally:', `    ${motor}.brake()`, `    ${motor2}.brake()`, '');
      continue;
    }
    if (powered) {
      lines.push(`${motor}.dc(${sign * block.power})`, 'try:', `    wait(${Math.round(block.value * 1000)})`, 'finally:', `    ${motor}.brake()`);
    } else if (block.unit === 'seconds') lines.push(`${motor}.run_time(${sign * speed}, ${Math.round(block.value * 1000)}, then=Stop.BRAKE)`);
    else lines.push(`${motor}.run_angle(${sign * speed}, ${Math.max(1, Math.round(block.value * (block.unit === 'rotations' ? 360 : 1)))}, then=Stop.BRAKE)`);
  }
  return lines.join('\n') + '\n';
}

