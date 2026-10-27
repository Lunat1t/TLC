import sys, asyncio
sys.path.insert(0, '/tmp/socer-ble-diagnostic')
from bleak import BleakScanner, BleakClient
SERVICE='0000fd02-0000-1000-8000-00805f9b34fb'
RX='0000fd02-0001-1000-8000-00805f9b34fb'
TX='0000fd02-0002-1000-8000-00805f9b34fb'
async def main():
    found=await BleakScanner.discover(timeout=7, return_adv=True)
    hubs=[d for d,a in found.values() if SERVICE in [s.lower() for s in a.service_uuids]]
    print('Обнаружено штатных SPIKE-хабов:',len(hubs))
    if len(hubs)!=1:return
    packets=[];event=asyncio.Event()
    def receive(sender,data):
        packets.append(bytes(data));print('RX:',bytes(data).hex(' '));event.set()
    async with BleakClient(hubs[0],timeout=12) as client:
        print('GATT подключён через Linux/BlueZ')
        await client.start_notify(TX,receive)
        await client.write_gatt_char(RX,b'\x00\x00\x02',response=False)
        print('Отправлен только InfoRequest: 00 00 02')
        try:await asyncio.wait_for(event.wait(),5)
        except TimeoutError:print('Нет уведомлений за 5 секунд')
        print('Получено пакетов:',len(packets))
        await client.stop_notify(TX)
try:asyncio.run(main())
except Exception as e:print(type(e).__name__+': '+str(e))
