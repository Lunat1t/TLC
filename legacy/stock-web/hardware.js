export const PORTS = ['A','B','C','D','E','F'];
export const DEFAULT_HARDWARE = {left:'A',right:'D',kicker:'F',sensor:'E',leftSign:-1,rightSign:1,kickerSign:1};
export function validateHardware(config) {
  if (!config || typeof config !== 'object') throw new Error('Выбери порты моторов');
  if (!PORTS.includes(config.left)) throw new Error('Выбери мотор движения');
  if (config.right !== null && !PORTS.includes(config.right)) throw new Error('Неверный порт второго мотора');
  if (config.kicker !== null && !PORTS.includes(config.kicker)) throw new Error('Неверный порт кикера');
  if (config.kicker !== null && !PORTS.includes(config.sensor)) throw new Error('Выбери датчик цвета для кикера');
  const used = (config.kicker === null ? [config.left,config.right] : [config.left,config.right,config.kicker,config.sensor]).filter(Boolean);
  if (new Set(used).size !== used.length) throw new Error('Для каждого устройства нужен отдельный порт');
  for(const name of ['leftSign','rightSign','kickerSign']) if (![1,-1].includes(config[name])) throw new Error('Неверное направление мотора');
  return {...config,sensor:config.kicker === null ? null : config.sensor};
}
export function hardwareKey(config) {
  const c=validateHardware(config);
  return [c.left,c.right||'-',c.kicker||'-',c.sensor||'-',c.leftSign,c.rightSign,c.kicker === null ? 1 : c.kickerSign].join(',');
}
export function buildProgram(template, config) {
  const c=validateHardware(config);
  const replacements={LEFT:`port.${c.left}`,RIGHT:c.right ? `port.${c.right}`:'None',KICKER:c.kicker ? `port.${c.kicker}`:'None',SENSOR:c.sensor ? `port.${c.sensor}`:'None',LEFT_SIGN:c.leftSign,RIGHT_SIGN:c.rightSign,KICKER_SIGN:c.kickerSign,CONFIG_ID:JSON.stringify(hardwareKey(c))};
  for(const [key,value] of Object.entries(replacements)) {
    const regex=new RegExp(`^${key} = .+$`,'m');
    if (!regex.test(template)) throw new Error('Шаблон программы устарел. Обнови страницу.');
    template=template.replace(regex,`${key} = ${value}`);
  }
  return new TextEncoder().encode(template);
}
