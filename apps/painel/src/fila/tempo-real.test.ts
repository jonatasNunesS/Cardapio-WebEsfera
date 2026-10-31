import { describe, expect, it } from 'vitest';
import { esperaDaTentativa } from './tempo-real.ts';

describe('reconexão do tempo real do painel', () => {
  it('espera dobra a cada tentativa e para em 30 s', () => {
    expect([0, 1, 2, 3, 10].map(esperaDaTentativa)).toEqual([1000, 2000, 4000, 8000, 30_000]);
  });
});
