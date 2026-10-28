import {command, drivePercent, packet, LatestWriter} from './control.js';
import {SERVICE,COMMAND_EVENT,commandBytes,parseEvent} from './pybricks-protocol.js';
import {subscribeNotifications} from './notifications.js';
import {PORTS,validateHardware,configId,buildProgram} from './pybricks-config.js';
const LEGO_SERVICE='0000fd02-0000-1000-8000-00805f9b34fb';
const $ = id => document.getElementById(id);
const move = {x:0,y:0};
let device=null, characteristic=null, writer=null, ready=false, armed=false, connecting=false, programStarted=false, autoStartRequested=false, startWritePending=false, pointer=null;
let level=0, lastSent='', lastSentTime=0, lastAck=0, lastProbe=0, stdoutBuffer='', startupTimer=null;
let motionLimits={speed:500,turn:150};
let kickerState='первое нажатие — заряд';
let connectionStage='ожидание';
const events=[];
function log(text){events.push(new Date().toLocaleTimeString()+' · '+text);if(events.length>60)events.shift();$('connectionLog').textContent=events.join('\n');}
function stage(text){connectionStage=text;log('Этап: '+text);}
function errorDetails(value){
  if(value==null)return 'Bluefy вернул пустую ошибку';
  const name=typeof value.name==='string'?value.name:'';
  const message=typeof value.message==='string'?value.message:'';
  const code=value.code===undefined?'':String(value.code);
  const parts=[name,message,code&&'код '+code].filter(Boolean);
  if(parts.length)return parts.join(' · ');
  const raw=String(value);
  return raw==='[object Object]'?'Bluefy вернул ошибку без описания':raw;
}
function status(text){$('status').textContent=text;log(text);}
function hint(text){$('hint').textContent=text;}
function error(text){$('errorMessage').textContent=text;$('connectionError').hidden=false;log(text);}
for(const id of ['leftPort','rightPort','kickerPort']){
  if(id!=='leftPort')$(''+id).add(new Option('Не используется','none'));
  for(const port of PORTS)$(id).add(new Option(port,port));
}
let saved=null;try{saved=JSON.parse(localStorage.getItem('socer-pybricks-hardware')||'null');}catch{}
const initial=saved||{left:'A',right:null,kicker:null,leftSign:1,rightSign:1,kickerSign:1};
for(const [field,value] of [['leftPort',initial.left],['rightPort',initial.right||'none'],['kickerPort',initial.kicker||'none']])$(field).value=value;
for(const field of ['left','right','kicker'])$(field+'Reverse').checked=initial[field+'Sign']===-1;
function hardware(){
  const config={left:$('leftPort').value,right:$('rightPort').value==='none'?null:$('rightPort').value,kicker:$('kickerPort').value==='none'?null:$('kickerPort').value,leftSign:$('leftReverse').checked?-1:1,rightSign:$('rightReverse').checked?-1:1,kickerSign:$('kickerReverse').checked?-1:1};
  return validateHardware(config);
}
function updateUI(){
  let config=null;try{config=hardware();$('hardwareStatus').textContent='Ход: '+config.left+(config.right?' и '+config.right:' (один мотор)')+' · Удар: '+(config.kicker||'отключён');}catch(e){$('hardwareStatus').textContent=e.message;}
  $('arm').disabled=!ready||connecting||!config;
  $('arm').hidden=!ready;
  $('kick').disabled=!armed||!ready||!config?.kicker;
  $('kickState').textContent=config?.kicker?kickerState:'не используется';
  $('connect').disabled=connecting||armed;
  $('connect').textContent=!device?.gatt?.connected?'Подключить и играть':armed?'Хаб подключён':ready?'Продолжить':'Запустить программу';
  $('startProgram').disabled=!characteristic||connecting||armed;
  $('disconnectHub').disabled=!device?.gatt?.connected;
  $('oneMotorSetup').disabled=armed;
  $('fullSetup').disabled=armed;
  for(const id of ['leftPort','rightPort','kickerPort','leftReverse','rightReverse','kickerReverse'])$(id).disabled=armed;
}
const activeButtons=new Map(),pointerButtons=new Map();
const BUTTON_DIRS=[['forwardBtn','forward'],['backwardBtn','backward'],['leftBtn','left'],['rightBtn','right']];
let releaseTimer=null,lastButtonPressAt=0;
function syncButtons(){
  const dirs=new Set(activeButtons.values());
  move.x=dirs.has('left')?-1:dirs.has('right')?1:0;
  move.y=dirs.has('forward')?-1:dirs.has('backward')?1:0;
  for(const [id,dir] of BUTTON_DIRS)$(id)?.classList?.toggle?.('active',dirs.has(dir));
}
function resetStick(){
  if(releaseTimer!==null){clearTimeout(releaseTimer);releaseTimer=null;}
  if(pointer!==null&&$('move').hasPointerCapture(pointer))$('move').releasePointerCapture(pointer);
  activeButtons.clear();pointerButtons.clear();syncButtons();
  pointer=null;move.x=move.y=0;const knob=$('move').querySelector('.knob');if(knob)knob.style.transform='translate(-50%,-50%)';updateDriveSpeed();sendMotion(true);
}
function updateDriveSpeed(){$('driveSpeed').textContent=drivePercent(move,level,motionLimits)+'%';}
function sendMotion(immediate=false){
  if(!armed||!ready||!writer||writer.closed||document.hidden)return;
  try{if(hardware().right&&!motionLimits.turn)motionLimits={speed:motionLimits.speed||500,turn:150};}catch{}
  const now=performance.now();
  const text=packet(command(move,level,false,motionLimits));
  if(immediate||text!==lastSent||now-lastSentTime>150){writer.submit(text);lastSent=text;lastSentTime=now;}
}
function stop(reason='Остановлено'){
  if(startupTimer!==null){clearTimeout(startupTimer);startupTimer=null;}
  autoStartRequested=false;armed=false;kickerState='первое нажатие — заряд';resetStick();$('arm').textContent='Продолжить';
  if(programStarted)writer?.submitStop('x\n');hint(reason);updateUI();
}
function disconnect(reason='Хаб отключён'){
  if(startupTimer!==null){clearTimeout(startupTimer);startupTimer=null;}
  autoStartRequested=false;armed=false;ready=false;programStarted=false;resetStick();writer?.close();writer=null;characteristic=null;
  const old=device;device=null;if(old?.gatt?.connected)old.gatt.disconnect();
  $('arm').textContent='Продолжить';$('link').textContent='Bluetooth: нет связи';
  status(reason);$('setupStatus').textContent=reason;updateUI();
}
function selectKnownProfile(profile){
  const full=profile==='A,D,F,-1,1,1';
  motionLimits=full?{speed:500,turn:150}:{speed:400,turn:0};
  $('leftPort').value='A';$('rightPort').value=full?'D':'none';$('kickerPort').value=full?'F':'none';
  $('leftReverse').checked=full;$('rightReverse').checked=false;$('kickerReverse').checked=false;
  kickerState='первое нажатие — заряд';
  try{localStorage.setItem('socer-pybricks-hardware',JSON.stringify(hardware()));}catch{}
  log('Настройки синхронизированы с программой хаба: '+profile);
}
function activateControl(){
  if(!ready||armed||pointer!==null||activeButtons.size>0)return;
  armed=true;lastAck=performance.now();lastSent='v,0,0,0\n';lastSentTime=performance.now();
  writer?.submit(lastSent);$('arm').textContent='Пауза';hint('Управление включено. Нажимай кнопки хода и поворота.');updateUI();
}
function onLine(line){
  if(line!=='SOCER_ACK')log('Хаб: '+line);
  if(line.includes('SOCER_ACK'))lastAck=performance.now();
  const expected='SOCER_READY|'+configId(hardware());
  const known=['A,D,F,-1,1,1','A,-,-,1,1,1'].find(id=>line.includes('SOCER_READY|'+id));
  if(known)motionLimits=known==='A,D,F,-1,1,1'?{speed:500,turn:150}:{speed:400,turn:0};
  if(known&&known!==configId(hardware()))selectKnownProfile(known);
  const tuning=line.match(/SOCER_TUNING\|(\d+)\|(\d+)/);
  if(tuning&&hardware().right&&+tuning[1]>=500&&+tuning[1]<=700&&+tuning[2]>=150&&+tuning[2]<=300){
    motionLimits={speed:+tuning[1],turn:+tuning[2]};
    log('Быстрый режим: ход '+motionLimits.speed+' мм/с, поворот '+motionLimits.turn+'°/с');
    updateDriveSpeed();
  }
  if(line.includes('SOCER_READY|'+configId(hardware()))){ready=true;lastAck=performance.now();if(startupTimer!==null){clearTimeout(startupTimer);startupTimer=null;}status('Программа готова');$('setupStatus').textContent='Программа запущена.';hint('Пульт готов к управлению.');if(autoStartRequested&&!startWritePending){autoStartRequested=false;activateControl();}}
  else if(line.startsWith('SOCER_READY|')&&/^SOCER_READY\|[A-F],(?:[A-F]|-),(?:[A-F]|-),-?1,-?1,-?1$/.test(line)){
    ready=false;stop('Настройки портов не совпадают: хаб '+line.slice(12)+', пульт '+expected.slice(12)+'.');
  }
  else if(line==='SOCER_MOTOR_A_NOT_FOUND'){ready=false;status('Мотор A не обнаружен');hint('Проверь подключение мотора к порту A.');}
  else if(line.startsWith('SOCER_MISSING:')){ready=false;status('Нет устройства на порту '+line.slice(14));hint('Проверь все порты A/D/F/E.');}
  else if(line==='SOCER_KICKER_CHARGING')kickerState='зарядка…';
  else if(line==='SOCER_KICKER_READY')kickerState='готов к удару';
  else if(line==='SOCER_KICKER_SHOOTING')kickerState='удар / перезарядка';
  else if(line==='SOCER_KICKER_WAIT')kickerState='первое нажатие — заряд';
  else if(line==='SOCER_KICKER_ERROR')kickerState='ошибка кикера';
  else if(line.includes('SOCER_LINK_LOST')){armed=false;resetStick();$('arm').textContent='Продолжить';status('Команды задержались — моторы остановлены');hint('Связь с хабом есть. Нажми «Продолжить» после проверки.');}
  if(line.includes('SOCER_CONTROL|DIRECT')&&!line.includes('SOCER_LINK_LOST'))hint('Прямое управление включено.');
  updateUI();
}
function onEvent(event){
  const parsed=parseEvent(event.target.value);
  if(parsed.type==='status'){programStarted=parsed.running;log('Состояние хаба: программа '+(parsed.running?'запущена':'остановлена'));if(!parsed.running&&ready){ready=false;armed=false;hint('Программа остановлена. Запусти её снова.');updateUI();}}
  if(parsed.type==='stdout'){
    stdoutBuffer+=parsed.text;
    while(stdoutBuffer.includes('\n')){const at=stdoutBuffer.indexOf('\n');const line=stdoutBuffer.slice(0,at).trim();stdoutBuffer=stdoutBuffer.slice(at+1);if(line)onLine(line);}
    if(stdoutBuffer.length>200)stdoutBuffer='';
  }
}
async function writeBytes(bytes){
  if(!characteristic)throw new Error('Хаб отключён');
  if(typeof characteristic.writeValueWithResponse==='function')return characteristic.writeValueWithResponse(bytes);
  return characteristic.writeValue(bytes);
}
$('connect').onclick=async()=>{
  if(device?.gatt?.connected){if(ready)activateControl();else await startInstalledProgram();return;}
  if(!navigator.bluetooth||!window.isSecureContext){error('Web Bluetooth недоступен в этом браузере. На iPhone открой именно HTTPS-сайт в Bluefy, не во встроенном браузере другого приложения.');return;}
  autoStartRequested=true;connecting=true;updateUI();$('connectionError').hidden=true;events.length=0;stage('поиск хаба Pybricks');
  try{
    const selected=await navigator.bluetooth.requestDevice({filters:[{services:[SERVICE]},{services:[LEGO_SERVICE]}]});
    device=selected;log('Выбран '+(selected.name||'хаб'));selected.addEventListener('gattserverdisconnected',()=>{if(device===selected)disconnect('Bluetooth-соединение разорвано');},{once:true});
    stage('соединение GATT');const server=await selected.gatt.connect();log('GATT подключён');
    stage('поиск сервиса Pybricks');
    let service;
    try{service=await server.getPrimaryService(SERVICE);}catch(pybricksError){
      try{await server.getPrimaryService(LEGO_SERVICE);throw new Error('На хабе обнаружена штатная прошивка LEGO. Установи Pybricks через code.pybricks.com, затем подключайся к этому пульту.');}
      catch(legoError){if(legoError?.message?.startsWith('На хабе'))throw legoError;throw pybricksError;}
    }
    stage('поиск канала команд');characteristic=await service.getCharacteristic(COMMAND_EVENT);log('Сервис Pybricks найден');
    log('Канал: write='+String(characteristic.properties?.write)+' · notify='+String(characteristic.properties?.notify));
    stage('подписка на ответы');
    await subscribeNotifications(characteristic,onEvent);log('Уведомления включены');
    writer=new LatestWriter(text=>writeBytes(commandBytes(text)),e=>{error('Ошибка записи: '+e.message);disconnect('Связь потеряна');});
    $('link').textContent=(selected.name||'Хаб')+' · Pybricks';status('Pybricks подключён');hint('Запускаю программу на хабе…');
    $('setupStatus').textContent='Подключено. Программа запускается автоматически.';
    await startInstalledProgram();
  }catch(e){const message=e?.name==='NotFoundError'?'Хаб не выбран или не виден. Отключи Pybricks Code от хаба и проверь, что на нём установлена прошивка Pybricks.':'Сбой на этапе «'+connectionStage+'»: '+errorDetails(e);disconnect(message);error(message);}
  finally{connecting=false;updateUI();}
};
async function startInstalledProgram(){
  if(!characteristic)return;
  try{autoStartRequested=true;ready=false;startWritePending=true;updateUI();await writeBytes(Uint8Array.of(1));startWritePending=false;programStarted=true;if(ready&&autoStartRequested){autoStartRequested=false;activateControl();}if(!ready)status('Программа запускается…');setTimeout(()=>{if(!ready)writer?.submit('h\n');},650);if(autoStartRequested)startupTimer=setTimeout(()=>{startupTimer=null;if(autoStartRequested&&device?.gatt?.connected&&!ready){error('Программа не ответила. Проверь, что она загружена в Pybricks Code, и повтори запуск.');autoStartRequested=false;updateUI();}},12000);}
  catch(e){startWritePending=false;autoStartRequested=false;error('Не удалось запустить программу: '+errorDetails(e));updateUI();}
}
$('startProgram').onclick=startInstalledProgram;
$('disconnectHub').onclick=()=>{stop('Отключено');setTimeout(()=>disconnect(),100);};
$('downloadProgram').onclick=async()=>{
  try{
    const c=hardware();const response=await fetch('hub_program.py',{cache:'no-store'});if(!response.ok)throw new Error('Файл программы не найден');
    const source=buildProgram(await response.text(),c);
    if(typeof URL.createObjectURL!=='function')throw new Error('Bluefy не поддерживает создание файла для скачивания');
    const url=URL.createObjectURL(new Blob([source],{type:'text/x-python;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='socer_pybricks.py';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL?.(url),1000);
    $('setupStatus').textContent='Программа скачана. Загрузи её в Pybricks Code, останови и отключи Pybricks Code от хаба.';
  }catch(e){const details=errorDetails(e);error('Не удалось подготовить файл: '+details+'. Для мотора A используй прямую ссылку выше.');}
};
for(const id of ['leftPort','rightPort','kickerPort','leftReverse','rightReverse','kickerReverse'])$(id).onchange=()=>{stop('Настройки изменены. Загрузи новую программу на хаб.');ready=false;try{localStorage.setItem('socer-pybricks-hardware',JSON.stringify(hardware()));}catch{}updateUI();};
$('fullSetup').onclick=()=>{
  if(armed)return;
  stop('Выбрана полная программа Socer. Загрузи socer_full.py на хаб.');ready=false;
  selectKnownProfile('A,D,F,-1,1,1');
  updateUI();
};
$('oneMotorSetup').onclick=()=>{
  if(armed)return;
  stop('Выбран один мотор A. Загрузи one_motor_A.py на хаб.');ready=false;
  selectKnownProfile('A,-,-,1,1,1');
  updateUI();
};
$('arm').onclick=()=>{if(armed)stop('Пауза');else activateControl();};
$('stop').onpointerdown=e=>{e.preventDefault();stop('Аварийный стоп');};$('stop').onclick=()=>stop('Аварийный стоп');
let lastKickPointer=0;
function requestKick(){
  if(!armed||!ready||!hardware().kicker)return;
  writer?.submitAction('k\n');
  kickerState='команда отправлена…';updateUI();
}
$('kick').onpointerdown=e=>{e.preventDefault();lastKickPointer=performance.now();requestKick();};
$('kick').onclick=()=>{if(performance.now()-lastKickPointer>500)requestKick();};
function changeSpeed(delta){level=Math.max(0,Math.min(2,level+delta));$('level').textContent=['35%','60%','100%'][level];updateDriveSpeed();sendMotion();}
$('slower').onclick=()=>changeSpeed(-1);$('faster').onclick=()=>changeSpeed(1);
function pressButton(id,dir,pointerId){
  if(!armed)return;
  if(releaseTimer!==null){clearTimeout(releaseTimer);releaseTimer=null;}
  if(dir==='left')activeButtons.delete('rightBtn');
  if(dir==='right')activeButtons.delete('leftBtn');
  if(dir==='forward')activeButtons.delete('backwardBtn');
  if(dir==='backward')activeButtons.delete('forwardBtn');
  activeButtons.set(id,dir);
  if(pointerId!==undefined)pointerButtons.set(pointerId,id);
  lastButtonPressAt=performance.now();
  syncButtons();updateDriveSpeed();sendMotion(true);
}
function releaseButton(id,pointerId){
  if(pointerId!==undefined)pointerButtons.delete(pointerId);
  if(!activeButtons.has(id))return;
  activeButtons.delete(id);
  if(activeButtons.size===0){
    const elapsed=performance.now()-lastButtonPressAt;
    if(elapsed<120){
      if(releaseTimer!==null)clearTimeout(releaseTimer);
      releaseTimer=setTimeout(()=>{releaseTimer=null;if(activeButtons.size===0){syncButtons();updateDriveSpeed();sendMotion(true);}},120-elapsed);
      return;
    }
  }
  syncButtons();updateDriveSpeed();sendMotion(true);
}
for(const [id,dir] of BUTTON_DIRS){
  const btn=$(id);if(!btn)continue;
  btn.onpointerdown=e=>{e.preventDefault();e.stopPropagation?.();pressButton(id,dir,e.pointerId);};
  for(const ev of ['pointerup','pointercancel','pointerleave'])btn.addEventListener(ev,e=>releaseButton(id,e.pointerId));
  btn.addEventListener('touchstart',e=>{e.preventDefault();pressButton(id,dir);},{passive:false});
  for(const ev of ['touchend','touchcancel'])btn.addEventListener(ev,e=>{e.preventDefault();releaseButton(id);},{passive:false});
}
window.addEventListener('pointerup',e=>{const id=pointerButtons.get(e.pointerId);if(id)releaseButton(id,e.pointerId);});
window.addEventListener('pointercancel',e=>{const id=pointerButtons.get(e.pointerId);if(id)releaseButton(id,e.pointerId);});
function position(e){const r=$('move').getBoundingClientRect(),radius=r.width*.30;let x=(e.clientX-r.left-r.width/2)/radius,y=(e.clientY-r.top-r.height/2)/radius;const d=Math.max(1,Math.hypot(x,y));move.x=x/d;move.y=y/d;const knob=$('move').querySelector('.knob');if(knob)knob.style.transform=`translate(calc(-50% + ${move.x*radius}px),calc(-50% + ${move.y*radius}px))`;updateDriveSpeed();sendMotion();}
$('move').onpointerdown=e=>{if(!armed||pointer!==null||activeButtons.size>0)return;e.preventDefault();pointer=e.pointerId;$('move').setPointerCapture(pointer);position(e);};
$('move').onpointermove=e=>{if(armed&&pointer===e.pointerId)position(e);};
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('move').addEventListener(event,e=>{if(pointer===e.pointerId)resetStick();});
$('full').onclick=async()=>{try{await document.documentElement.requestFullscreen?.();await screen.orientation?.lock?.('landscape');}catch{hint('Поверни телефон горизонтально.');}};
$('help').onclick=()=>{stop('Настройки открыты');$('instructions').showModal();};$('closeHelp').onclick=()=>{$('instructions').close();hint(device?.gatt?.connected?'Нажми «Продолжить», чтобы управлять.':'Нажми «Подключить и играть».');};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop('Страница скрыта, управление остановлено');});
window.addEventListener('pagehide',()=>{stop();device?.gatt?.disconnect();});window.addEventListener('blur',()=>stop('Управление остановлено'));
setInterval(()=>{
  if(!writer||writer.closed||document.hidden)return;
  const now=performance.now();
  if(!armed){if(programStarted&&!ready&&!writer.running&&now-lastProbe>1200){writer.submit('h\n');lastProbe=now;}return;}
  if(now-lastAck>2000){stop('Нет ответа хаба, управление остановлено');return;}
  sendMotion();
},80);
updateUI();
