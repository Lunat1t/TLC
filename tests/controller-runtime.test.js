import assert from 'node:assert/strict';
import test from 'node:test';
import {createControllerSession} from '../src/lib/controller-runtime.ts';

const program=()=>({projectId:'p',projectName:'p',hub:'spike',protocol:2,ports:['A'],startup:[{kind:'run',port:'A',speed:100}],handlers:[{target:{controlId:'one',input:'up'},button:'up',event:'pressed',sourceBlockId:'b',actions:[{kind:'run',port:'A',speed:200}]}],errors:[]});
function fake(){let onLine;let disconnected=false;const writes=[];return {writes,connect:async(fn)=>{onLine=fn},startHub:async()=>{},write:async(line)=>{writes.push(line);if(line==='h\n')onLine('SOCER3_READY|A');if(line==='x\n')onLine('SOCER2_STOP')},disconnect:async()=>{disconnected=true},get disconnected(){return disconnected}}}
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
test('trial never writes, READY does not start, live startup is once and stop is acknowledged',async()=>{
 const t=fake(),session=createControllerSession(t),p=program();
 await session.setViewMode('check');await session.startProgram(p);session.dispatch({controlId:'one',input:'up'},'pressed');await tick();assert.deepEqual(t.writes,[]);
 await session.connect();await session.startHub();assert.deepEqual(t.writes,['h\n']);assert.equal(session.getState().program,'trial-running');
 await session.setViewMode('check');await session.startProgram(p);await tick();assert.equal(t.writes.filter(x=>x==='m,A,100\n').length,1);
 session.dispatch({controlId:'one',input:'up'},'pressed');await tick();assert.ok(t.writes.includes('m,A,200\n'));
 await session.stop();assert.equal(session.getState().message,'Моторы остановлены.');assert.ok(t.writes.includes('x\n'));
 await session.dispose();assert.equal(t.disconnected,true);
});
test('button error blocks only its input while empty control produces no motor command',async()=>{
 const t=fake(),session=createControllerSession(t),p=program();p.startup=[];p.errors.push({scope:'handler',severity:'error',target:{controlId:'one',input:'up'},code:'bad',message:'Ошибка'});
 await session.connect();await session.startHub();await session.setViewMode('check');await session.startProgram(p);
 session.dispatch({controlId:'one',input:'up'},'pressed');session.dispatch({controlId:'two',input:'up'},'pressed');await tick();
 assert.equal(t.writes.some(x=>x.startsWith('m,')),false);assert.ok(session.getState().log.some(x=>x.includes('Ошибка')));
 await session.dispose();
});

test('stop invalidates queued motor commands before sending x',async()=>{
  let notify,releaseWrite;const sent=[];
  const t={connect:async(fn)=>{notify=fn},startHub:async()=>{},write:async(line)=>{sent.push(line);if(line==='h\n')notify('SOCER3_READY|A,B');if(line==='m,A,100\n')await new Promise(resolve=>{releaseWrite=resolve});if(line==='x\n')notify('SOCER2_STOP')},disconnect:async()=>{}};
  const session=createControllerSession(t),p=program();p.handlers.push({target:{controlId:'two',input:'up'},button:'up',event:'pressed',sourceBlockId:'b2',actions:[{kind:'run',port:'B',speed:300}]});
  await session.connect();await session.startHub();await session.setViewMode('check');await session.startProgram(p);await tick();assert.ok(releaseWrite);
  session.dispatch({controlId:'two',input:'up'},'pressed');const stopping=session.stop();releaseWrite();await stopping;await tick();
  assert.equal(sent.includes('m,B,300\n'),false);assert.ok(sent.includes('x\n'));await session.dispose();
});

test('missing stop acknowledgement disconnects and requires a fresh connection',async()=>{
  let notify,closed=false,acknowledgeStop=false;const sent=[];
  const t={connect:async(fn)=>{notify=fn},startHub:async()=>{},write:async(line)=>{sent.push(line);if(line==='h\n')notify('SOCER3_READY|A');if(line==='x\n'&&acknowledgeStop)notify('SOCER2_STOP')},disconnect:async()=>{closed=true}};
  const session=createControllerSession(t),p=program();p.startup=[];
  await session.connect();await session.startHub();await session.setViewMode('check');await session.startProgram(p);await session.stop();
  assert.equal(session.getState().transport,'fault');assert.equal(closed,true);assert.match(session.getState().message,/не подтверждена/);
  notify('SOCER2_STOP');assert.equal(session.getState().transport,'fault');await session.setViewMode('check');await session.startProgram(p);assert.equal(session.getState().program,'stopped');
  acknowledgeStop=true;await session.connect();await session.startHub();await session.setViewMode('check');await session.startProgram(p);assert.equal(session.getState().program,'live-running');await session.stop();assert.equal(session.getState().message,'Моторы остановлены.');await session.dispose();
});

test('failed in-flight motor write does not send stop into a broken queue',async()=>{
  let notify, release;const sent=[];let disconnected=false;
  const transport={connect:async(fn)=>{notify=fn},startHub:async()=>{},write:async(line)=>{sent.push(line);if(line==='h\n')notify('SOCER3_READY|A');if(line==='m,A,100\n')await new Promise((_,reject)=>{release=reject})},disconnect:async()=>{disconnected=true}};
  const session=createControllerSession(transport);await session.connect();await session.startHub();await session.setViewMode('check');await session.startProgram(program());await tick();
  const stopping=session.stop();release(new Error('write failed'));await stopping;await tick();
  assert.equal(sent.includes('x\n'),false);assert.equal(disconnected,true);assert.equal(session.getState().transport,'fault');await session.dispose();
});

