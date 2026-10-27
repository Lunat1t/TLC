export const MAX_BLOCKS = 200;

export function readBlocks(workspace) {
  if (!workspace || !Array.isArray(workspace.blocks)) return [];
  return workspace.blocks.filter(block => block && block.type === 'empty' &&
    typeof block.id === 'string' && Number.isFinite(block.x) && Number.isFinite(block.y))
    .slice(0, MAX_BLOCKS)
    .map(block => ({id: block.id, type: 'empty', x: block.x, y: block.y}));
}

export function addBlock(blocks, id, x, y) {
  if (blocks.length >= MAX_BLOCKS) throw new Error('На доске слишком много блоков.');
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Не удалось определить место блока.');
  return [...blocks, {id, type: 'empty', x: Math.round(x), y: Math.round(y)}];
}

export function moveBlock(blocks, id, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return blocks;
  return blocks.map(block => block.id === id ? {...block, x: Math.round(x), y: Math.round(y)} : block);
}

export function removeBlock(blocks, id) {
  return blocks.filter(block => block.id !== id);
}
