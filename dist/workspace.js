export const MAX_BLOCKS = 200;
export const MOTOR_SPEED = 360;
export const IF_TOP_HEIGHT = 58;
export const IF_MID_HEIGHT = 48;
export const IF_FOOT_HEIGHT = 28;
export const IF_INDENT = 28;
export const IF_EMPTY_MOUTH = 52;
const ports = {spike: ['A', 'B', 'C', 'D', 'E', 'F'], ev3: ['A', 'B', 'C', 'D']};
const units = ['rotations', 'degrees', 'seconds'];

export function readBlocks(workspace, hub = 'spike') {
  if (!workspace || !Array.isArray(workspace.blocks)) return [];
  const seen = new Set();
  const clean = workspace.blocks.filter(block => block && ['start', 'drive', 'pair', 'if'].includes(block.type) &&
    typeof block.id === 'string' && Number.isFinite(block.x) && Number.isFinite(block.y))
    .filter(block => { if (seen.has(block.id)) return false; seen.add(block.id); return true; })
    .slice(0, MAX_BLOCKS).map(block => {
      const base = {id: block.id, type: block.type, x: Math.round(block.x), y: Math.round(block.y),
        ...(typeof block.parentId === 'string' ? {parentId:block.parentId} : {}),
        ...(block.branch === 'body' ? {branch:'body'} : block.branch === 'else' ? {branch:'else'} : {})};
      if (block.type === 'start' || block.type === 'if') return base;
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
  return layoutChains(cleanLinks(clean));
}

export function addBlock(blocks, id, x, y, type = 'start') {
  if (blocks.length >= MAX_BLOCKS) throw new Error('На доске слишком много блоков.');
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Не удалось определить место блока.');
  if (!['start', 'drive', 'pair', 'if'].includes(type)) throw new Error('Неизвестный блок.');
  const block = {id, type, x: Math.round(x), y: Math.round(y)};
  if (type === 'drive' || type === 'pair') Object.assign(block, {motor:'A', direction:'forward', modules:[], speed:MOTOR_SPEED, power:50, value:1, unit:'rotations'});
  if (type === 'pair') Object.assign(block, {motor2:'B', direction2:'backward'});
  return [...blocks, block];
}

export function moveBlock(blocks, id, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return blocks;
  return blocks.map(block => block.id === id ? {...block, x: Math.round(x), y: Math.round(y)} : block);
}
export function removeBlock(blocks, id) {
  const removed = blocks.find(block => block.id === id);
  return layoutChains(blocks.filter(block => block.id !== id).map(block => {
    if (block.parentId !== id) return block;
    const next = {...block};
    const wasBranch = next.branch === 'body' || next.branch === 'else';
    delete next.parentId;
    delete next.branch;
    if (!wasBranch && removed?.parentId) {
      next.parentId = removed.parentId;
      if (removed.branch) next.branch = removed.branch;
    }
    return next;
  }));
}
export function updateDrive(blocks, id, changes, hub) {
  return readBlocks({blocks:blocks.map(block => block.id === id && ['drive','pair','if'].includes(block.type) ? {...block, ...changes} : block)}, hub);
}

export function generatePybricks(blocks, hub) {
  if (!ports[hub]) throw new Error('Неизвестный тип робота.');
  const clean = readBlocks({blocks}, hub);
  const ordered = executionOrder(clean);
  const driveBlocks = ordered.filter(block => ['drive','pair'].includes(block.type));
  if (!driveBlocks.length) throw new Error('Добавьте на доску блок движения.');
  const usedMotors = new Set(driveBlocks.flatMap(block => block.type === 'pair' ? [block.motor, block.motor2] : [block.motor]));
  const lines = ['# TLC: команды выполняются сверху вниз', `from pybricks.${hub === 'spike' ? 'pupdevices' : 'ev3devices'} import Motor`, 'from pybricks.parameters import Port, Stop', 'from pybricks.tools import wait', '',
    ...[...usedMotors].sort().map(port => `motor_${port.toLowerCase()} = Motor(Port.${port})`), ''];
  function emitBlock(block, indent) {
    if (block.type === 'start') return;
    if (block.type === 'if') {
      lines.push(`${indent}if True:`);
      const firstBody = clean.find(b => b.parentId === block.id && b.branch === 'body');
      const bodyChain = firstBody ? outerChainIds(clean, firstBody.id).map(id => clean.find(b => b.id === id)).filter(b => b && b.type !== 'start') : [];
      if (!bodyChain.length) lines.push(`${indent}    pass`);
      else for (const inner of bodyChain) emitBlock(inner, `${indent}    `);
      lines.push(`${indent}else:`);
      const firstElse = clean.find(b => b.parentId === block.id && b.branch === 'else');
      const elseChain = firstElse ? outerChainIds(clean, firstElse.id).map(id => clean.find(b => b.id === id)).filter(b => b && b.type !== 'start') : [];
      if (!elseChain.length) lines.push(`${indent}    pass`);
      else for (const inner of elseChain) emitBlock(inner, `${indent}    `);
      return;
    }
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
      lines.push(`${indent}# Связанные моторы: независимые направления, общее движение`, `${indent}try:`);
      if (block.unit === 'seconds') {
        const command = powered ? 'dc' : 'run';
        const amount = powered ? block.power : speed;
        lines.push(`${indent}    ${motor}.${command}(${sign * amount})`, `${indent}    ${motor2}.${command}(${sign2 * amount})`, `${indent}    wait(${Math.round(block.value * 1000)})`);
      } else {
        const angle = Math.max(1, Math.round(block.value * (block.unit === 'rotations' ? 360 : 1)));
        const done = name => hub === 'ev3' ? `${name}.control.done()` : `${name}.done()`;
        lines.push(`${indent}    ${motor}.run_angle(${sign * speed}, ${angle}, then=Stop.BRAKE, wait=False)`,
          `${indent}    ${motor2}.run_angle(${sign2 * speed}, ${angle}, then=Stop.BRAKE, wait=False)`,
          `${indent}    while not (${done(motor)} and ${done(motor2)}):`, `${indent}        wait(10)`);
      }
      lines.push(`${indent}finally:`, `${indent}    ${motor}.brake()`, `${indent}    ${motor2}.brake()`, '');
      return;
    }
    if (powered) {
      lines.push(`${indent}${motor}.dc(${sign * block.power})`, `${indent}try:`, `${indent}    wait(${Math.round(block.value * 1000)})`, `${indent}finally:`, `${indent}    ${motor}.brake()`);
    } else if (block.unit === 'seconds') lines.push(`${indent}${motor}.run_time(${sign * speed}, ${Math.round(block.value * 1000)}, then=Stop.BRAKE)`);
    else lines.push(`${indent}${motor}.run_angle(${sign * speed}, ${Math.max(1, Math.round(block.value * (block.unit === 'rotations' ? 360 : 1)))}, then=Stop.BRAKE)`);
  }
  const roots = clean.filter(b => !b.parentId).sort((a,b) => a.y-b.y || a.x-b.x);
  for (const root of roots) {
    for (const id of outerChainIds(clean, root.id)) {
      const b = clean.find(x => x.id === id);
      if (b) emitBlock(b, '');
    }
  }
  return lines.join('\n') + '\n';
}

export const MAX_SHEETS = 32;
export function blockHeight(block) { return block.type === 'if' ? 238 : block.type === 'pair' ? 122 : block.type === 'drive' ? 100 : 56; }
export function cleanLinks(blocks) {
  const byId = new Map(blocks.map(b => [b.id, b])), occupied = new Set();
  const clean = blocks.map(b => {
    const next = {...b};
    const parent = next.parentId ? byId.get(next.parentId) : undefined;
    if (next.branch && parent?.type !== 'if') delete next.branch;
    const slotKey = next.parentId ? `${next.parentId}:${next.branch === 'body' ? 'body' : next.branch === 'else' ? 'else' : 'next'}` : '';
    if (!next.parentId || !parent || next.parentId === next.id || occupied.has(slotKey)) { delete next.parentId; delete next.branch; }
    else occupied.add(slotKey);
    return next;
  });
  const map = new Map(clean.map(b => [b.id,b]));
  for (const block of clean) {
    const seen = new Set([block.id]); let current = block;
    while (current.parentId) {
      if (seen.has(current.parentId)) { delete current.parentId; delete current.branch; break; }
      seen.add(current.parentId); current = map.get(current.parentId);
    }
  }
  return clean;
}
export function outerChainIds(blocks, id) {
  const nextChildren = new Map(blocks.filter(b => b.parentId && !b.branch).map(b => [b.parentId,b.id]));
  const result = [], seen = new Set();
  while (id && !seen.has(id)) { seen.add(id); result.push(id); id = nextChildren.get(id); }
  return result;
}
export function chainIds(blocks, id) {
  const nextChildren = new Map(blocks.filter(b => b.parentId && !b.branch).map(b => [b.parentId,b.id]));
  const bodyChildren = new Map(blocks.filter(b => b.parentId && b.branch === 'body').map(b => [b.parentId,b.id]));
  const elseChildren = new Map(blocks.filter(b => b.parentId && b.branch === 'else').map(b => [b.parentId,b.id]));
  const result = [], seen = new Set();
  function visit(curr) {
    while (curr && !seen.has(curr)) {
      seen.add(curr); result.push(curr);
      const bodyId = bodyChildren.get(curr);
      if (bodyId) visit(bodyId);
      const elseId = elseChildren.get(curr);
      if (elseId) visit(elseId);
      curr = nextChildren.get(curr);
    }
  }
  visit(id);
  return result;
}
export function executionOrder(blocks) {
  const clean = cleanLinks(blocks), map = new Map(clean.map(b => [b.id,b]));
  return clean.filter(b => !b.parentId).sort((a,b) => a.y-b.y || a.x-b.x)
    .flatMap(root => chainIds(clean,root.id).map(id => map.get(id)));
}
export function layoutChains(blocks) {
  const map = new Map(blocks.map(b => [b.id,{...b}]));
  for (const b of executionOrder(blocks)) {
    const next = map.get(b.id), parent = map.get(b.parentId);
    if (parent) {
      if ((next.branch === 'body' || next.branch === 'else') && parent.type === 'if') {
        next.x = parent.x + IF_INDENT;
        next.y = parent.y + (next.branch === 'else' ? IF_TOP_HEIGHT + IF_EMPTY_MOUTH + IF_MID_HEIGHT : IF_TOP_HEIGHT) + 6;
      } else { next.x = parent.x; next.y = parent.y + blockHeight(parent) + 6; }
    }
  }
  return blocks.map(b => map.get(b.id));
}
export function detachChain(blocks,id) {
  return blocks.map(b => { if(b.id !== id) return b; const next={...b}; delete next.parentId; delete next.branch; return next; });
}
export function moveChain(blocks,id,x,y) {
  const root = blocks.find(b => b.id === id);
  if (!root || !Number.isFinite(x) || !Number.isFinite(y)) return blocks;
  const moving = new Set(chainIds(blocks,id));
  const dx=Math.round(x)-root.x, dy=Math.round(y)-root.y;
  return layoutChains(detachChain(blocks,id).map(b => moving.has(b.id) ? {...b,x:b.x+dx,y:b.y+dy} : b));
}
export function attachChain(blocks,id,parentId,branch) {
  const moving = chainIds(blocks,id);
  const parent = blocks.find(b => b.id === parentId);
  if (!blocks.some(b => b.id === id) || !parent || moving.includes(parentId)) return blocks;
  const effectiveBranch = (branch === 'body' || branch === 'else') && parent.type === 'if' ? branch : undefined;
  const outer = outerChainIds(blocks, id);
  const tail = outer[outer.length-1];
  const detached = detachChain(blocks,id);
  const previousChild = detached.find(b => b.parentId === parentId && (effectiveBranch ? b.branch === effectiveBranch : !b.branch));
  return layoutChains(detached.map(b => {
    if(b.id === id) return {...b,parentId,...(effectiveBranch ? {branch:effectiveBranch} : {})};
    if(previousChild && b.id === previousChild.id) { const r = {...b,parentId:tail}; delete r.branch; return r; }
    return b;
  }));
}
export function snapTarget(blocks,id,x,y,threshold=36) {
  const moving=new Set(chainIds(blocks,id)); let best=null, distance=Infinity;
  for(const b of blocks) {
    if(moving.has(b.id)) continue;
    const dx=Math.abs(b.x-x), dy=Math.abs(b.y+blockHeight(b)+6-y);
    if(dx<=threshold && dy<=threshold && dx+dy<distance) { best=b.id; distance=dx+dy; }
  }
  return best;
}
export function readSheets(workspace,hub='spike') {
  if(!Array.isArray(workspace?.sheets) || !workspace.sheets.length)
    return {activeSheetId:'sheet-main',sheets:[{id:'sheet-main',name:'Основная',blocks:readBlocks(workspace,hub)}]};
  const seen=new Set();
  const sheets=workspace.sheets.filter(s=>s && typeof s.id==='string' && s.id && !seen.has(s.id) && seen.add(s.id)).slice(0,MAX_SHEETS)
    .map((s,i)=>({id:s.id,name:String(s.name||`Лист ${i+1}`).trim().slice(0,40)||`Лист ${i+1}`,blocks:readBlocks(s,hub),
      ...(s.view && [s.view.panX,s.view.panY,s.view.zoom].every(Number.isFinite) ? {view:{panX:s.view.panX,panY:s.view.panY,zoom:Math.max(.5,Math.min(2,s.view.zoom))}} : {})}));
  if(!sheets.length) return readSheets(null,hub);
  return {sheets,activeSheetId:sheets.some(s=>s.id===workspace.activeSheetId)?workspace.activeSheetId:sheets[0].id};
}
export function addSheet(state,id,name) {
  if(state.sheets.length>=MAX_SHEETS) throw new Error('Можно создать не больше 32 листов.');
  name=sheetName(state,name);
  if(state.sheets.some(s=>s.id===id)) throw new Error('Лист уже существует.');
  return {sheets:[...state.sheets,{id,name,blocks:[]}],activeSheetId:id};
}
function sheetName(state,name,exceptId) {
  name=String(name||'').trim();
  if(!name || name.length>40) throw new Error('Название листа: от 1 до 40 символов.');
  if(state.sheets.some(s=>s.id!==exceptId && s.name.toLocaleLowerCase()===name.toLocaleLowerCase())) throw new Error('Лист с таким названием уже есть.');
  return name;
}
export function renameSheet(state,id,name) {
  name=sheetName(state,name,id);
  return {...state,sheets:state.sheets.map(s=>s.id===id?{...s,name}:s)};
}
export function deleteSheet(state,id) {
  if(state.sheets.length<=1) throw new Error('В проекте должен остаться хотя бы один лист.');
  const index=state.sheets.findIndex(s=>s.id===id);
  const sheets=state.sheets.filter(s=>s.id!==id);
  return {sheets,activeSheetId:state.activeSheetId===id?sheets[Math.max(0,index-1)].id:state.activeSheetId};
}
