import { describe, expect, it } from 'vitest';
import { formatarReais } from './dinheiro.ts';

describe('formatarReais', () => {
  it('formata centavos em reais no padrão brasileiro', () => {
    expect(formatarReais(8900).replace(/\s/u, ' ')).toBe('R$ 89,00');
    expect(formatarReais(12430).replace(/\s/u, ' ')).toBe('R$ 124,30');
  });
});