test('a delayed stop from an older handler cannot stop the newer owner of a motor',async()=>{
 const t=fake(),session=createControllerSession(t),p=program();p.startup=[];p.protocol=3;
 p.handlers=[{target:{controlId:'one',input:'up'},button:'up',event:'pressed',sourceBlockId:'a',actions:[{kind:'dcTime',port:'A',power:50,ms:40},{kind:'wait',ms:40},{kind:'stop',port:'A'}]},{target:{controlId:'two',input:'up'},button:'up',event:'pressed',sourceBlockId:'b',actions:[{kind:'run',port:'A',speed:200}]}];
 await session.connect();await session.startHub();await session.setViewMode('check');await session.startProgram(p);session.dispatch({controlId:'one',input:'up'},'pressed');await tick();session.dispatch({controlId:'two',input:'up'},'pressed');await new Promise(resolve=>setTimeout(resolve,70));
 assert.ok(t.writes.includes('d,A,50\n'));assert.ok(t.writes.includes('m,A,200\n'));assert.equal(t.writes.includes('m,A,0\n'),false);await session.dispose();
});

test('unattached control event does not stop a continuously running motor on release',async()=>{
 const t=fake(),session=createControllerSession(t),p=program();p.startup=[];
 await session.connect();await session.startHub();await session.setViewMode('check');await session.startProgram(p);session.dispatch({controlId:'one',input:'up'},'pressed');await tick();session.dispatch({controlId:'one',input:'up'},'released');await tick();
 assert.ok(t.writes.includes('m,A,200\n'));assert.equal(t.writes.includes('m,A,0\n'),false);await session.dispose();
});

test('disposed sessions ignore notifications from the previous connection',async()=>{
 let notify,updates=0;const t={connect:async(fn)=>{notify=fn},startHub:async()=>{},write:async(line)=>{if(line==='h\n')notify('SOCER3_READY|A');if(line==='x\n')notify('SOCER2_STOP')},disconnect:async()=>{}};
 const session=createControllerSession(t);const unsub=session.subscribe(()=>updates++);await session.connect();await session.startHub();await session.setViewMode('check');const p=program();p.startup=[];await session.startProgram(p);await session.dispose();const count=updates;notify('SOCER3_READY|A');notify('SOCER2_ACK');assert.equal(updates,count);unsub();
});

test('lost hub program stops the session and ignores its subsequent messages',async()=>{
 let notify,closed=0;const t={connect:async(fn)=>{notify=fn},startHub:async()=>{},write:async(line)=>{if(line==='h\n')notify('SOCER3_READY|A')},disconnect:async()=>{closed++}};
 const session=createControllerSession(t),p=program();p.startup=[];await session.connect();await session.startHub();await session.setViewMode('check');await session.startProgram(p);
 notify('SOCER2_LINK_LOST');await tick();assert.equal(session.getState().transport,'fault');assert.equal(session.getState().program,'stopped');assert.equal(closed,1);
 notify('SOCER3_READY|A');assert.equal(session.getState().transport,'fault');await session.dispose();
});

test('missing heartbeat acknowledgement closes the connection',async()=>{
 let now=0,interval,notify,closed=false;const clock={now:()=>now,setTimeout,clearTimeout,setInterval:(fn)=>{interval=fn;return 1},clearInterval:()=>{interval=null}};
 const t={connect:async(fn)=>{notify=fn},startHub:async()=>{},write:async(line)=>{if(line==='h\n')notify('SOCER3_READY|A')},disconnect:async()=>{closed=true}};
 const session=createControllerSession(t,clock),p=program();p.startup=[];await session.connect();await session.startHub();await session.setViewMode('check');await session.startProgram(p);
 now=3501;interval();await tick();assert.equal(session.getState().transport,'fault');assert.equal(session.getState().program,'stopped');assert.equal(closed,true);assert.equal(interval,null);await session.dispose();
});

import {readFileSync} from 'node:fs';
import {buildMultiMpy6Blob, HUB_PROGRAM_VERSION, parseEvent, parseHubCapabilities} from '../public/pybricks-protocol.js';
import {compilePythonToMultiMpy6} from '../src/lib/mpy-compiler.ts';

test('hybrid fast probe skips upload when hub already has matching controller version', async () => {
  let notify, uploads = 0;
  const t = {
    connect: async (fn) => { notify = fn; return { hubName: 'SPIKE-01' }; },
    startHub: async () => {},
    write: async (line) => {
      if (line === 'h\n') {
        notify(`SOCER_VER|${HUB_PROGRAM_VERSION}`);
        notify('SOCER3_READY|A,B');
      }
    },
    uploadProgram: async () => { uploads++; },
    disconnect: async () => {},
  };
  const session = createControllerSession(t, undefined, {
    compileHubProgram: async () => new Uint8Array([1, 2, 3]),
    probeTimeoutMs: 50,
  });
  await session.connect();
  assert.equal(session.getState().hubName, 'SPIKE-01');
  await session.startHub();
  assert.equal(uploads, 0);
  assert.equal(session.getState().transport, 'ready');
  await session.dispose();
});

