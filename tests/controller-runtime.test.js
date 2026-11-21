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
  assert.match(HUB_PROGRAM_SOURCE, /PROGRAM_VERSION = "4"/);
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
