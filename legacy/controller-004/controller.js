import {
  CONTROLLER_BUTTONS,
  BUTTON_LABELS,
  BUTTON_KEYS,
  compileControllerProgram,
  controllerHandler,
  controllerRuntimeErrors,
  describeAction,
  commandsFor,
} from './controller-program.js';
import {SERVICE, COMMAND_EVENT, commandBytes, parseEvent} from './pybricks-protocol.js';
import {subscribeNotifications} from './notifications.js';

const $ = id => document.getElementById(id);
const PROJECTS_STORAGE_KEY = 'robot-studio-projects-v1';

let projects = [];
let currentProjectId = null;
let currentProject = null;
let compiledProgram = null;
let activeProgramErrors = [];

let device = null;
let characteristic = null;
let connected = false;
let ready = false;
let starting = false;
let protocolVersion = 3;
let availablePorts = new Set();
let stdoutBuffer = '';
let writeQueue = Promise.resolve();
let lastAck = 0;
let lastHeartbeat = 0;
let heartbeatPending = false;
let startTimer = null;

const activeRunners = new Map();
const portOwners = new Map();
const heldKeys = new Set();

function notice(message) {
  const el = $('notice');
  if (!el) return;
  el.textContent = message;
  el.hidden = !message;
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Aborted'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    }, {once: true});
  });
}

function setConnectionUI() {
  const statusEl = $('status');
  if (statusEl) {
    if (ready) {
      statusEl.textContent = 'Хаб готов';
    } else if (connected) {
      statusEl.textContent = 'Хаб подключён';
    } else {
      statusEl.textContent = 'Не подключён';
    }
    statusEl.classList.toggle('ready', ready);
  }

  const modeBadge = $('modeBadge');
  if (modeBadge) {
    if (ready) {
      modeBadge.textContent = 'Робот управляется';
      modeBadge.className = 'mode-badge live';
    } else {
      modeBadge.textContent = 'Пробный режим · без робота';
      modeBadge.className = 'mode-badge trial';
    }
  }

  const connectBtn = $('connect');
  if (connectBtn) {
    connectBtn.disabled = connected;
    connectBtn.hidden = connected;
  }

  const disconnectBtn = $('disconnect');
  if (disconnectBtn) {
    disconnectBtn.hidden = !connected;
  }

  const startBtn = $('start');
  if (startBtn) {
    startBtn.disabled = !connected || starting || ready;
  }
}