test('hybrid auto-uploads on clean or outdated hub and reports progress', async () => {
  let notify, uploaded = false, uploads = 0;
  const progress = [];
  const t = {
    connect: async (fn) => { notify = fn; },
    startHub: async () => {},
    write: async (line) => {
      if (line === 'h\n') {
        if (!uploaded) {
          // Simulate old controller without SOCER_VER
          notify('SOCER3_READY|A');
        } else {
          notify(`SOCER_VER|${HUB_PROGRAM_VERSION}`);
          notify('SOCER3_READY|A,D');
        }
      }
    },
    uploadProgram: async (blob, onProgress) => {
      uploads++;
      assert.deepEqual([...blob], [9, 8, 7]);
      onProgress(50);
      onProgress(100);
      uploaded = true;
    },
    disconnect: async () => {},
  };
  const session = createControllerSession(t, undefined, {
    compileHubProgram: async () => new Uint8Array([9, 8, 7]),
    probeTimeoutMs: 50,
  });
  session.subscribe((s) => { if (s.uploadProgress !== null) progress.push(s.uploadProgress); });
  await session.connect();
  await session.startHub();
  assert.equal(uploads, 1);
  assert.ok(progress.includes(50) && progress.includes(100));
  assert.equal(session.getState().transport, 'ready');
  assert.deepEqual(session.getState().ports, ['A', 'D']);
  await session.dispose();
});

test('short hub script exit during probe triggers auto-upload instead of fault', async () => {
  let notify, uploaded = false, uploads = 0;
  const t = {
    connect: async (fn) => { notify = fn; },
    startHub: async () => {},
    write: async (line) => {
      if (line === 'h\n') {
        if (!uploaded) notify('SOCER2_LINK_LOST');
        else {
          notify(`SOCER_VER|${HUB_PROGRAM_VERSION}`);
          notify('SOCER3_READY|A');
        }
      }
    },
    uploadProgram: async (_blob, onProgress) => {
      uploads++;
      onProgress(100);
      uploaded = true;
    },
    disconnect: async () => {},
  };
  const session = createControllerSession(t, undefined, {
    compileHubProgram: async () => new Uint8Array([1, 2]),
    probeTimeoutMs: 200,
  });
  await session.connect();
  await session.startHub();
  assert.equal(uploads, 1);
  assert.equal(session.getState().transport, 'ready');
  await session.dispose();
});

test('cancelling upload returns to connected without fault and user picker cancel stays disconnected', async () => {
  const cancelTransport = {
    connect: async () => { const e = new Error('User cancelled'); e.name = 'NotFoundError'; throw e; },
    startHub: async () => {},
    write: async () => {},
    disconnect: async () => {},
  };
  const s1 = createControllerSession(cancelTransport);
  await s1.connect();
  assert.equal(s1.getState().transport, 'disconnected');
  await s1.dispose();

  const t2 = {
    connect: async () => {},
    startHub: async () => {},
    write: async () => {},
    uploadProgram: async (_blob, _onProgress, signal) => {
      await new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => { const e = new Error('Aborted'); e.name = 'AbortError'; reject(e); });
      });
    },
    disconnect: async () => {},
  };
  const s2 = createControllerSession(t2, undefined, {
    compileHubProgram: async () => new Uint8Array([1]),
    probeTimeoutMs: 15,
  });
  await s2.connect();
  const starting = s2.startHub();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(s2.getState().transport, 'uploading');
  s2.cancelStart();
  await starting;
  assert.equal(s2.getState().transport, 'connected');
  await s2.dispose();
});

test('pybricks protocol helpers and mpy compiler produce valid multi-mpy6 hub blob', async () => {
  const capBytes = new Uint8Array(11);
  const view = new DataView(capBytes.buffer);
  view.setUint16(0, 250, true);
  view.setUint32(2, 3, true);
  view.setUint32(6, 65536, true);
  capBytes[10] = 5;
  const caps = parseHubCapabilities(capBytes);
  assert.deepEqual(caps, { maxCharSize: 250, featureFlags: 3, maxUserProgramSize: 65536, numOfSlots: 5 });

  const status = parseEvent(Uint8Array.of(0, 64, 2, 0, 0, 1));
  assert.equal(status.running, true);
  assert.equal(status.hostConnected, true);
  assert.equal(status.activeSlot, 1);

  const wasmB64 = readFileSync(new URL('../public/vendor/mpy-cross-v6.wasm', import.meta.url)).toString('base64');
  const hubPy = readFileSync(new URL('../public/hub_program.py', import.meta.url), 'utf8');
  const blob = await compilePythonToMultiMpy6(hubPy, { wasmPath: 'data:application/wasm;base64,' + wasmB64 });
  assert.ok(blob.byteLength > 500);
  const dv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const mpyLen = dv.getUint32(0, true);
  const name = new TextDecoder().decode(blob.subarray(4, 12));
  assert.equal(name, '__main__');
  assert.equal(blob[12], 0);
  assert.equal(blob.byteLength, 4 + 9 + mpyLen);
  const emptyBlob = buildMultiMpy6Blob([{ name: '__main__', mpy: new Uint8Array([77, 6]) }]);
  assert.equal(emptyBlob.byteLength, 15);
});

import {createBluetoothTransport} from '../src/lib/controller-runtime.ts';
import {compileBundledHubProgram} from '../src/lib/mpy-compiler.ts';

