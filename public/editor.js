import {HUBS, loadProjects, saveProjects} from './projects.js';
import {addBlock, moveBlock, readBlocks, removeBlock, updateDrive, generatePybricks, layoutChains, chainIds, detachChain, moveChain, attachChain, snapTarget, executionOrder, readSheets, addSheet, renameSheet, deleteSheet} from './workspace.js';

const $ = id => document.getElementById(id);
const board = $('board');
const layer = $('blockLayer');
const projectId = new URLSearchParams(location.search).get('id');
let storage, projects, project;
let blocks = [], panX = 0, panY = 0, zoom = 1, selectedId = null;
let gesture = null;
let sheetState, sheetAction = 'rename';

function newId() {
  return globalThis.crypto?.randomUUID?.() || 'block-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}
function status(message, error = false) {
  $('saveState').textContent = message;
  $('saveState').classList.toggle('error', error);
}
function currentSheet() { return sheetState.sheets.find(s => s.id === sheetState.activeSheetId); }
function snapshotSheets() {
  return {...sheetState,sheets:sheetState.sheets.map(s => s.id===sheetState.activeSheetId ? {...s,blocks,view:{panX,panY,zoom}} : s)};
}
function persistSheets(nextState, redraw=true) {
  const updated={...project,updatedAt:new Date().toISOString(),workspace:nextState};
  const next=projects.map(p=>p.id===project.id?updated:p);
  try {
    saveProjects(storage,next); projects=next; project=updated; sheetState=nextState;
    blocks=currentSheet().blocks; status('Сохранено');
    renderSheets(); if(redraw) renderBlocks(); return true;
  } catch { status('Не удалось сохранить',true); return false; }
}
function save(nextBlocks, redraw=true) {
  const state=snapshotSheets();
  state.sheets=state.sheets.map(s=>s.id===state.activeSheetId?{...s,blocks:layoutChains(nextBlocks)}:s);
  return persistSheets(state,redraw);
}
function validFields() {
  const invalid=layer.querySelector('input:invalid');
  if(invalid) { invalid.reportValidity(); return false; } return true;
}
function loadSheetView() {
  const v=currentSheet().view;
  panX=v?.panX ?? board.clientWidth/2; panY=v?.panY ?? board.clientHeight/2; zoom=v?.zoom ?? 1; view();
}
function switchSheet(id) {
  if(gesture || !validFields() || id===sheetState.activeSheetId) return;
  const state={...snapshotSheets(),activeSheetId:id};
  selectedId=null;
  if(persistSheets(state)) loadSheetView();
}
function renderSheets() {
  $('sheetTabs').replaceChildren();
  for(const sheet of sheetState.sheets) {
    const button=document.createElement('button'); button.type='button'; button.className='sheet-tab';
    button.textContent=sheet.name; button.setAttribute('role','tab');
    button.setAttribute('aria-selected',String(sheet.id===sheetState.activeSheetId));
    button.addEventListener('click',()=>switchSheet(sheet.id));
    button.addEventListener('dblclick',()=>{ switchSheet(sheet.id); openSheetDialog('rename'); });
    $('sheetTabs').append(button);
  }
  $('activeSheetName').textContent=currentSheet().name;
  $('deleteSheet').disabled=sheetState.sheets.length===1;
  $('addSheet').disabled=sheetState.sheets.length>=32;
}
function openSheetDialog(action) {
  if(!project || !validFields()) return;
  sheetAction=action;
  $('sheetDialogTitle').textContent=action==='add'?'Новый лист':action==='delete'?'Удалить лист?':'Переименовать лист';
  $('sheetNameLabel').hidden=action==='delete';
  $('sheetDeleteMessage').hidden=action!=='delete';
  $('sheetDeleteMessage').textContent='Удалить «'+currentSheet().name+'» вместе с блоками?';
  let number=sheetState.sheets.length+1;
  while(sheetState.sheets.some(s=>s.name==='Лист '+number)) number++;
  $('sheetName').value=action==='add'?'Лист '+number:currentSheet().name;
  $('sheetDialogError').textContent='';
  $('sheetConfirm').textContent=action==='delete'?'Удалить':'Сохранить';
  $('sheetDialog').showModal();
}
function finishBlockMove(id,x,y,snap=true) {
  let next=moveChain(blocks,id,x,y);
  const target=snap?snapTarget(next,id,x,y):null;
  if(target) next=attachChain(next,id,target);
  save(next);
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
function addAt(clientX, clientY, type = 'empty') {
  const point = world(clientX, clientY);
  try {
    const id=newId(), x=point.x-(type!=='empty'?135:87), y=point.y-28;
    let next=addBlock(blocks,id,x,y,type);
    const target=snapTarget(next,id,x,y); if(target) next=attachChain(next,id,target);
    selectedId=id; save(next); closePalette();
  }
  catch (error) { status(error.message, true); }
}
function addAtCenter(type = 'empty') {
  const rect = board.getBoundingClientRect();
  addAt(rect.left + rect.width / 2, rect.top + rect.height / 2, type);
}
function renderBlocks() {
  layer.replaceChildren();
  $('boardHint').hidden = blocks.length > 0;
  const stepNumbers=new Map();
  for(const root of executionOrder(blocks).filter(b=>!b.parentId)) chainIds(blocks,root.id).forEach((id,i)=>stepNumbers.set(id,i+1));
  for (const block of blocks) {
    const paired = block.type === 'pair';
    const motorBlock = block.type === 'drive' || paired;
    const element = document.createElement('div');
    element.className = 'canvas-block' + (motorBlock ? ' drive-block' + (paired ? ' pair-block' : '') : '') + (block.id === selectedId ? ' selected' : '');
    element.dataset.blockId=block.id;
    element.tabIndex = 0;
    element.setAttribute('role', motorBlock ? 'group' : 'button');
    element.setAttribute('aria-label', motorBlock ? (paired ? 'Связанные моторы. Перетащите за заголовок' : 'Блок движения мотора. Перетащите за заголовок') : 'Пустой блок. Стрелки перемещают, Delete удаляет');
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
    const step=document.createElement('span'); step.className='block-step'; step.textContent=String(stepNumbers.get(block.id)||1); element.append(step);
    if(block.parentId) {
      element.classList.add('connected');
      const detach=document.createElement('button'); detach.type='button'; detach.className='block-detach'; detach.textContent='↗'; detach.setAttribute('aria-label','Отсоединить блок с цепочкой');
      detach.addEventListener('click',()=>finishBlockMove(block.id,block.x+60,block.y,false)); element.append(detach);
    }
    if (motorBlock) {
      const title = document.createElement('div');
      title.className = 'drive-title'; title.textContent = paired ? '⇉  Связанные моторы' : '↗  Движение мотора';
      const controls = document.createElement('div'); controls.className = 'drive-controls';
      const makeSelect = (label, field, choices) => {
        const select = document.createElement('select'); select.setAttribute('aria-label', label);
        for (const [value, text] of choices) { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); }
        select.value = block[field];
        select.addEventListener('change', () => save(updateDrive(blocks, block.id, {[field]:select.value}, project.hub)));
        return select;
      };
      const motorOptions = (project.hub === 'ev3' ? 'ABCD' : 'ABCDEF').split('').map(port => [port, 'Мотор ' + port]);
      const motor = makeSelect(paired ? 'Порт первого мотора' : 'Порт мотора', 'motor', motorOptions);
      const direction = makeSelect(paired ? 'Направление первого мотора' : 'Направление мотора', 'direction', [['forward','Вперёд'], ['backward','Назад']]);
      const value = document.createElement('input'); value.type = 'number'; value.required = true; value.inputMode = 'decimal'; value.min = '0.01'; value.max = '10000'; value.step = 'any'; value.value = block.value; value.setAttribute('aria-label', 'Значение движения');
      value.addEventListener('input', () => {
        const number = Number(value.value);
        if (!value.value || !Number.isFinite(number) || number < .01 || number > 10000) { status('Введите число от 0,01 до 10000', true); return; }
        save(updateDrive(blocks, block.id, {value:number}, project.hub), false);
      });
      const unit = makeSelect('Единица измерения', 'unit', [['rotations','оборотов'], ['degrees','градусов'], ['seconds','секунд']]);
      controls.append(motor, direction);
      if (paired) {
        const second = document.createElement('div'); second.className = 'drive-controls pair-second';
        second.append(makeSelect('Порт второго мотора', 'motor2', motorOptions),
          makeSelect('Направление второго мотора', 'direction2', [['forward','Вперёд'],['backward','Назад']]));
        controls.classList.add('pair-controls'); controls.append(second);
      }
      const moduleArea = document.createElement('div'); moduleArea.className = 'motor-modules';
      const commit = changes => save(updateDrive(blocks, block.id, changes, project.hub));
      const row = (name, label, children) => {
        const item = document.createElement('div'); item.className = 'motor-module';
        const caption = document.createElement('span'); caption.textContent = label;
        const removeModule = document.createElement('button'); removeModule.type = 'button'; removeModule.textContent = '×';
        removeModule.setAttribute('aria-label', 'Удалить модуль ' + label);
        removeModule.addEventListener('click', () => commit({modules:block.modules.filter(m => m !== name)}));
        const fields = document.createElement('div'); fields.className = 'motor-module-fields';
        fields.append(...children);
        item.append(caption, fields, removeModule); moduleArea.append(item);
      };
      for (const name of block.modules) {
        if (name === 'travel') row(name, 'Величина движения', [value, unit]);
        else {
          const input = document.createElement('input'); input.type = 'number'; input.min = '1'; input.max = name === 'speed' ? '1000' : '100'; input.value = block[name];
          input.setAttribute('aria-label', name === 'speed' ? 'Скорость, градусов в секунду' : 'Мощность, процентов');
          input.addEventListener('input', () => { if (input.checkValidity() && input.value) save(updateDrive(blocks, block.id, {[name]:Number(input.value)}, project.hub), false); });
          row(name, name === 'speed' ? 'Скорость (°/с)' : 'Мощность (%)', [input]);
        }
      }
      const plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '+'; plus.className = 'module-add'; plus.setAttribute('aria-label',paired ? 'Добавить модуль связанных моторов' : 'Добавить модуль мотора'); plus.setAttribute('aria-expanded','false');
      const menu = document.createElement('div'); menu.hidden = true; menu.className = 'module-menu';
      plus.addEventListener('click', () => { const open = menu.hidden; closeModuleMenus(); menu.hidden = !open; plus.setAttribute('aria-expanded', String(open)); });
      for (const [name,label] of [['speed','Скорость'],['power','Мощность'],['travel','Величина движения']]) {
        const option = document.createElement('button'); option.type = 'button'; option.textContent = label;
        option.disabled = block.modules.includes(name);
        option.addEventListener('click', () => {
          const modules = block.modules.filter(m => !(name === 'speed' && m === 'power') && !(name === 'power' && m === 'speed'));
          commit({modules:[...modules,name], ...(name === 'power' ? {unit:'seconds'} : {})});
        }); menu.append(option);
      }
      const hint = document.createElement('small'); hint.textContent = (paired ? 'Оба мотора запускаются вместе. Обороты и градусы относятся к валу каждого мотора. Направления задаются отдельно. ' : '') + 'Без модуля скорости: 360°/с. Для запуска задайте величину движения. Скорость и мощность заменяют друг друга.';
      const picker = document.createElement('div'); picker.className = 'module-picker';
      picker.addEventListener('pointerdown', event => event.stopPropagation());
      picker.append(plus, menu);
      const base = document.createElement('div'); base.className = 'motor-base'; base.append(title, controls);
      const strip = document.createElement('div'); strip.className = 'motor-strip';
      strip.append(base, moduleArea, picker);
      element.title = hint.textContent + ' Порядок модулей не влияет на выполнение.';
      element.append(strip);
    }
    element.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button, select, input')) return;
      event.preventDefault();
      event.stopPropagation();
      selectedId = block.id;
      layer.querySelectorAll('.selected').forEach(node => node.classList.remove('selected'));
      element.classList.add('selected', 'dragging');
      gesture = {kind:'block', id:block.id, element, startX:event.clientX, startY:event.clientY, x:block.x, y:block.y, moving:chainIds(blocks,block.id), moved:false};
      element.setPointerCapture(event.pointerId);
    });
    element.addEventListener('keydown', event => {
      if (event.target !== element) return;
      const offsets = {ArrowLeft:[-16,0], ArrowRight:[16,0], ArrowUp:[0,-16], ArrowDown:[0,16]};
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault(); selectedId = null; save(removeBlock(blocks, block.id)); return;
      }
      if (!offsets[event.key]) return;
      event.preventDefault();
      const [dx,dy] = offsets[event.key];
      selectedId = block.id;
      finishBlockMove(block.id, block.x+dx, block.y+dy);
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
  sheetState=readSheets(project.workspace,project.hub);
  blocks=currentSheet().blocks;
  renderSheets();
  $('projectTitle').textContent = project.name;
  $('projectHub').textContent = HUBS[project.hub];
  document.title = project.name + ' — TLC';
  $('legacyController').hidden = project.hub !== 'spike';
  renderBlocks();
  requestAnimationFrame(() => {
    loadSheetView();
  });
} catch (error) {
  $('projectTitle').textContent = 'Проект недоступен';
  $('boardHint').textContent = error.message;
  $('emptyBlock').disabled = true;
  $('driveBlock').disabled = true;
  $('pairBlock').disabled = true;
  $('exportCode').disabled = true;
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

for (const [id, type] of [['emptyBlock', 'empty'], ['driveBlock', 'drive'], ['pairBlock', 'pair']]) {
  const button = $(id);
  button.addEventListener('pointerdown', event => {
    if (!project || event.button !== 0) return;
    event.preventDefault();
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost' + (type !== 'empty' ? ' drive-ghost' : '');
    ghost.style.left = event.clientX + 'px'; ghost.style.top = event.clientY + 'px';
    document.body.append(ghost);
    gesture = {kind:'palette', ghost, type};
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener('pointermove', event => {
    if (gesture?.kind !== 'palette') return;
    gesture.ghost.style.left = event.clientX + 'px'; gesture.ghost.style.top = event.clientY + 'px';
  });
  button.addEventListener('pointerup', event => {
    if (gesture?.kind !== 'palette') return;
    gesture.ghost.remove(); gesture = null;
    const rect = board.getBoundingClientRect();
    if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) addAt(event.clientX, event.clientY, type);
    else addAtCenter(type);
  });
  button.addEventListener('pointercancel', () => { if (gesture?.kind === 'palette') gesture.ghost.remove(); gesture = null; });
  button.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); addAtCenter(type);}
  });
}

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
    const {startX,startY,x,y,moving,id}=gesture;
    const dx=(event.clientX-startX)/zoom, dy=(event.clientY-startY)/zoom;
    gesture.moved ||= Math.hypot(event.clientX-startX,event.clientY-startY)>4;
    if(!gesture.moved) return;
    const positions=new Map(blocks.map(b=>[b.id,b]));
    for(const node of layer.children) {
      node.classList.remove('snap-target');
      if(moving.includes(node.dataset.blockId)) {
        const original=positions.get(node.dataset.blockId);
        node.style.left=Math.round(original.x+dx)+'px'; node.style.top=Math.round(original.y+dy)+'px'; node.classList.add('dragging');
      }
    }
    const target=snapTarget(blocks,id,x+dx,y+dy);
    for(const node of layer.children) if(node.dataset.blockId===target) node.classList.add('snap-target');
  } else if (gesture?.kind === 'pan') {
    panX = gesture.panX + event.clientX - gesture.startX;
    panY = gesture.panY + event.clientY - gesture.startY;
    view();
  }
});
board.addEventListener('pointerup', event => {
  if (gesture?.kind === 'block') {
    const {id,startX,startY,x,y,moved}=gesture;
    gesture=null;
    if(moved) finishBlockMove(id,x+(event.clientX-startX)/zoom,y+(event.clientY-startY)/zoom);
    else renderBlocks();
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

$('exportCode').addEventListener('click', () => {
  const invalid = layer.querySelector('input:invalid');
  if (invalid) { invalid.reportValidity(); return; }
  try { $('codeOutput').value = '# Лист: '+currentSheet().name.replace(/[\r\n]/g,' ')+'\n'+generatePybricks(blocks, project.hub); $('codeTitle').textContent='Программа Pybricks — '+currentSheet().name; $('codeDialog').showModal(); }
  catch (error) { status(error.message, true); }
});
$('closeCode').addEventListener('click', () => $('codeDialog').close());
$('downloadCode').addEventListener('click', () => {
  const blob = new Blob([$('codeOutput').value], {type:'text/x-python;charset=utf-8'});
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = 'tlc_program.py'; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});


function closeModuleMenus() {
  layer.querySelectorAll('.module-menu').forEach(menu => { menu.hidden = true; });
  layer.querySelectorAll('.module-add').forEach(button => button.setAttribute('aria-expanded', 'false'));
}
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('.module-picker')) closeModuleMenus();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    const active = layer.querySelector('.module-menu:not([hidden])');
    active?.parentElement.querySelector('.module-add')?.focus();
    closeModuleMenus();
  }
});

$('addSheet').addEventListener('click',()=>openSheetDialog('add'));
$('renameSheet').addEventListener('click',()=>openSheetDialog('rename'));
$('deleteSheet').addEventListener('click',()=>openSheetDialog('delete'));
$('sheetCancel').addEventListener('click',()=>$('sheetDialog').close());
$('sheetForm').addEventListener('submit',event=>{
  event.preventDefault();
  try {
    const state=snapshotSheets();
    const next=sheetAction==='add'?addSheet(state,newId(),$('sheetName').value):sheetAction==='rename'?renameSheet(state,state.activeSheetId,$('sheetName').value):deleteSheet(state,state.activeSheetId);
    selectedId=null;
    if(persistSheets(next)) { loadSheetView(); $('sheetDialog').close(); }
  } catch(error) { $('sheetDialogError').textContent=error.message; }
});
window.addEventListener('pagehide',()=>{ if(project && sheetState) persistSheets(snapshotSheets(),false); });
