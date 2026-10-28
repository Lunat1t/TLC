export const PORTS=['A','B','C','D','E','F'];
export function validateHardware(c){
  if(!c||!PORTS.includes(c.left)||c.right!==null&&!PORTS.includes(c.right)||c.kicker!==null&&!PORTS.includes(c.kicker))throw new Error('Выбери порты моторов');
  const used=[c.left,c.right,c.kicker].filter(Boolean);
  if(new Set(used).size!==used.length)throw new Error('Устройства должны быть на разных портах');
  for(const field of ['leftSign','rightSign','kickerSign'])if(![1,-1].includes(c[field]))throw new Error('Неверное направление мотора');
  return c;
}
export function configId(c){validateHardware(c);return [c.left,c.right||'-',c.kicker||'-',c.leftSign,c.rightSign,c.kickerSign].join(',');}
export function buildProgram(source,c){
  validateHardware(c);
  const values={LEFT_PORT:'Port.'+c.left,RIGHT_PORT:c.right?'Port.'+c.right:'None',KICKER_PORT:c.kicker?'Port.'+c.kicker:'None',LEFT_SIGN:c.leftSign,RIGHT_SIGN:c.rightSign,KICKER_SIGN:c.kickerSign,CONFIG_ID:JSON.stringify(configId(c))};
  for(const [key,value] of Object.entries(values)){
    const pattern=new RegExp('^'+key+' = .+$','m');
    if(!pattern.test(source))throw new Error('Шаблон программы повреждён');
    source=source.replace(pattern,key+' = '+value);
  }
  return source;
}