function fakeWebBluetooth({ rejectFirstStart = false, initialRunning = false } = {}) {
  const listeners = new Map();
  const writes = [];
  let running = initialRunning;
  let uploadedSize = 0;
  let hasController = false;
  let notifyFn = null;

  const emitStatus = (isRunning) => {
    running = isRunning;
    const buf = new Uint8Array(5);
    buf[0] = 0;
    new DataView(buf.buffer).setUint32(1, isRunning ? 64 : 0, true);
    notifyFn?.({ target: { value: new DataView(buf.buffer) } });
  };

  const emitStdout = (text) => {
    const encoded = new TextEncoder().encode(text);
    const buf = new Uint8Array(1 + encoded.length);
    buf[0] = 1;
    buf.set(encoded, 1);
    notifyFn?.({ target: { value: new DataView(buf.buffer) } });
  };

  const capBuf = new Uint8Array(11);
  const capView = new DataView(capBuf.buffer);
  capView.setUint16(0, 250, true);
  capView.setUint32(2, 3, true);
  capView.setUint32(6, 65536, true);
  capBuf[10] = 5;

  const cmdChar = {
    startNotifications: async () => {},
    stopNotifications: async () => {},
    addEventListener: (ev, fn) => { if (ev === 'characteristicvaluechanged') notifyFn = fn; },
    removeEventListener: () => { notifyFn = null; },
    writeValueWithResponse: async (bytes) => {
      const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      writes.push([...arr]);
      const cmd = arr[0];
      if (cmd === 0x00) {
        emitStatus(false);
        return;
      }
      if (cmd === 0x01) {
        if (rejectFirstStart && !hasController) {
          throw new Error('GATT VALUE_NOT_ALLOWED');
        }
        emitStatus(true);
        if (hasController) {
          emitStdout(`SOCER_VER|${HUB_PROGRAM_VERSION}\nSOCER3_READY|A\n`);
        }
        return;
      }
      if (cmd === 0x03) {
        const size = new DataView(arr.buffer, arr.byteOffset, arr.byteLength).getUint32(1, true);
        uploadedSize = size;
        if (size > 0) hasController = true;
        return;
      }
      if (cmd === 0x06) {
        const text = new TextDecoder().decode(arr.subarray(1));
        if (text === 'h\n') {
          if (hasController) {
            emitStdout(`SOCER_VER|${HUB_PROGRAM_VERSION}\nSOCER3_READY|A\n`);
          } else if (initialRunning && running) {
            // Legacy/old controller without SOCER_VER
            emitStdout('SOCER3_READY|A\n');
          }
        } else if (text === 'x\n') {
          emitStdout('SOCER2_STOP\n');
        }
      }
    },
  };

  const capChar = {
    readValue: async () => new DataView(capBuf.buffer),
  };

  const service = {
    getCharacteristic: async (uuid) => uuid.endsWith('0003-8280-46da-89f4-6d8051e4aeef') ? capChar : cmdChar,
  };

  const device = {
    name: 'SPIKE-Test',
    gatt: {
      connected: true,
      connect: async () => ({ getPrimaryService: async () => service }),
      disconnect: () => { device.gatt.connected = false; },
    },
    addEventListener: (ev, fn) => listeners.set(ev, fn),
    removeEventListener: (ev) => listeners.delete(ev),
  };

  return {
    writes,
    get uploadedSize() { return uploadedSize; },
    install() {
      const prevNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
      const prevWin = Object.getOwnPropertyDescriptor(globalThis, 'window');
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { bluetooth: { requestDevice: async () => { queueMicrotask(() => emitStatus(initialRunning)); return device; } } },
      });
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: { isSecureContext: true },
      });
      return () => {
        if (prevNav) Object.defineProperty(globalThis, 'navigator', prevNav);
        if (prevWin) Object.defineProperty(globalThis, 'window', prevWin);
      };
    },
  };
}

test('createBluetoothTransport upgrades running old hub script without faulting on 0x00 stop', async () => {
  const bt = fakeWebBluetooth({ initialRunning: true });
  const restore = bt.install();
  try {
    const session = createControllerSession(createBluetoothTransport(), undefined, {
      compileHubProgram: async () => new Uint8Array([1, 2, 3, 4, 5]),
      probeTimeoutMs: 80,
    });
    await session.connect();
    await tick();
    await session.startHub();
    assert.equal(session.getState().transport, 'ready');
    assert.equal(bt.uploadedSize, 5);
    assert.ok(bt.writes.some((w) => w[0] === 0x00));
    assert.ok(bt.writes.some((w) => w[0] === 0x04));
    await session.dispose();
  } finally {
    restore();
  }
});

test('createBluetoothTransport auto-uploads when clean hub rejects 0x01 start probe', async () => {
  const bt = fakeWebBluetooth({ rejectFirstStart: true, initialRunning: false });
  const restore = bt.install();
  try {
    const session = createControllerSession(createBluetoothTransport(), undefined, {
      compileHubProgram: async () => new Uint8Array([10, 20, 30]),
      probeTimeoutMs: 80,
    });
    await session.connect();
    await session.startHub();
    assert.equal(session.getState().transport, 'ready');
    assert.equal(bt.uploadedSize, 3);
    assert.equal(bt.writes.filter((w) => w[0] === 0x01).length, 2);
    await session.dispose();
  } finally {
    restore();
  }
});

