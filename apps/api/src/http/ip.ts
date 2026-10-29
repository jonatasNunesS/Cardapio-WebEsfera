import { isIPv4, isIPv6 } from 'node:net';

function gruposDoIpv6(ip: string): string[] {
  const [inicio = '', fim] = ip.split('::');
  const antes = inicio === '' ? [] : inicio.split(':');
  const depois = fim === undefined || fim === '' ? [] : fim.split(':');
  const zeros = Array.from({ length: Math.max(0, 8 - antes.length - depois.length) }, () => '0');
  return [...antes, ...zeros, ...depois];
}

export function mascararIp(ip: string): string {
  const v4Mapeado = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1] ?? ip;
  if (isIPv4(v4Mapeado)) {
    return `${v4Mapeado.split('.').slice(0, 3).join('.')}.0`;
  }
  if (isIPv6(ip)) {
    return `${gruposDoIpv6(ip).slice(0, 3).join(':')}::`;
  }
  return 'desconhecido';
}
