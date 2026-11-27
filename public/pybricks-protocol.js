export const SERVICE = 'c5f50001-8280-46da-89f4-6d8051e4aeef';
export const COMMAND_EVENT = 'c5f50002-8280-46da-89f4-6d8051e4aeef';
export const HUB_CAPABILITIES = 'c5f50003-8280-46da-89f4-6d8051e4aeef';
export const DEVICE_INFO = 0x180a;
export const SOFTWARE_REVISION = 0x2a28;
export const FEATURE_MULTI_MPY_V6 = 1 << 1;
export const HUB_PROGRAM_VERSION = '7';
export const encoder = new TextEncoder();
export const decoder = new TextDecoder();

export function commandBytes(text) {
  const bytes = encoder.encode(text);
  if (bytes.length > 100) throw new Error('Слишком длинная команда');
  return Uint8Array.of(6, ...bytes);
}

export function eventBytes(value) {
  if (value instanceof DataView) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new Uint8Array(value);
}

export function parseEvent(value) {
  const bytes = eventBytes(value);
  if (bytes[0] === 0 && bytes.length >= 5) {
    const flags = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(1, true);
    return {
      type: 'status',
      running: !!(flags & 64),
      shutdown: !!(flags & 128),
      shutdownRequested: !!(flags & 256),
      hostConnected: !!(flags & 512),
      flags,
      activeSlot: bytes.length >= 6 ? bytes[5] : null,
    };
  }
  if (bytes[0] === 1) return { type: 'stdout', text: decoder.decode(bytes.subarray(1)) };
  return { type: 'other', bytes };
}

export function parseHubCapabilities(value) {
  const bytes = eventBytes(value);
  if (bytes.byteLength < 10) {
    throw new Error('Некорректный ответ возможностей хаба Pybricks');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    maxCharSize: view.getUint16(0, true),
    featureFlags: view.getUint32(2, true),
    maxUserProgramSize: view.getUint32(6, true),
    numOfSlots: bytes.byteLength >= 11 ? bytes[10] : 1,
  };
}

export function stopProgramBytes() {
  return Uint8Array.of(0);
}

export function startProgramBytes(slot) {
  return typeof slot === 'number' ? Uint8Array.of(1, slot & 0xff) : Uint8Array.of(1);
}

export function writeProgramMetaBytes(size) {
  const bytes = new Uint8Array(5);
  bytes[0] = 3;
  new DataView(bytes.buffer).setUint32(1, size >>> 0, true);
  return bytes;
}

export function writeUserRamBytes(offset, chunk) {
  const payload = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
  const bytes = new Uint8Array(5 + payload.byteLength);
  bytes[0] = 4;
  new DataView(bytes.buffer).setUint32(1, offset >>> 0, true);
  bytes.set(payload, 5);
  return bytes;
}

export function buildMultiMpy6Blob(modules) {
  const parts = [];
  let total = 0;
  for (const mod of modules) {
    const nameBytes = encoder.encode(mod.name);
    const mpy = mod.mpy instanceof Uint8Array ? mod.mpy : new Uint8Array(mod.mpy);
    const header = new Uint8Array(4 + nameBytes.byteLength + 1);
    new DataView(header.buffer).setUint32(0, mpy.byteLength >>> 0, true);
    header.set(nameBytes, 4);
    header[4 + nameBytes.byteLength] = 0;
    parts.push(header, mpy);
    total += header.byteLength + mpy.byteLength;
  }
  const blob = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    blob.set(part, offset);
    offset += part.byteLength;
  }
  return blob;
}
