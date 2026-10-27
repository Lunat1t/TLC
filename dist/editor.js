import {HUBS, loadProjects, saveProjects} from './projects.js';
import {addBlock, moveBlock, readBlocks, removeBlock} from './workspace.js';

const $ = id => document.getElementById(id);
const board = $('board');
const layer = $('blockLayer');
const projectId = new URLSearchParams(location.search).get('id');
let storage, projects, project;
let blocks = [], panX = 0, panY = 0, zoom = 1, selectedId = null;
let gesture = null;

function newId() {
  return globalThis.crypto?.randomUUID?.() || 'block-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}
function status(message, error = false) {
  $('saveState').textContent = message;
  $('saveState').classList.toggle('error', error);
}
function save(nextBlocks) {
  const updated = {...project, updatedAt: new Date().toISOString(),
    workspace: {...(project.workspace || {}), blocks: nextBlocks}};
  const next = projects.map(item => item.id === project.id ? updated : item);
  try {
    saveProjects(storage, next);
    projects = next;
    project = updated;
    blocks = nextBlocks;
    status('Сохранено');
    renderBlocks();
  } catch { status('Не удалось сохранить', true); }
}
function view() {
  layer.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + zoom + ')';
  board.style.backgroundSize = (24 * zoom) + 'px ' + (24 * zoom) + 'px';
  board.style.backgroundPosition = panX + 'px ' + panY + 'px';
  $('zoomValue').textContent = Math.round(zoom * 100) + '%';
}
function world(clientX, clientY) {
  const rect = board.getBoundingClientRect();
  return {x: (clientX - rect.left - panX) / zoom, y: (clientY - rect.top - panY) / zoom};
}
function addAt(clientX, clientY) {
  const point = world(clientX, clientY);
  try { save(addBlock(blocks, newId(), point.x - 87, point.y - 28)); closePalette(); }
  catch (error) { status(error.message, true); }
}
function addAtCenter() {
  const rect = board.getBoundingClientRect();
  addAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
}
function renderBlocks() {
  layer.replaceChildren();
  $('boardHint').hidden = blocks.length > 0;
  for (const block of blocks) {
    const element = document.createElement('div');
    element.className = 'canvas-block' + (block.id === selectedId ? ' selected' : '');
    element.tabIndex = 0;
    element.setAttribute('role', 'button');
    element.setAttribute('aria-label', 'Пустой блок. Стрелки перемещают, Delete удаляет');
    element.style.left = block.x + 'px';
    element.style.top = block.y + 'px';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'block-delete';
    remove.textContent = '×';
    remove.setAttribute('aria-label', 'Удалить блок');
    remove.addEventListener('click', event => {
      event.stopPropagation(); selectedId = null; save(removeBlock(blocks, block.id));
    });
    element.append(remove);
    element.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target === remove) return;
      event.preventDefault();
      event.stopPropagation();
      selectedId = block.id;
      layer.querySelectorAll('.selected').forEach(node => node.classList.remove('selected'));
      element.classList.add('selected', 'dragging');
      gesture = {kind:'block', id:block.id, element, startX:event.clientX, startY:event.clientY, x:block.x, y:block.y};
      element.setPointerCapture(event.pointerId);
    });
    element.addEventListener('keydown', event => {
      const offsets = {ArrowLeft:[-16,0], ArrowRight:[16,0], ArrowUp:[0,-16], ArrowDown:[0,16]};
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault(); selectedId = null; save(removeBlock(blocks, block.id)); return;
      }
      if (!offsets[event.key]) return;
      event.preventDefault();
      const [dx,dy] = offsets[event.key];
      selectedId = block.id;
      save(moveBlock(blocks, block.id, block.x + dx, block.y + dy));
      layer.querySelector('.selected')?.focus();
    });
    layer.append(element);
  }
}
function openPalette() {
  $('palette').classList.add('open');
  $('paletteBackdrop').hidden = false;
  $('openPalette').setAttribute('aria-expanded', 'true');
}
function closePalette() {
  $('palette').classList.remove('open');
  $('paletteBackdrop').hidden = true;
  $('openPalette').setAttribute('aria-expanded', 'false');
}

