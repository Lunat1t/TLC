import {HUBS, importProject, loadProjects, makeProject, projectName, saveProjects} from './projects.js';

const $ = id => document.getElementById(id);
let storage;
let projects = [];
let selectedId = null;
let storageReady = true;

function id() {
  return globalThis.crypto?.randomUUID?.() || `project-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function showNotice(message, isError = false) {
  $('notice').textContent = message;
  $('notice').classList.toggle('error', isError);
  $('notice').hidden = false;
}

function countLabel(count) {
  const ending = count % 10 === 1 && count % 100 !== 11 ? 'проект' :
    count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'проекта' : 'проектов';
  return `${count} ${ending}`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : new Intl.DateTimeFormat('ru-RU', {day:'numeric', month:'long', year:'numeric'}).format(date);
}

function card(project) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'project-card';
  button.setAttribute('aria-label', `Открыть проект ${project.name}`);
  const icon = document.createElement('span');
  icon.className = `project-icon ${project.hub}`;
  icon.textContent = project.hub === 'spike' ? '▦' : '▣';
  const type = document.createElement('span');
  type.className = 'project-type';
  type.textContent = HUBS[project.hub];
  const title = document.createElement('strong');
  title.className = 'project-name';
  title.textContent = project.name;
  const date = document.createElement('small');
  date.className = 'project-date';
  date.textContent = formatDate(project.updatedAt);
  button.append(icon, type, title, date);
  button.addEventListener('click', () => openDetails(project.id));
  return button;
}

function render() {
  $('projectCount').textContent = countLabel(projects.length);
  $('emptyState').hidden = projects.length > 0;
  $('projectList').replaceChildren(...projects
    .slice().sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(card));
}

function commit(next) {
  if (!storageReady) throw new Error('Сохранение недоступно. Проверь хранилище браузера.');
  const clean = saveProjects(storage, next);
  projects = clean;
  render();
}

function currentProject() { return projects.find(project => project.id === selectedId); }

function openDetails(projectId) {
  selectedId = projectId;
  const project = currentProject();
  if (!project) return;
  $('detailsTitle').textContent = project.name;
  $('detailsMeta').textContent = `${HUBS[project.hub]} · создан ${formatDate(project.createdAt)}`;
  $('controllerLink').hidden = project.hub !== 'spike';
  $('detailsDialog').showModal();
}

function openNew() {
  $('newForm').reset();
  $('newForm').elements.hub.value = $('hubChoice').value;
  $('formError').hidden = true;
  $('newDialog').showModal();
  $('projectName').focus();
}

function showFormError(id, error) {
  $(id).textContent = error?.message || 'Не удалось сохранить проект.';
  $(id).hidden = false;
}

try { storage = window.localStorage; projects = loadProjects(storage); }
catch (error) {
  storageReady = false;
  showNotice('Список проектов не удалось прочитать. Данные в браузере сохранены; новый проект пока нельзя создать.', true);
  $('heroCreate').disabled = $('newProject').disabled = $('openProjectFile').disabled = true;
}
render();

$('hubChoice').addEventListener('change', () => {
  $('heroHub').textContent = HUBS[$('hubChoice').value];
});
$('heroCreate').addEventListener('click', openNew);
$('newProject').addEventListener('click', openNew);
$('cancelNew').addEventListener('click', () => $('newDialog').close());
$('newForm').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const project = makeProject($('projectName').value, $('newForm').elements.hub.value, id());
    commit([...projects, project]);
    $('newDialog').close();
    showNotice(`Проект «${project.name}» создан.`);
    openDetails(project.id);
  } catch (error) { showFormError('formError', error); }
});

$('closeDetails').addEventListener('click', () => $('detailsDialog').close());
$('renameProject').addEventListener('click', () => {
  const project = currentProject();
  if (!project) return;
  $('renameInput').value = project.name;
  $('renameError').hidden = true;
  $('detailsDialog').close();
  $('renameDialog').showModal();
  $('renameInput').focus();
});
$('cancelRename').addEventListener('click', () => { $('renameDialog').close(); openDetails(selectedId); });
$('renameForm').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const name = projectName($('renameInput').value);
    commit(projects.map(project => project.id === selectedId ? {...project, name, updatedAt:new Date().toISOString()} : project));
    $('renameDialog').close();
    openDetails(selectedId);
    showNotice('Название проекта сохранено.');
  } catch (error) { showFormError('renameError', error); }
});

$('deleteProject').addEventListener('click', () => {
  const project = currentProject();
  if (!project || !window.confirm(`Удалить проект «${project.name}»?`)) return;
  try {
    commit(projects.filter(item => item.id !== selectedId));
    $('detailsDialog').close();
    selectedId = null;
    showNotice('Проект удалён.');
  } catch (error) { showNotice(error.message, true); }
});

$('exportProject').addEventListener('click', () => {
  const project = currentProject();
  if (!project) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], {type:'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${project.name.replace(/[\\/:*?"<>|]/g, '-')}.robotproj.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$('openProjectFile').addEventListener('click', () => $('projectFile').click());
$('projectFile').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 1_000_000) throw new Error('Файл проекта слишком большой.');
    const project = importProject(await file.text(), id());
    commit([...projects, project]);
    showNotice(`Проект «${project.name}» открыт и сохранён.`);
    openDetails(project.id);
  } catch (error) { showNotice(error.message || 'Не удалось открыть файл.', true); }
});