test('offline compileBundledHubProgram has embedded source ready', async () => {
  assert.equal(typeof compileBundledHubProgram, 'function');
  const {HUB_PROGRAM_SOURCE} = await import('../src/lib/hub-program-source.ts');
  assert.match(HUB_PROGRAM_SOURCE, /PROGRAM_VERSION = "6"/);
  assert.match(HUB_PROGRAM_SOURCE, /LINK_TIMEOUT_MS = 2000/);
});

function fakePorts(portsStr){let onLine;let disconnected=false;const writes=[];return {writes,connect:async(fn)=>{onLine=fn},startHub:async()=>{},write:async(line)=>{writes.push(line);if(line==='h\n')onLine('SOCER3_READY|'+portsStr);if(line==='x\n')onLine('SOCER2_STOP')},disconnect:async()=>{disconnected=true},get disconnected(){return disconnected}}}
test('hold mode autostops ports on release and resolves overlapping button conflicts safely', async () => {
  const t = fakePorts('A,B');
  const session = createControllerSession(t);
  const p = {
    projectId: 'p-hold', projectName: 'Hold', hub: 'spike', protocol: 3, ports: ['A', 'B'], startup: [], errors: [],
    handlers: [
      { target: { controlId: 'p1', input: 'blue' }, button: 'blue', event: 'hold', sourceBlockId: 'b1', actions: [{ kind: 'run', port: 'A', speed: 300 }, { kind: 'run', port: 'B', speed: -300 }] },
      { target: { controlId: 'p1', input: 'red' }, button: 'red', event: 'hold', sourceBlockId: 'b2', actions: [{ kind: 'run', port: 'A', speed: -200 }, { kind: 'run', port: 'B', speed: -200 }] },
    ],
  };
  await session.connect(); await session.startHub(); await session.setViewMode('check'); await session.startProgram(p);

  // Simple press & release autostop
  session.dispatch({ controlId: 'p1', input: 'blue' }, 'pressed'); await tick();
  assert.ok(t.writes.includes('m,A,300\n'));
  assert.ok(t.writes.includes('m,B,-300\n'));
  t.writes.length = 0;

  session.dispatch({ controlId: 'p1', input: 'blue' }, 'released'); await tick();
  assert.ok(t.writes.includes('m,A,0\n'));
  assert.ok(t.writes.includes('m,B,0\n'));
  t.writes.length = 0;

  // Overlapping holds: press blue, press red, release blue -> red stays running; release red -> stops both
  session.dispatch({ controlId: 'p1', input: 'blue' }, 'pressed'); await tick();
  session.dispatch({ controlId: 'p1', input: 'red' }, 'pressed'); await tick();
  t.writes.length = 0;
  session.dispatch({ controlId: 'p1', input: 'blue' }, 'released'); await tick();
  assert.equal(t.writes.includes('m,A,0\n'), false);
  assert.equal(t.writes.includes('m,B,0\n'), false);
  session.dispatch({ controlId: 'p1', input: 'red' }, 'released'); await tick();
  assert.ok(t.writes.includes('m,A,0\n'));
  assert.ok(t.writes.includes('m,B,0\n'));

  // Hold blue, then press red -> release red while blue still held resumes blue
  t.writes.length = 0;
  session.dispatch({ controlId: 'p1', input: 'blue' }, 'pressed'); await tick();
  session.dispatch({ controlId: 'p1', input: 'red' }, 'pressed'); await tick();
  t.writes.length = 0;
  session.dispatch({ controlId: 'p1', input: 'red' }, 'released'); await tick();
  assert.ok(t.writes.includes('m,A,300\n'));
  assert.ok(t.writes.includes('m,B,-300\n'));
  assert.equal(t.writes.includes('m,A,0\n'), false);
  t.writes.length = 0;
  session.dispatch({ controlId: 'p1', input: 'blue' }, 'released'); await tick();
  assert.ok(t.writes.includes('m,A,0\n'));
  assert.ok(t.writes.includes('m,B,0\n'));

  await session.dispose();
});

test('stopAll action stops connected ports', async () => {
  const t = fakePorts('A,B');
  const session = createControllerSession(t);
  const p = {
    projectId: 'p-all', projectName: 'All', hub: 'spike', protocol: 3, ports: ['A', 'B'], startup: [], errors: [],
    handlers: [
      { target: { controlId: 'p1', input: 'blue' }, button: 'blue', event: 'pressed', sourceBlockId: 'b1', actions: [{ kind: 'stopAll' }] },
    ],
  };
  await session.connect(); await session.startHub(); await session.setViewMode('check'); await session.startProgram(p);
  session.dispatch({ controlId: 'p1', input: 'blue' }, 'pressed'); await tick();
  assert.ok(t.writes.includes('m,A,0\n'));
  assert.ok(t.writes.includes('m,B,0\n'));
  await session.dispose();
});


