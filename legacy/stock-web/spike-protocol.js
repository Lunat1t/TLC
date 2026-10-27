// LEGO SPIKE Prime Hub OS 3 protocol. Source specification: lego.github.io/spike-prime-docs/.
export const SERVICE = '0000fd02-0000-1000-8000-00805f9b34fb';
export const RX = '0000fd02-0001-1000-8000-00805f9b34fb';
export const TX = '0000fd02-0002-1000-8000-00805f9b34fb';
export const READY = 'SOCCER_STOCK_READY:2';
const encoder = new TextEncoder();
export function encode(data) {
  const out = [255]; let index = 0, block = 1;
  for (const value of data) {
    if (value > 2) { out.push(value); block++; }
    if (value <= 2 || block > 84) {
      if (value <= 2) out[index] = value * 84 + block + 2;
      index = out.length; out.push(255); block = 1;
    }
  }
  out[index] = block + 2;
  return Uint8Array.from(out);
}
export function decode(data) {
  const out = []; let cursor = 0;
  while (cursor < data.length) {
    const code = data[cursor++];
    if (code < 3) throw new Error('Неверный COBS-пакет');
    let value = null, count;
    if (code === 255) count = 84;
    else {
      const n = code - 2; value = Math.floor(n / 84); let block = n % 84;
      if (block === 0) { block = 84; value--; }
      count = block - 1;
    }
    if (cursor + count > data.length) throw new Error('Неполный COBS-пакет');
    for (let i = 0; i < count; i++) {
      if (data[cursor] < 3) throw new Error('Неверные данные COBS');
      out.push(data[cursor++]);
    }
    if (cursor < data.length && value !== null) out.push(value);
    else if (cursor === data.length && code === 255) throw new Error('Нет конца COBS-пакета');
  }
  return Uint8Array.from(out);
}
export function frame(message) {
  const encoded = encode(message), result = new Uint8Array(encoded.length + 1);
  for (let i = 0; i < encoded.length; i++) result[i] = encoded[i] ^ 3;
  result[encoded.length] = 2; return result;
}
export class FrameReader {
  constructor(deliver) { this.deliver = deliver; this.low = []; this.high = []; this.priority = false; }
  push(bytes) {
    for (const byte of bytes) {
      if (byte === 1) {
        if (this.priority) { this.low = []; this.high = []; }
        this.priority = true; this.high = []; continue;
      }
      const queue = this.priority ? this.high : this.low;
      if (byte === 2) {
        if (queue.length) {
          try { this.deliver(decode(Uint8Array.from(queue, x => x ^ 3))); }
          catch (error) { this.low = []; this.high = []; this.priority = false; throw error; }
        }
        if (this.priority) { this.high = []; this.priority = false; }
        else this.low = [];
      } else {
        queue.push(byte);
        if (queue.length > 65536) { this.low = []; this.high = []; this.priority = false; throw new Error('Переполнен буфер Bluetooth'); }
      }
    }
  }
}
export function crc32(bytes, seed = 0, align = 4) {
  let value = (seed ^ 0xffffffff) >>> 0;
  const size = Math.ceil(bytes.length / align) * align;
  for (let i = 0; i < size; i++) {
    value ^= i < bytes.length ? bytes[i] : 0;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
export function tunnel(text) {
  const payload = encoder.encode(text); if (payload.length > 65535) throw new Error('Команда слишком длинная');
  const out = new Uint8Array(3 + payload.length); out[0] = 50;
  new DataView(out.buffer).setUint16(1, payload.length, true); out.set(payload, 3); return out;
}
export function uploadStart(slot, source) {
  checkSlot(slot);
  const name = encoder.encode('program.py\0'), out = new Uint8Array(1 + name.length + 5);
  out[0] = 12; out.set(name, 1); out[1 + name.length] = slot;
  new DataView(out.buffer).setUint32(2 + name.length, crc32(source), true); return out;
}
export function uploadChunk(bytes, crc) {
  const out = new Uint8Array(7 + bytes.length), view = new DataView(out.buffer); out[0] = 16;
  view.setUint32(1, crc, true); view.setUint16(5, bytes.length, true); out.set(bytes, 7); return out;
}
export function checkSlot(slot) { if (!Number.isInteger(slot) || slot < 0 || slot > 19) throw new Error('Выбери слот 0–19'); }
export function parseInfo(message) {
  if (message.length < 17 || message[0] !== 1) throw new Error('Неверный ответ SPIKE Prime');
  const view = new DataView(message.buffer, message.byteOffset, message.byteLength);
  const info = {rpc: `${message[1]}.${message[2]}.${view.getUint16(3,true)}`, firmware: `${message[5]}.${message[6]}.${view.getUint16(7,true)}`, packetSize: view.getUint16(9,true), messageSize: view.getUint16(11,true), chunkSize: view.getUint16(13,true), product: view.getUint16(15,true)};
  // Hub firmware version and SPIKE App version are separate identifiers.
  // The LEGO service and structurally valid InfoResponse establish the protocol.
  // Report version fields for diagnosis; do not equate either with SPIKE App 3.
  if (info.packetSize < 5 || info.messageSize < 32 || info.chunkSize < 4) throw new Error('Неподдерживаемые ограничения хаба');
  return info;
}
export function deadline(promise, ms, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]).finally(() => clearTimeout(timer));
}
export function gattWriteModes(rx, preferLegacy=false) {
  const modes=[];
  const add=name=>{if(typeof rx[name]==='function' && !modes.includes(name))modes.push(name);};
  // An explicitly advertised write-without-response takes precedence even in Bluefy mode.
  if(preferLegacy && rx.properties?.writeWithoutResponse !== true)add('writeValue');
  if(rx.properties?.writeWithoutResponse !== false)add('writeValueWithoutResponse');
  if(rx.properties?.write === true)add('writeValueWithResponse');
  add('writeValue');
  if(!modes.length)throw new Error('Браузер не предоставляет подходящий способ записи Bluetooth');
  return modes;
}
export function notificationBytes(value) {
  if(value instanceof ArrayBuffer)return new Uint8Array(value);
  if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
  throw new Error('Браузер вернул неизвестный формат Bluetooth-ответа');
}
export function errorText(error) {
  if(typeof error === 'string')return error || 'Пустая ошибка браузера';
  if(error?.message)return String(error.message);
  if(error?.description)return String(error.description);
  if(error?.name)return String(error.name)+(error.code !== undefined ? ' (код '+error.code+')':'');
  try {const json=JSON.stringify(error);if(json && json!=='{}')return json;}catch{}
  return 'Браузер вернул ошибку без описания';
}
export class SpikeSession {
  constructor(rx, onMessage = () => {}) {
    this.rx = rx; this.onMessage = onMessage; this.info = null; this.closed = false; this.pending = null; this.sending = false;
    this.writeMethod=gattWriteModes(rx)[0];
    this.bufferMode=false;this.onDiagnostic=()=>{};
    this.reader = new FrameReader(message => this.receive(message));
  }
  receive(message) {
    if (this.closed || !message.length) return;
    if (this.pending?.type === message[0]) {
      const pending = this.pending; this.pending = null; pending.resolve(message);
    }
    this.onMessage(message);
  }
  close() {
    this.closed = true;
    if (this.pending) { this.pending.reject(new Error('Соединение закрыто')); this.pending = null; }
  }
  async send(message, {priority=false}={}) {
    if (this.closed) throw new Error('Соединение закрыто');
    // No firmware, reboot, rename or arbitrary opcodes are supported by this app.
    if (![0,12,16,30,50,70].includes(message[0])) throw new Error('Команда не разрешена');
    if (this.sending) throw new Error('Bluetooth занят другой командой');
    if (this.info && message.length > this.info.messageSize) throw new Error('Сообщение превышает лимит хаба');
    this.sending = true;
    try {
      const packed=frame(message);
      const bytes=priority ? Uint8Array.from([1,...packed]):packed;
      const size = Math.min(this.info?.packetSize || 20, 20);
      if(message[0]===0)this.onDiagnostic('TX '+bytes.length+' байт: '+Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join(' '));
      for (let i = 0; i < bytes.length; i += size) {
        if (this.closed) throw new Error('Соединение закрыто');
        const part=bytes.slice(i,i+size);
        const payload=this.bufferMode ? part.buffer : part;
        await deadline(this.rx[this.writeMethod](payload), 1500, 'Bluetooth не отвечает');
        if(message[0]===0)this.onDiagnostic('Браузер завершил запись запроса в GATT.');
      }
    } catch (error) { this.close(); throw (error instanceof Error ? error : new Error(errorText(error))); }
    finally { this.sending = false; }
  }
  async request(message, responseType, {allowNack = false, infoRetry=false, timeoutMs=5000, priority=false} = {}) {
    if (this.pending) throw new Error('Ожидание предыдущего ответа');
    let resolve, reject;
    const answer = new Promise((yes, no) => { resolve = yes; reject = no; });
    const pending = {type: responseType, resolve, reject}; this.pending = pending;
    // Attach rejection handler before a send failure can close the session.
    answer.catch(() => {});
    try {
      await this.send(message,{priority});
      const timeoutMessage=`Хаб не подтвердил команду ${message[0]} (ожидался ответ ${responseType})`;
      let response;
      try { response=await deadline(answer,timeoutMs,timeoutMessage); }
      catch(error) { if(error.message===timeoutMessage)error.code='RESPONSE_TIMEOUT';throw error; }
      if (responseType !== 1 && (response.length < 2 || response[1] !== 0) && !allowNack) throw new Error(`Хаб отклонил команду ${message[0]}`);
      return response;
    } catch(error) {
      if(!(infoRetry && message[0]===0 && error.code==='RESPONSE_TIMEOUT'))this.close();
      throw error;
    }
    finally { if (this.pending === pending) this.pending = null; }
  }
  async negotiate({preferLegacy=false,timeoutMs=2500,attempts=3,onDiagnostic=()=>{}}={}) {
    const modes=gattWriteModes(this.rx,preferLegacy);this.onDiagnostic=onDiagnostic;
    for(let attempt=0;attempt<attempts;attempt++) {
      this.writeMethod=modes[Math.min(attempt,modes.length-1)];
      this.bufferMode=preferLegacy && attempt<2 && this.writeMethod==='writeValue';
      const priority=preferLegacy && attempt===2;
      onDiagnostic(`Запрос сведений ${attempt+1}/${attempts} · ${this.writeMethod} · ${this.bufferMode?'ArrayBuffer':'Uint8Array'}${priority?' · приоритетный пакет':''}`);
      try {
        this.info=parseInfo(await this.request(new Uint8Array([0]),1,{infoRetry:true,timeoutMs,priority}));
        return this.info;
      } catch(error) {
        if(error.code!=='RESPONSE_TIMEOUT' || this.closed || attempt===attempts-1){this.close();throw error;}
        onDiagnostic('Нет ответа на запрос сведений. Повторяется только безопасное чтение.');
      }
    }
  }
  async upload(source, slot, progress = () => {}) {
    if (!this.info) throw new Error('Хаб не проверен'); checkSlot(slot);
    // Stop any running user program before changing the explicitly selected slot.
    await this.request(new Uint8Array([30,1,slot]), 31, {allowNack:true});
    await this.request(new Uint8Array([70,slot]), 71, {allowNack:true});
    await this.request(uploadStart(slot, source), 13);
    let crc = 0;
    // Four-byte alignment keeps per-chunk CRC equal to the whole-file CRC.
    const count = Math.floor(Math.min(this.info.chunkSize, this.info.messageSize - 7, 480) / 4) * 4;
    if (count < 4) throw new Error('Слишком маленький размер блока');
    for (let i = 0; i < source.length; i += count) {
      const bytes = source.slice(i, i + count); crc = crc32(bytes, crc);
      await this.request(uploadChunk(bytes, crc), 17);
      progress(Math.round(Math.min(i + count, source.length) / source.length * 100));
    }
  }
  async start(slot) { checkSlot(slot); await this.request(new Uint8Array([30,0,slot]), 31); }
  async command(text) { await this.send(tunnel(text)); }
}