function addLogEntry(btnLabel, eventKind, actionText) {
  const log = $('eventLog');
  if (!log) return;

  const empty = log.querySelector('.event-log-empty');
  if (empty) empty.remove();

  const now = new Date();
  const timeStr = [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join(':');

  const li = document.createElement('li');
  li.className = 'log-entry';

  const timeSpan = document.createElement('span');
  timeSpan.className = 'log-time';
  timeSpan.textContent = timeStr;

  const btnSpan = document.createElement('span');
  btnSpan.className = 'log-btn';
  btnSpan.textContent = btnLabel;

  const eventSpan = document.createElement('span');
  eventSpan.className = `log-event ${eventKind}`;
  eventSpan.textContent = eventKind === 'pressed' ? 'нажата' : eventKind === 'released' ? 'отпущена' : eventKind;

  const actionSpan = document.createElement('span');
  actionSpan.className = `log-action ${actionText ? '' : 'none'}`;
  actionSpan.textContent = actionText || '(нет действий)';

  li.append(timeSpan, btnSpan, eventSpan, actionSpan);
  log.appendChild(li);

  while (log.children.length > 30) {
    log.removeChild(log.firstChild);
  }

  log.scrollTop = log.scrollHeight;
}

function writeBytes(bytes) {
  if (!characteristic) return Promise.reject(new Error('Хаб отключён'));
  const target = characteristic;
  const operation = writeQueue.catch(() => {}).then(() => Promise.race([
    target.writeValueWithResponse ? target.writeValueWithResponse(bytes) : target.writeValue(bytes),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Хаб не отвечает')), 1200)),
  ]));
  writeQueue = operation;
  return operation;
}

function sendLine(line) {
  return writeBytes(commandBytes(line));
}

function emergencyStop(reason = '', sendStop = true) {
  ready = false;
  for (const runner of activeRunners.values()) {
    runner.controller.abort();
  }
  activeRunners.clear();
  portOwners.clear();

  for (const btnName of CONTROLLER_BUTTONS) {
    const el = $(`btn-${btnName}`);
    if (el) {
      el.classList.remove('pressed');
      el.setAttribute('aria-pressed', 'false');
    }
  }
  heldKeys.clear();

  const stopped = sendStop && connected && characteristic
    ? sendLine('x\n').catch(() => {})
    : Promise.resolve();

  setConnectionUI();
  compileAndRender();

  if (reason) {
    notice(reason);
    addLogEntry('СТОП', 'stop', reason);
  }
  return stopped;
}

async function disconnect(message = 'Bluetooth отключён') {
  if (startTimer) clearTimeout(startTimer);
  startTimer = null;
  starting = false;
  await emergencyStop();
  connected = false;
  availablePorts.clear();

  const old = device;
  device = null;
  characteristic = null;
  stdoutBuffer = '';

  if (old?.gatt?.connected) {
    try { old.gatt.disconnect(); } catch {}
  }

  setConnectionUI();
  notice(message);
}

function onLine(line) {
  if (line === 'SOCER2_ACK') {
    lastAck = performance.now();
    return;
  }
  if (line.startsWith('SOCER3_READY|') || line.startsWith('SOCER2_READY|')) {
    if (startTimer) clearTimeout(startTimer);
    startTimer = null;
    starting = false;
    protocolVersion = line.startsWith('SOCER3_READY|') ? 3 : 2;
    const prefix = line.startsWith('SOCER3_READY|') ? 'SOCER3_READY|' : 'SOCER2_READY|';
    availablePorts = new Set(line.slice(prefix.length).split(',').filter(Boolean));
    ready = true;
    lastAck = performance.now();
    setConnectionUI();
    compileAndRender();
    notice(
      protocolVersion === 3
        ? 'Хаб готов (протокол v3). Доступные порты: ' + [...availablePorts].join(', ')
        : 'Хаб готов (протокол v2). Доступные порты: ' + [...availablePorts].join(', ')
    );
    addLogEntry('ХАБ', 'ready', `Хаб готов v${protocolVersion} (порты: ${[...availablePorts].join(', ')})`);
  } else if (line === 'SOCER2_LINK_LOST') {
    emergencyStop('Команды перестали поступать. Моторы остановлены.');
  } else if (line === 'SOCER2_NO_MOTORS') {
    notice('Хаб не обнаружил моторы. Проверь подключение и перезапусти программу.');
  } else if (line === 'SOCER2_STOP') {
    if (ready) emergencyStop('Программа на хабе остановлена.', false);
  }
}

function onEvent(event) {
  const parsed = parseEvent(event.target.value);
  if (parsed.type === 'status' && !parsed.running && ready) {
    emergencyStop('Программа остановлена на хабе.', false);
  }
  if (parsed.type !== 'stdout') return;
  stdoutBuffer += parsed.text;
  while (stdoutBuffer.includes('\n')) {
    const index = stdoutBuffer.indexOf('\n');
    const line = stdoutBuffer.slice(0, index).trim();
    stdoutBuffer = stdoutBuffer.slice(index + 1);
    if (line) onLine(line);
  }
  if (stdoutBuffer.length > 200) stdoutBuffer = '';
}

async function runLiveActions(btnName, actions) {
  const previous = activeRunners.get(btnName);
  if (previous) previous.controller.abort();
  if ((!actions || actions.length === 0) && !previous) return;
  const controller = new AbortController();
  const signal = controller.signal;
  const ports = new Set((actions || []).map(action => action.port).filter(Boolean));
  activeRunners.set(btnName, {controller, ports});

  try {
    if (previous) {
      for (const port of previous.ports) {
        if (portOwners.get(port) === previous.controller) {
          portOwners.delete(port);
          await sendLine(`m,${port},0\n`);
        }
      }
    }
    if (!actions || actions.length === 0) return;
    for (const action of actions) {
      if (signal.aborted) break;
      if (action.kind === 'wait') {
        await delay(action.ms, signal);
        continue;
      }
      const cmds = commandsFor(action, protocolVersion);
      for (const cmd of cmds) {
        if (signal.aborted) break;
        await sendLine(cmd);
        if (action.port) {
          if (action.kind === 'stop') portOwners.delete(action.port);
          else portOwners.set(action.port, controller);
        }
      }
    }
  } catch (err) {
    if (!signal.aborted) {
      void disconnect('Ошибка исполнения: ' + safeError(err));
    }
  } finally {
    if (activeRunners.get(btnName)?.controller === controller) {
      activeRunners.delete(btnName);
    }
  }
}

function handleButtonEvent(btnName, eventKind) {
  const el = $(`btn-${btnName}`);
  const btnLabel = BUTTON_LABELS[btnName] || btnName;

  if (eventKind === 'pressed') {
    el?.classList.add('pressed');
    el?.setAttribute('aria-pressed', 'true');
  } else {
    el?.classList.remove('pressed');
    el?.setAttribute('aria-pressed', 'false');
  }

  const blockingError = activeProgramErrors.find(error => !error.button || error.button === btnName);
  if (blockingError) {
    addLogEntry(btnLabel, eventKind, blockingError.message);
    return;
  }
  const handler = controllerHandler(compiledProgram, btnName, eventKind);
  const actions = handler?.actions || [];
  const actionText = actions.map(describeAction).join(' + ');

  addLogEntry(btnLabel, eventKind, actionText);

  if (ready && characteristic) {
    runLiveActions(btnName, actions);
  }
}

function loadProjectsFromStorage() {
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function updateEditorLink() {
  const link = $('editInEditor');
  if (!link) return;
  if (currentProjectId) {
    link.href = `/editor?id=${encodeURIComponent(currentProjectId)}`;
  } else {
    link.href = '/editor';
  }
}

function compileAndRender() {
  const errorsContainer = $('programErrors');

  if (!currentProject) {
    compiledProgram = null;
    activeProgramErrors = [];
    if (errorsContainer) {
      errorsContainer.hidden = true;
      errorsContainer.innerHTML = '';
    }
    for (const btnName of CONTROLLER_BUTTONS) {
      const el = $(`btn-${btnName}`);
      if (el) {
        el.setAttribute('data-has-handler', 'false');
        el.removeAttribute('data-has-error');
        el.title = 'Нет выбранного проекта';
      }
    }
    return;
  }

  compiledProgram = compileControllerProgram(currentProject);
  activeProgramErrors = [
    ...compiledProgram.errors,
    ...(ready ? controllerRuntimeErrors(compiledProgram, protocolVersion, availablePorts) : []),
  ];

  if (errorsContainer) {
    if (activeProgramErrors.length > 0) {
      errorsContainer.hidden = false;
      errorsContainer.innerHTML = '';
      const heading = document.createElement('strong');
      heading.textContent = '⚠️ Ошибки в программе пульта:';
      const list = document.createElement('ul');
      for (const error of activeProgramErrors) {
        const item = document.createElement('li');
        item.textContent = error.message;
        list.appendChild(item);
      }
      const linkWrap = document.createElement('div');
      const link = document.createElement('a');
      link.href = `/editor?id=${encodeURIComponent(currentProject.id)}`;
      link.textContent = '✎ Открыть в редакторе для исправления';
      linkWrap.appendChild(link);
      errorsContainer.append(heading, list, linkWrap);
    } else {
      errorsContainer.hidden = true;
      errorsContainer.innerHTML = '';
    }
  }

  for (const btnName of CONTROLLER_BUTTONS) {
    const el = $(`btn-${btnName}`);
    if (!el) continue;

    const pressedHandler = controllerHandler(compiledProgram, btnName, 'pressed');
    const releasedHandler = controllerHandler(compiledProgram, btnName, 'released');
    const hasHandler = Boolean(
      pressedHandler?.actions.length || releasedHandler?.actions.length
    );

    const hasError = activeProgramErrors.some(e => !e.button || e.button === btnName);

    el.setAttribute('data-has-handler', hasHandler ? 'true' : 'false');
    if (hasError) {
      el.setAttribute('data-has-error', 'true');
    } else {
      el.removeAttribute('data-has-error');
    }

    const label = BUTTON_LABELS[btnName] || btnName;
    if (hasError) {
      el.title = `Кнопка ${label}: ошибка в программе`;
    } else if (hasHandler) {
      const pDesc = pressedHandler?.actions.map(describeAction).join('; ') || 'нет';
      const rDesc = releasedHandler?.actions.map(describeAction).join('; ') || 'нет';
      el.title = `Кнопка ${label}\nНажата: ${pDesc}\nОтпущена: ${rDesc}`;
    } else {
      el.title = `Кнопка ${label}: нет действий (добавьте в редакторе)`;
    }
  }
}

function syncProjectList(targetId) {
  if (ready || activeRunners.size > 0) emergencyStop();
  projects = loadProjectsFromStorage();
  const select = $('project');

  if (select) {
    select.innerHTML = '';

    if (projects.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Нет проектов (создайте в редакторе)';
      select.appendChild(opt);
      currentProject = null;
      currentProjectId = null;
      updateEditorLink();
      compileAndRender();
      return;
    }

    const found =
      projects.find(p => p.id === targetId) ||
      projects.find(p => p.id === currentProjectId) ||
      projects[0];

    for (const p of projects) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} (${p.hub === 'spike' ? 'SPIKE' : 'EV3'})`;
      select.appendChild(opt);
    }

    select.value = found.id;
    currentProjectId = found.id;
    currentProject = found;
  }

  updateEditorLink();
  compileAndRender();
}

// Attach gamepad button event listeners
for (const btnName of CONTROLLER_BUTTONS) {
  const el = $(`btn-${btnName}`);
  if (!el) continue;

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch {}
    handleButtonEvent(btnName, 'pressed');
  });

  const handlePointerUp = (e) => {
    try {
      if (el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
    } catch {}
    handleButtonEvent(btnName, 'released');
  };

  el.addEventListener('pointerup', handlePointerUp);
  el.addEventListener('pointercancel', () => emergencyStop('Касание прервано. Моторы остановлены.'));
}

// Keyboard navigation
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT')) {
    return;
  }

  const btnName = BUTTON_KEYS[e.code];
  if (!btnName) return;

  if (e.repeat || heldKeys.has(e.code)) {
    e.preventDefault();
    return;
  }

  e.preventDefault();
  heldKeys.add(e.code);
  handleButtonEvent(btnName, 'pressed');
});

window.addEventListener('keyup', (e) => {
  const btnName = BUTTON_KEYS[e.code];
  if (!btnName) return;

  if (heldKeys.has(e.code)) {
    heldKeys.delete(e.code);
    e.preventDefault();
    handleButtonEvent(btnName, 'released');
  }
});

// Window blur & visibility safety stops
window.addEventListener('blur', () => {
  for (const code of heldKeys) {
    const btnName = BUTTON_KEYS[code];
    if (btnName) handleButtonEvent(btnName, 'released');
  }
  heldKeys.clear();
  emergencyStop();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    emergencyStop();
  }
});

window.addEventListener('pagehide', () => {
  emergencyStop();
  device?.gatt?.disconnect();
});

// UI Buttons
$('project')?.addEventListener('change', (e) => {
  const newId = e.target.value;
  if (newId && newId !== currentProjectId) {
    syncProjectList(newId);
    const url = new URL(window.location.href);
    url.searchParams.set('project', newId);
    window.history.replaceState({}, '', url.toString());
  }
});

$('reload')?.addEventListener('click', () => {
  syncProjectList(currentProjectId);
  notice('Проект перезагружен.');
});

$('clearLog')?.addEventListener('click', () => {
  const log = $('eventLog');
  if (log) {
    log.innerHTML = '<li class="event-log-empty">Лента действий пуста. Нажимайте кнопки пульта для проверки.</li>';
  }
});

$('connect')?.addEventListener('click', async () => {
  if (!navigator.bluetooth || !window.isSecureContext) {
    notice('Нужен HTTPS браузер с Web Bluetooth (на Chrome/Edge или Bluefy на iOS).');
    return;
  }
  $('connect').disabled = true;
  notice('');
  try {
    const selected = await navigator.bluetooth.requestDevice({filters: [{services: [SERVICE]}]});
    device = selected;
    selected.addEventListener('gattserverdisconnected', () => {
      if (device === selected) disconnect('Bluetooth соединение потеряно.');
    }, {once: true});

    const server = await selected.gatt.connect();
    const service = await server.getPrimaryService(SERVICE);
    characteristic = await service.getCharacteristic(COMMAND_EVENT);
    await subscribeNotifications(characteristic, onEvent);
    connected = true;
    setConnectionUI();
    notice('Хаб подключён. Нажмите «Старт» для запуска управления.');
  } catch (error) {
    disconnect(
      error?.name === 'NotFoundError'
        ? 'Хаб не выбран. Включите Pybricks и отключите Pybricks Code от Bluetooth.'
        : 'Не удалось подключиться: ' + safeError(error)
    );
  }
});

$('start')?.addEventListener('click', async () => {
  if (!connected || !characteristic) return;
  emergencyStop();
  notice('Ожидание ответа программы хаба…');
  starting = true;
  ready = false;
  setConnectionUI();

  try {
    try {
      await writeBytes(Uint8Array.of(1));
    } catch {
      // Программа может уже работать, проверяем по handshake
    }
    await delay(350);
    await sendLine('h\n');

    startTimer = setTimeout(() => {
      if (starting) {
        starting = false;
        ready = false;
        setConnectionUI();
        notice('Программа хаба не ответила. Скачайте программу хаба по кнопке «↓ Программа хаба», запустите её в Pybricks Code и повторите запуск.');
      }
    }, 8000);
  } catch (error) {
    starting = false;
    ready = false;
    setConnectionUI();
    notice('Запуск не удался: ' + safeError(error));
  }
});

$('disconnect')?.addEventListener('click', () => {
  disconnect('Хаб отключён.');
});

$('stop')?.addEventListener('click', () => {
  emergencyStop('Аварийный стоп: все моторы остановлены.');
});

$('download')?.addEventListener('click', async () => {
  try {
    const response = await fetch('/hub_program.py', {cache: 'no-store'});
    if (!response.ok) throw new Error('Программа недоступна');
    const source = await response.text();
    if (!source.includes('SOCER2_READY') && !source.includes('SOCER3_READY')) {
      throw new Error('Файл программы повреждён');
    }
    const url = URL.createObjectURL(new Blob([source], {type: 'text/x-python;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tlc_pybricks_controller.py';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice('Программа скачана. Загрузите её в Pybricks Code и отключите Pybricks Code от Bluetooth.');
  } catch (error) {
    notice('Не удалось скачать программу: ' + safeError(error));
  }
});

// Storage sync across tabs
window.addEventListener('storage', (e) => {
  if (e.key === PROJECTS_STORAGE_KEY) {
    syncProjectList(currentProjectId);
  }
});

// Periodic heartbeat while connected and ready
setInterval(() => {
  if (!ready || !characteristic || document.hidden) return;
  const now = performance.now();
  if (now - lastAck > 1800) {
    ready = false;
    emergencyStop('Хаб перестал отвечать. Моторы остановлены.');
    setConnectionUI();
    return;
  }

  if (now - lastHeartbeat > 150) {
    lastHeartbeat = now;
    if (!heartbeatPending) {
      heartbeatPending = true;
      void sendLine('k\n')
        .catch(error => disconnect('Ошибка связи: ' + safeError(error)))
        .finally(() => { heartbeatPending = false; });
    }
  }
}, 80);

// Initial setup
const urlParams = new URLSearchParams(window.location.search);
const initialProjectId = urlParams.get('project');
syncProjectList(initialProjectId);
setConnectionUI();
