import { describe, expect, it } from 'vitest';
import { termosDeBusca } from './busca.ts';

describe('termos de busca', () => {
  it.each([
    ['Abóbora', ['abobora']],
    ['  COSTELA   na brasa ', ['costela', 'na', 'brasa']],
    ['pão & queijo:*', ['pao', 'queijo']],
    ["'; DROP TABLE pratos; --", ['drop', 'table', 'pratos']],
    ['', []],
    ['!!!', []],
    ['a a a', ['a']],
  ])('%s vira %o, só letras e dígitos sem acento', (texto, esperado) => {
    expect(termosDeBusca(texto)).toEqual(esperado);
  });

  it('limita a quantidade e o tamanho dos termos', () => {
    expect(termosDeBusca('um dois tres quatro cinco seis sete oito')).toHaveLength(6);
    expect(termosDeBusca('x'.repeat(100))[0]).toHaveLength(40);
  });
});
