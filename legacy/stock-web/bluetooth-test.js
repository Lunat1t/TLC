import {SERVICE,RX,TX,notificationBytes,errorText,deadline,parseInfo} from './spike-protocol.js';
import {diagnosticFrame,createDiagnosticReceiver,diagnosticWritePlan} from './bluetooth-diagnostic.js';
import {subscribeNotifications} from './notifications.js';
const $=id=>document.getElementById(id);
let device=null,active=null,rx=null,tx=null,packets=0,messages=0,stopped=true,streamRequested=false;
const lines=[];
function log(text){lines.push(new Date().toLocaleTimeString()+' · '+text);$('log').textContent=lines.join('\n');}
function result(text){$('result').textContent=text;}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function alive(token){if(stopped || active!==token || !device?.gatt?.connected)throw new Error('Проверка прервана');}
async function write(message,method,token,format="Uint8Array"){
  alive(token);const bytes=diagnosticFrame(message);
  log('TX '+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(' ')+' · '+method+' · '+format);
  await deadline(rx[method](format==='ArrayBuffer' ? bytes.buffer : format==='DataView' ? new DataView(bytes.buffer) : bytes),3000,'Браузер не завершил запись');log('Запись завершена браузером.');
}
function disconnect(){
  stopped=true;active=null;
  const old=device;device=null;if(old?.gatt?.connected)old.gatt.disconnect();
  rx=tx=null;$('test').disabled=false;$('disconnect').disabled=true;
}
$('disconnect').onclick=()=>{disconnect();result('Отключено');};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(lines.join('\n'));result('Журнал скопирован');}catch{result('Выдели текст журнала и скопируй вручную.');}};
$('test').onclick=async()=>{
  if(!navigator.bluetooth || !isSecureContext){result('В этом браузере Web Bluetooth недоступен.');return;}
  disconnect();lines.length=0;packets=messages=0;streamRequested=false;
  const token={};active=token;stopped=false;$('test').disabled=true;
  log('Диагностика 4 · '+navigator.userAgent);
  try{
    const selected=await navigator.bluetooth.requestDevice({filters:[{services:[SERVICE]}],optionalServices:['0000180a-0000-1000-8000-00805f9b34fb']});
    if(stopped || active!==token)throw new Error('Проверка прервана');
    device=selected;selected.addEventListener('gattserverdisconnected',()=>{if(device===selected){log('Соединение разорвано.');disconnect();}},{once:true});
    log('Хаб выбран.');await pause(500);
    const server=await deadline(selected.gatt.connect(),15000,'Нет Bluetooth-соединения');alive(token);log('GATT подключён.');await pause(500);
    const service=await server.getPrimaryService(SERVICE);await pause(500);alive(token);
    rx=await service.getCharacteristic(RX);await pause(500);alive(token);
    tx=await service.getCharacteristic(TX);await pause(500);alive(token);
    for(const [name,c]of [['RX',rx],['TX',tx]])log(name+' '+c.uuid+' · writeWithoutResponse='+c.properties?.writeWithoutResponse+' · write='+c.properties?.write+' · notify='+c.properties?.notify+' · indicate='+c.properties?.indicate+' · read='+c.properties?.read);
    // This optional read uses standard Bluetooth Device Information, not LEGO motor APIs.
    try{
      const info=await server.getPrimaryService('0000180a-0000-1000-8000-00805f9b34fb');
      const revision=await info.getCharacteristic('00002a26-0000-1000-8000-00805f9b34fb');
      const value=await deadline(revision.readValue(),3000,'Нет ответа на стандартное чтение');
      log('Стандартное чтение прошивки: '+new TextDecoder().decode(notificationBytes(value)));
    }catch(error){log('Стандартное чтение недоступно: '+errorText(error));}
    alive(token);await pause(500);
    const rawReceive=createDiagnosticReceiver(bytes=>{packets++;log('RX '+bytes.length+' байт: '+Array.from(bytes.slice(0,64),b=>b.toString(16).padStart(2,'0')).join(' '));},message=>{
      messages++;log('Сообщение '+message[0]+' · '+message.length+' байт');
      if(message[0]===1){try{const info=parseInfo(message);log('LEGO ответил: RPC '+info.rpc+', прошивка '+info.firmware);}catch(error){log(errorText(error));}}
    },message=>log('Разбор ответа: '+message));
    const receive=event=>{if(active===token && !stopped)rawReceive(event);};
    tx=await deadline(subscribeNotifications(tx,receive),10000,'Подписка не завершена');
    log('Подписка завершена.');await pause(700);alive(token);$('disconnect').disabled=false;
    for(const method of ['writeValue','writeValueWithoutResponse','writeValueWithResponse'])log(method+': '+typeof rx[method]);
    const plan=diagnosticWritePlan(rx);
    if(!plan.length)throw new Error('Нет доступного метода записи');
    log('План проверки: '+plan.map(p=>p.method+' / '+p.format).join('; '));
    let lastWrite=null;
    for(const {method,format} of plan){
      try{
        lastWrite={method,format};
        await write(new Uint8Array([0]),method,token,format);await pause(2000);alive(token);
        if(messages)break;
        log('Проверка потока датчиков, без запуска моторов.');streamRequested=true;
        await write(new Uint8Array([40,244,1]),method,token,format);await pause(2500);alive(token);
        if(messages)break;
      }catch(error){
        alive(token);log('Попытка '+method+' / '+format+': '+errorText(error));
        // A timed-out write may still be in progress: do not overlap another one.
        if(error?.message==='Браузер не завершил запись')throw error;
      }
    }
    result(packets ? `Получено пакетов: ${packets}; разобрано сообщений: ${messages}.` : 'Ответов нет: Bluetooth-соединение есть, но входящие данные не поступили.');
    log('ИТОГ: пакетов '+packets+', сообщений '+messages+'. Движение и загрузка не запускались.');
    if(streamRequested){
      try{await write(new Uint8Array([40,0,0]),lastWrite.method,token,lastWrite.format);}catch(error){log('Отключение потока: '+errorText(error));}
    }
  }catch(error){log('ОШИБКА: '+errorText(error));result(errorText(error));}
  finally{if(active===token)disconnect();}
};
window.addEventListener('pagehide',disconnect);
