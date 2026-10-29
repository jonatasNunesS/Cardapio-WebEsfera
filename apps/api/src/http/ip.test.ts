import { describe, expect, it } from 'vitest';
import { mascararIp } from './ip.ts';

describe('mascararIp', () => {
  it.each([
    ['203.0.113.77', '203.0.113.0'],
    ['::ffff:198.51.100.9', '198.51.100.0'],
    ['2001:db8:abcd:12::1', '2001:db8:abcd::'],
    ['2001:db8::1', '2001:db8:0::'],
    ['::1', '0:0:0::'],
    ['nao-e-ip', 'desconhecido'],
  ])('%s vira %s', (ip, mascarado) => {
    expect(mascararIp(ip)).toBe(mascarado);
  });
});
