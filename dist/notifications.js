// Some Web Bluetooth bridges replace their event context while enabling notifications.
// Reattaching the SAME callback after setup is idempotent for standard EventTargets.
export async function subscribeNotifications(characteristic,handler) {
  characteristic.addEventListener('characteristicvaluechanged',handler);
  try {
    const result=await characteristic.startNotifications();
    const active=result && typeof result.addEventListener==='function' ? result : characteristic;
    if(active !== characteristic)characteristic.removeEventListener?.('characteristicvaluechanged',handler);
    active.addEventListener('characteristicvaluechanged',handler);
    return active;
  } catch(error) {
    characteristic.removeEventListener?.('characteristicvaluechanged',handler);
    throw error;
  }
}