test('sensor telemetry SOCER_SENSORS and SOCER_DIST drive branch evaluation, 2000mm safety, waitSensor, and trial slider', async () => {
  let onLine;
  const writes = [];
  const t = {
    connect: async (fn) => { onLine = fn; },
    startHub: async () => {},
    write: async (line) => {
      writes.push(line);
      if (line === 'h\n') {
        onLine('SOCER_VER|5');
        onLine('SOCER3_READY|A');
        onLine('SOCER_SENSORS|C');
      }
      if (line === 'x\n') onLine('SOCER2_STOP');
    },
    disconnect: async () => {},
  };

  // Trial mode: slider simulation drives branch logs without transport writes
  const trialSession = createControllerSession(t);
  const program = {
    projectId: 'p-sen', projectName: 'Sensor', hub: 'spike', protocol: 3, ports: ['A'], sensorPorts: ['C'],
    startup: [], errors: [],
    handlers: [
      {
        target: { controlId: 'c1', input: 'blue' }, button: 'blue', event: 'hold', sourceBlockId: 'b1',
        actions: [{
          kind: 'branch',
          condition: { port: 'C', op: 'lt', cm: 20 },
          thenActions: [{ kind: 'run', port: 'A', speed: 360 }],
          elseActions: [{ kind: 'stop', port: 'A' }],
        }],
      },
      {
        target: { controlId: 'c1', input: 'red' }, button: 'red', event: 'pressed', sourceBlockId: 'b2',
        actions: [
          { kind: 'waitSensor', port: 'C', op: 'gt', cm: 30 },
          { kind: 'run', port: 'A', speed: -300 },
        ],
      },
    ],
  };

  await trialSession.setViewMode('check');
  await trialSession.startProgram(program);
  trialSession.setSensorDistance('C', 15);
  trialSession.dispatch({ controlId: 'c1', input: 'blue' }, 'pressed');
  await tick();
  assert.ok(trialSession.getState().log.some(l => l.includes('Если C < 20 см → да')));
  assert.equal(writes.length, 0);
  trialSession.dispatch({ controlId: 'c1', input: 'blue' }, 'released');
  await tick();
  trialSession.setSensorDistance('C', 45);
  trialSession.dispatch({ controlId: 'c1', input: 'blue' }, 'pressed');
  await tick();
  assert.ok(trialSession.getState().log.some(l => l.includes('Если C < 20 см → нет')));
  await trialSession.dispose();

  // Live mode: SOCER_DIST parsing including 2000mm -> null, branch + hold release, waitSensor
  writes.length = 0;
  const liveSession = createControllerSession(t);
  await liveSession.connect();
  await liveSession.startHub();
  assert.deepEqual(liveSession.getState().sensorPorts, ['C']);
  assert.equal(liveSession.getState().sensorPortsKnown, true);

  await liveSession.setViewMode('check');
  await liveSession.startProgram(program);

  // 2000mm -> null (>200 cm): `< 20` must NOT false-trigger!
  onLine('SOCER_DIST|C:2000');
  assert.equal(liveSession.getState().sensorDistances.C, null);
  liveSession.dispatch({ controlId: 'c1', input: 'blue' }, 'pressed');
  await tick();
  assert.ok(writes.includes('m,A,0\n'));
  assert.equal(writes.includes('m,A,360\n'), false);
  liveSession.dispatch({ controlId: 'c1', input: 'blue' }, 'released');
  await tick();

  // 180mm -> 18 cm: `< 20` triggers `then`, and releasing `hold` stops motor A
  writes.length = 0;
  onLine('SOCER_DIST|C:180');
  assert.equal(liveSession.getState().sensorDistances.C, 18);
  liveSession.dispatch({ controlId: 'c1', input: 'blue' }, 'pressed');
  await tick();
  assert.ok(writes.includes('m,A,360\n'));
  writes.length = 0;
  liveSession.dispatch({ controlId: 'c1', input: 'blue' }, 'released');
  await tick();
  assert.ok(writes.includes('m,A,0\n'));

  // waitSensor waits until distance > 30 (null / 2000mm satisfies > 30)
  writes.length = 0;
  liveSession.dispatch({ controlId: 'c1', input: 'red' }, 'pressed');
  await tick();
  assert.equal(writes.includes('m,A,-300\n'), false);
  onLine('SOCER_DIST|C:2000');
  await tick();
  assert.ok(writes.includes('m,A,-300\n'));
  await liveSession.dispose();
});


