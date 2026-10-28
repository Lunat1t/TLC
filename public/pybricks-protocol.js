export const SERVICE = 'c5f50001-8280-46da-89f4-6d8051e4aeef';
export const COMMAND_EVENT = 'c5f50002-8280-46da-89f4-6d8051e4aeef';
export const DEVICE_INFO = 0x180a;
export const SOFTWARE_REVISION = 0x2a28;
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
    const flags = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(1,true);
    return {type:'status',running:!!(flags & 64),flags};
  }
  if (bytes[0] === 1) return {type:'stdout',text:decoder.decode(bytes.subarray(1))};
  return {type:'other',bytes};
}
