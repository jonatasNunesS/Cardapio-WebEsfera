import { describe, expect, it } from 'vitest';
import { contarCaracteres } from './texto.ts';

describe('contarCaracteres', () => {
  it('conta o que a pessoa vê como caractere', () => {
    expect(contarCaracteres('abc')).toBe(3);
    expect(contarCaracteres('ação')).toBe(4);
    expect(contarCaracteres('á')).toBe(1);
    expect(contarCaracteres('')).toBe(0);
  });
});
