import {frame,FrameReader,notificationBytes,errorText} from './spike-protocol.js';
// Strict diagnostic allow-list: no file upload, slot erase, program start or motor traffic.
export function diagnosticFrame(message) {
  const info=message.length===1 && message[0]===0;
  const sensors=message.length===3 && message[0]===40;
  if(!info && !sensors)throw new Error('Диагностика разрешает только чтение сведений и данных датчиков');
  return frame(message);
}
export function createDiagnosticReceiver(onPacket,onMessage,onError) {
  const seen=new WeakSet();
  const reader=new FrameReader(onMessage);
  return event=>{
    if(event && typeof event==='object'){if(seen.has(event))return;seen.add(event);}
    try {
      const value=event?.target?.value ?? event?.currentTarget?.value;
      const bytes=notificationBytes(value);onPacket(bytes);reader.push(bytes);
    }catch(error){onError(errorText(error));}
  };
}

// No form state can skip the LEGO-mandated write-without-response probe.
export function diagnosticWritePlan(rx) {
  const methods=['writeValueWithoutResponse','writeValue'].filter(name=>typeof rx[name]==='function');
  return methods.flatMap(method=>['Uint8Array','DataView','ArrayBuffer'].map(format=>({method,format})));
}
