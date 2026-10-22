import { CASOS_DE_RAZAO } from '@cardapio/contratos';
import { describe, expect, it } from 'vitest';
import { razaoDeContraste } from './contraste.ts';

describe('contraste do ui (mesmos vetores do servidor)', () => {
  it.each(CASOS_DE_RAZAO)('$frente sobre $fundo dá $razao:1', ({ frente, fundo, razao }) => {
    expect(Math.round(razaoDeContraste(frente, fundo) * 100) / 100).toBe(razao);
  });
});