test('typed SOCER_SENSORS, SOCER_SNS telemetry, color/force/imu evaluation, and g,IMU,r reset work cleanly', async () => {
  const { compileControllerProgram, controllerRuntimeErrors } = await import('../public/controller-program.js');
  const { createControllerSession } = await import('../src/lib/controller-runtime.ts');

  const program = compileControllerProgram({
    id: 'p-multi-sns',
    hub: 'spike',
    workspace: {
      controlLayout: { version: 1, areas: [], controls: [{ id: 'c1', kind: 'motor-panel', inputs: ['blue', 'red'] }] },
      blocks: [
        { id: 'b1', type: 'button', target: { controlId: 'c1', input: 'blue' }, event: 'pressed' },
        { id: 'if-col', type: 'if', parentId: 'b1' },
        { id: 'sen-col', type: 'sensor', parentId: 'if-col', branch: 'condition', sensorType: 'color', sensorPort: 'D', sensorColor: 'red', sensorModules: ['color', 'lights'], sensorLight: 60 },
        { id: 'm1', type: 'drive', parentId: 'if-col', branch: 'body', motor: 'A', modules: [] },
        { id: 'b2', type: 'button', target: { controlId: 'c1', input: 'red' }, event: 'pressed' },
        { id: 'sen-imu', type: 'sensor', parentId: 'b2', sensorType: 'imu', sensorModules: ['reset', 'tilt'], sensorAxis: 'roll', sensorTiltOp: 'gt', sensorTilt: 15 },
        { id: 'm2', type: 'drive', parentId: 'sen-imu', motor: 'A', direction: 'backward', modules: ['speed'], speed: 250 },
      ],
    },
  });
  assert.equal(program.errors.length, 0);

  // Runtime checks catch sensor type mismatch and missing IMU
  const typeMismatch = controllerRuntimeErrors(program, 3, new Set(['A']), new Set(['D']), { D: 'force', IMU: 'imu' });
  assert.ok(typeMismatch.some(e => e.code === 'wrong-sensor-type'));
  const missingImu = controllerRuntimeErrors(program, 3, new Set(['A']), new Set(['D']), { D: 'color' });
  assert.ok(missingImu.some(e => e.code === 'missing-imu'));

  const writes = [];
  let onLine = () => {};
  const t = {
    connect: async fn => { onLine = fn; },
    startHub: async () => {},
    write: async line => {
      writes.push(line);
      if (line === 'h\n') {
        onLine('SOCER_VER|6');
        onLine('SOCER_SENSORS|D:color,F:force,IMU:imu');
        onLine('SOCER3_READY|A');
      }
      if (line === 'x\n') onLine('SOCER2_STOP');
    },
    disconnect: async () => {},
  };
  const session = createControllerSession(t);
  await session.connect();
  await session.startHub();
  assert.deepEqual(session.getState().sensorPorts, ['D', 'F']);
  assert.deepEqual(session.getState().sensorTypes, { D: 'color', F: 'force', IMU: 'imu' });

  await session.setViewMode('check');
  await session.startProgram(program);

  onLine('SOCER_SNS|D:c=red&r=45,F:p=1&f=35,IMU:h=12&p=2&r=10');
  session.dispatch({ controlId: 'c1', input: 'blue' }, 'pressed');
  await new Promise(r => setTimeout(r, 10));
  assert.ok(writes.includes('u,D,60\n'));
  assert.ok(writes.includes('m,A,360\n'));
  session.dispatch({ controlId: 'c1', input: 'blue' }, 'released');

  writes.length = 0;
  session.dispatch({ controlId: 'c1', input: 'red' }, 'pressed');
  await new Promise(r => setTimeout(r, 10));
  assert.ok(writes.includes('g,IMU,r\n'));
  assert.equal(writes.includes('m,A,-250\n'), false);
  onLine('SOCER_SNS|IMU:h=0&p=2&r=22');
  await new Promise(r => setTimeout(r, 10));
  assert.ok(writes.includes('m,A,-250\n'));
  await session.dispose();
});

test('two held panel buttons drive A and D independently through the live compiler', async () => {
  const { compileControllerProgram } = await import('../public/controller-program.js');
  const { generatePybricks } = await import('../src/lib/workspace.ts');
  const blue = { controlId: 'panel', input: 'blue' };
  const red = { controlId: 'panel', input: 'red' };
  const blocks = [
    { id: 'panel', type: 'motor-buttons', controlAreaId: 'area', controlModules: ['red'], x: 0, y: 44 },
    ...[[blue, 'A'], [red, 'D']].flatMap(([target, motor], index) => [
      { id: target.input, type: 'button', target, event: 'hold', x: index * 200, y: 200 },
      { id: motor, type: 'drive', parentId: target.input, motor, modules: ['speed'], speed: 300, x: index * 200, y: 260 },
    ]),
  ];
  const compiled = compileControllerProgram({ id: 'ad', hub: 'spike', workspace: {
    controlLayout: {version: 1, areas: [{id: 'area', sheetId: 'main'}], controls: []},
    sheets: [{id: 'main', blocks}],
  }});
  assert.deepEqual(compiled.errors, []);
  const { HUB_PROGRAM_SOURCE } = await import('../src/lib/hub-program-source.ts');
  assert.ok(generatePybricks(blocks, 'spike').endsWith(HUB_PROGRAM_SOURCE));
  assert.throws(() => generatePybricks(blocks, 'ev3'), /Экранный пульт/);
  const transport = fakePorts('A,D');
  const session = createControllerSession(transport);
  try {
    await session.connect();
    await session.startHub();
    await session.setViewMode('check');
    await session.startProgram(compiled);
    for (const [first, second, firstPort, secondPort] of [[blue, red, 'A', 'D'], [red, blue, 'D', 'A']]) {
      transport.writes.length = 0;
      session.dispatch(first, 'pressed');
      session.dispatch(second, 'pressed');
      await tick();
      session.dispatch(first, 'released');
      await tick();
      assert.deepEqual(transport.writes.filter(line => line.startsWith('m,')), [
        `m,${firstPort},300\n`, `m,${secondPort},300\n`, `m,${firstPort},0\n`,
      ]);
      session.dispatch(second, 'released');
      await tick();
      assert.ok(transport.writes.includes(`m,${secondPort},0\n`));
    }
  } finally {
    await session.dispose();
  }
});