try {
  storage = window.localStorage;
  projects = loadProjects(storage);
  project = projects.find(item => item.id === projectId);
  if (!project) throw new Error('Проект не найден. Вернитесь к списку проектов.');
  blocks = readBlocks(project.workspace);
  $('projectTitle').textContent = project.name;
  $('projectHub').textContent = HUBS[project.hub];
  document.title = project.name + ' — TLC';
  $('legacyController').hidden = project.hub !== 'spike';
  renderBlocks();
  requestAnimationFrame(() => {
    panX = board.clientWidth / 2;
    panY = board.clientHeight / 2;
    view();
  });
} catch (error) {
  $('projectTitle').textContent = 'Проект недоступен';
  $('boardHint').textContent = error.message;
  $('emptyBlock').disabled = true;
  status('Ошибка проекта', true);
}

$('categoryToggle').addEventListener('click', () => {
  const open = $('categoryToggle').getAttribute('aria-expanded') !== 'true';
  $('categoryToggle').setAttribute('aria-expanded', String(open));
  $('blockCategory').hidden = !open;
});
$('openPalette').addEventListener('click', openPalette);
$('closePalette').addEventListener('click', closePalette);
$('paletteBackdrop').addEventListener('click', closePalette);

$('emptyBlock').addEventListener('pointerdown', event => {
  if (!project || event.button !== 0) return;
  event.preventDefault();
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.style.left = event.clientX + 'px';
  ghost.style.top = event.clientY + 'px';
  document.body.append(ghost);
  gesture = {kind:'palette', ghost};
  $('emptyBlock').setPointerCapture(event.pointerId);
});
$('emptyBlock').addEventListener('pointermove', event => {
  if (gesture?.kind !== 'palette') return;
  gesture.ghost.style.left = event.clientX + 'px';
  gesture.ghost.style.top = event.clientY + 'px';
});
$('emptyBlock').addEventListener('pointerup', event => {
  if (gesture?.kind !== 'palette') return;
  gesture.ghost.remove();
  gesture = null;
  const rect = board.getBoundingClientRect();
  if (event.clientX >= rect.left && event.clientX <= rect.right &&
      event.clientY >= rect.top && event.clientY <= rect.bottom) addAt(event.clientX, event.clientY);
  else addAtCenter();
});
$('emptyBlock').addEventListener('pointercancel', () => {
  if (gesture?.kind === 'palette') gesture.ghost.remove();
  gesture = null;
});
$('emptyBlock').addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); addAtCenter();}
});

board.addEventListener('pointerdown', event => {
  if (event.button !== 0 || event.target.closest('.canvas-block')) return;
  selectedId = null;
  layer.querySelectorAll('.selected').forEach(node => node.classList.remove('selected'));
  gesture = {kind:'pan', startX:event.clientX, startY:event.clientY, panX, panY};
  board.classList.add('panning');
  board.setPointerCapture(event.pointerId);
});
board.addEventListener('pointermove', event => {
  if (gesture?.kind === 'block') {
    const {element, startX, startY, x, y} = gesture;
    element.style.left = Math.round(x + (event.clientX - startX) / zoom) + 'px';
    element.style.top = Math.round(y + (event.clientY - startY) / zoom) + 'px';
  } else if (gesture?.kind === 'pan') {
    panX = gesture.panX + event.clientX - gesture.startX;
    panY = gesture.panY + event.clientY - gesture.startY;
    view();
  }
});
board.addEventListener('pointerup', event => {
  if (gesture?.kind === 'block') {
    const {id, startX, startY, x, y} = gesture;
    gesture = null;
    save(moveBlock(blocks, id, x + (event.clientX - startX) / zoom, y + (event.clientY - startY) / zoom));
  } else if (gesture?.kind === 'pan') gesture = null;
  board.classList.remove('panning');
});
board.addEventListener('pointercancel', () => {
  if (gesture?.kind === 'block') renderBlocks();
  gesture = null;
  board.classList.remove('panning');
});

function setZoom(next) {
  next = Math.min(2, Math.max(.5, next));
  const x = board.clientWidth / 2, y = board.clientHeight / 2;
  panX = x - (x - panX) * next / zoom;
  panY = y - (y - panY) * next / zoom;
  zoom = next;
  view();
}
$('zoomIn').addEventListener('click', () => setZoom(zoom + .25));
$('zoomOut').addEventListener('click', () => setZoom(zoom - .25));
$('resetView').addEventListener('click', () => {
  zoom = 1; panX = board.clientWidth / 2; panY = board.clientHeight / 2; view();
});
$('bluetoothButton').addEventListener('click', () => $('bluetoothDialog').showModal());
$('closeBluetooth').addEventListener('click', () => $('bluetoothDialog').close());
