import {test} from 'node:test';
import assert from 'node:assert/strict';

test('controller page runs button handlers only after compatible READY and stops safely', async () => {
  class Element {
    constructor(tagName = 'DIV') {
      this.tagName = tagName;
      this.listeners = new Map();
      this.children = [];
      this.attributes = new Map();
      this.classList = {add() {}, remove() {}, toggle() {}};
      this.hidden = false;
      this.textContent = '';
    }
    addEventListener(name, handler) { this.listeners.set(name, handler); }
    dispatch(name, event = {}) { return this.listeners.get(name)?.({target: this, preventDefault() {}, ...event}); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
    appendChild(child) { this.children.push(child); }
    append(...children) { this.children.push(...children); }
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
    querySelector() { return null; }
    setPointerCapture() {}
    hasPointerCapture() { return false; }
  }

  const ids = ['project', 'reload', 'clearLog', 'connect', 'disconnect', 'start', 'stop',
    'download', 'notice', 'status', 'modeBadge', 'eventLog', 'programErrors', 'editInEditor',
    ...['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'l', 'r'].map(button => `btn-${button}`)];
  const elements = new Map(ids.map(id => [id, new Element(id === 'project' ? 'SELECT' : 'BUTTON')]));
  const project = {id: 'test', name: 'Test', hub: 'spike', workspace: {blocks: [
    {id: 'press', type: 'button', button: 'up', event: 'pressed'},
    {id: 'run', type: 'drive', parentId: 'press', motor: 'A'},
    {id: 'release', type: 'button', button: 'up', event: 'released'},
    {id: 'brake', type: 'stop', parentId: 'release', motor: 'A'},
    {id: 'powerButton', type: 'button', button: 'a', event: 'pressed'},
    {id: 'power', type: 'drive', parentId: 'powerButton', motor: 'A', modules: ['power', 'travel'], power: 50, value: 0.01, unit: 'seconds'},
  ]}};
  const writes = [];
  const notifications = new Element();
  notifications.startNotifications = async () => notifications;
  notifications.writeValueWithResponse = async bytes => { writes.push(bytes); };
  const device = {
    addEventListener() {},
    gatt: {connected: true, connect: async () => ({getPrimaryService: async () =>
      ({getCharacteristic: async () => notifications})}), disconnect() {}},
  };
  const oldInterval = globalThis.setInterval;
  globalThis.setInterval = () => 0;
  globalThis.document = {
    hidden: false,
    getElementById: id => elements.get(id),
    createElement: tag => new Element(tag.toUpperCase()),
    addEventListener() {},
  };
  globalThis.window = {
    isSecureContext: true,
    location: {search: '?project=test'},
    addEventListener() {},
  };
  globalThis.localStorage = {getItem: () => JSON.stringify([project])};
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true, value: {bluetooth: {requestDevice: async () => device}},
  });

  try {
    await import('../public/controller.js');
    const up = elements.get('btn-up');
    up.dispatch('pointerdown', {button: 0, pointerType: 'mouse', pointerId: 1});
    assert.match(elements.get('eventLog').children.at(-1).children.at(-1).textContent, /Мотор A вперёд/);
    assert.equal(writes.length, 0);

    await elements.get('connect').dispatch('click');
    const stdout = text => Uint8Array.of(1, ...new TextEncoder().encode(`${text}\n`));
    notifications.dispatch('characteristicvaluechanged', {target: {value: stdout('SOCER3_READY|B')}});
    assert.equal(up.attributes.get('data-has-error'), 'true');
    up.dispatch('pointerdown', {button: 0, pointerType: 'mouse', pointerId: 2});
    await new Promise(setImmediate);
    assert.equal(writes.length, 0);

    notifications.dispatch('characteristicvaluechanged', {target: {value: stdout('SOCER3_READY|A')}});
    up.dispatch('pointerdown', {button: 0, pointerType: 'mouse', pointerId: 3});
    await new Promise(setImmediate);
    const sent = () => writes.map(bytes => new TextDecoder().decode(bytes.subarray(1)));
    assert.ok(sent().includes('m,A,360\n'));

    elements.get('btn-a').dispatch('pointerdown', {button: 0, pointerType: 'mouse', pointerId: 5});
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.ok(sent().includes('d,A,50\n'));
    assert.ok(sent().includes('m,A,0\n'));

    elements.get('reload').dispatch('click');
    await new Promise(setImmediate);
    assert.match(elements.get('modeBadge').textContent, /Пробный режим/);

    notifications.dispatch('characteristicvaluechanged', {target: {value: stdout('SOCER3_READY|A')}});

    elements.get('stop').dispatch('click');
    await new Promise(setImmediate);
    assert.ok(sent().includes('x\n'));
    assert.match(elements.get('modeBadge').textContent, /Пробный режим/);
    const count = writes.length;
    up.dispatch('pointerdown', {button: 0, pointerType: 'mouse', pointerId: 4});
    await new Promise(setImmediate);
    assert.equal(writes.length, count);
  } finally {
    globalThis.setInterval = oldInterval;
  }
});