test('held red stop takes priority over blue motion on A and D until released', async () => {
  const {compileControllerProgram} = await import('../public/controller-program.js');
  const blue = {controlId: 'panel', input: 'blue'};
  const red = {controlId: 'panel', input: 'red'};
  const blocks = [
    {id:'panel', type:'motor-buttons', controlAreaId:'area', controlModules:['red'], x:0, y:44},
    {id:'go', type:'button', target:blue, event:'hold', x:0, y:200},
    {id:'motors', type:'drive', parentId:'go', modules:['pair','speed'], motor:'A', motor2:'D', speed:300, direction:'forward', direction2:'forward', x:0, y:260},
    {id:'brake', type:'button', target:red, event:'hold', x:220, y:200},
    {id:'stops', type:'stop', parentId:'brake', motors:['A','D'], x:220, y:260},
  ];
  const compiled = compileControllerProgram({id:'ad', hub:'spike', workspace:{
    controlLayout:{version:1, areas:[{id:'area',sheetId:'main'}], controls:[]},
    sheets:[{id:'main',blocks}],
  }});
  assert.deepEqual(compiled.errors, []);
  const transport = fakePorts('A,D');
  const session = createControllerSession(transport);
  try {
    await session.connect(); await session.startHub();
    await session.setViewMode('check'); await session.startProgram(compiled);
    for (const press of [[blue,red],[red,blue]]) {
      for (const release of [[blue,red],[red,blue]]) {
        const held = new Set();
        const speeds = {A:0,D:0};
        for (const [target,event] of [...press.map(t=>[t,'pressed']), ...release.map(t=>[t,'released'])]) {
          if (event === 'pressed') held.add(target); else held.delete(target);
          transport.writes.length = 0;
          session.dispatch(target,event);
          await tick();
          for (const line of transport.writes) {
            const [,port,speed] = /^m,([AD]),(-?\d+)\n$/.exec(line) || [];
            if (port) speeds[port] = Number(speed);
          }
          const expected = held.has(blue) && !held.has(red) ? 300 : 0;
          assert.deepEqual(speeds,{A:expected,D:expected},target.input+' '+event);
        }
      }
    }
  } finally { await session.dispose(); }
});


test('mpy compiler validates empty/oversized source and keeps cache bounded for user edits', async () => {
  const { compilePythonToMultiMpy6, getCompilerCacheSize, MAX_PYTHON_SOURCE_CHARS } = await import('../src/lib/mpy-compiler.ts');
  const wasmB64 = readFileSync(new URL('../public/vendor/mpy-cross-v6.wasm', import.meta.url)).toString('base64');
  const wasmPath = 'data:application/wasm;base64,' + wasmB64;

  await assert.rejects(() => compilePythonToMultiMpy6('   \n', { wasmPath }), /пуст/);
  await assert.rejects(() => compilePythonToMultiMpy6('a'.repeat(MAX_PYTHON_SOURCE_CHARS + 1), { wasmPath }), /длинный/);
  await assert.rejects(() => compilePythonToMultiMpy6('def broken(:', { wasmPath }), /Ошибка в коде Python/);

  const before = getCompilerCacheSize();
  const b1 = await compilePythonToMultiMpy6('x = 1\n', { wasmPath });
  const b2 = await compilePythonToMultiMpy6('x = 2\n', { wasmPath });
  assert.ok(b1.byteLength > 0 && b2.byteLength > 0);
  assert.equal(getCompilerCacheSize(), before);
});

test('custom Pybricks run resets hub tracking cleanly, avoids false link-lost fault, and restores Blocks auto-upload', async () => {
  let notify;
  let hubMode = 'controller';
  let uploads = 0;
  let disconnected = false;
  const t = {
    connect: async (fn) => { notify = fn; },
    startHub: async ({ probe } = {}) => {
      if (!probe && hubMode === 'custom') {
        setTimeout(() => notify('SOCER2_LINK_LOST'), 15);
      }
    },
    write: async (line) => {
      if (line === 'h\n') {
        if (hubMode === 'controller') {
          notify(`SOCER_VER|${HUB_PROGRAM_VERSION}`);
          notify('SOCER3_READY|A');
        } else {
          notify('SOCER2_LINK_LOST');
        }
      }
      if (line === 'x\n') notify('SOCER2_STOP');
    },
    uploadProgram: async (blob, onProgress) => {
      uploads++;
      onProgress(100);
      hubMode = blob[0] === 99 ? 'custom' : 'controller';
    },
    stopProgram: async () => {
      hubMode = 'custom';
    },
    disconnect: async () => { disconnected = true; },
  };
  const session = createControllerSession(t, undefined, {
    compileHubProgram: async () => new Uint8Array([1, 2, 3]),
    compileCustomProgram: async (src) => {
      if (src.includes('SYNTAX_ERR')) throw new Error('Ошибка в коде Python: SyntaxError');
      return new Uint8Array([99, 1]);
    },
    probeTimeoutMs: 50,
  });

  await session.connect();
  await session.startHub();
  assert.equal(session.getState().transport, 'ready');

  const bad = await session.runCustomProgram('SYNTAX_ERR');
  assert.equal(bad.ok, false);
  assert.equal(session.getState().transport, 'ready');
  assert.equal(disconnected, false);

  const good = await session.runCustomProgram('print("hi")');
  assert.equal(good.ok, true);
  assert.equal(session.getState().transport, 'connected');
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(session.getState().transport, 'connected');
  assert.equal(session.getState().program, 'stopped');
  assert.equal(disconnected, false);

  const uploadsBefore = uploads;
  await session.startHub();
  assert.equal(uploads, uploadsBefore + 1);
  assert.equal(session.getState().transport, 'ready');
  await session.dispose();
});
