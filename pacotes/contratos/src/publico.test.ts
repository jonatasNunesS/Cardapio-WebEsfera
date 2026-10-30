import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { gerarUuidV7 } from './publico.ts';

const randomBytes = (tamanho: number) =>
  Uint8Array.from({ length: tamanho }, () => Math.floor(Math.random() * 256));

describe('gerarUuidV7', () => {
  it('segue a RFC 9562: versão 7, variante 10 e os 48 bits do horário em milissegundos', () => {
    const id = gerarUuidV7(0x0190a1b2c3d4, new Uint8Array(10).fill(0xff));

    expect(id).toBe('0190a1b2-c3d4-7fff-bfff-ffffffffffff');
    expect(z.uuid({ version: 'v7' }).safeParse(id).success).toBe(true);
  });

  it('ids gerados em sequência são únicos e ordenam pelo tempo', () => {
    const ids = [
      gerarUuidV7(1_000, randomBytes(10)),
      gerarUuidV7(2_000, randomBytes(10)),
      gerarUuidV7(3_000, randomBytes(10)),
    ];
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(Array.from({ length: 1000 }, () => gerarUuidV7(Date.now(), randomBytes(10)))).size).toBe(
      1000,
    );
  });
});
