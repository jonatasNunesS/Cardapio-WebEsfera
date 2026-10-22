import { CODIGOS } from '@cardapio/aplicacao';
import { describe, expect, it } from 'vitest';
import { chavesRedis } from './chaves-redis.ts';

const RESTAURANTE = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

describe('chavesRedis', () => {
  it('monta as chaves do plano sempre com o id do restaurante', () => {
    expect(chavesRedis.cardapio(RESTAURANTE, 3)).toBe(`r:${RESTAURANTE}:cardapio:v3`);
    expect(chavesRedis.personalizacao(RESTAURANTE)).toBe(`r:${RESTAURANTE}:personalizacao`);
    expect(chavesRedis.assinatura(RESTAURANTE)).toBe(`r:${RESTAURANTE}:assinatura`);
    expect(chavesRedis.mesaPorCodigo('Abcdefghijklmnopqrstuv')).toBe('qr:Abcdefghijklmnopqrstuv');
    expect(chavesRedis.limite('mesa', 'abc-123')).toBe('limite:mesa:abc-123');
    expect(chavesRedis.tempoReal(RESTAURANTE)).toBe(`r:${RESTAURANTE}:tempo-real`);
    expect(chavesRedis.trava('publicar-caixa-saida')).toBe('trava:publicar-caixa-saida');
  });

  it.each([
    () => chavesRedis.cardapio('nao-e-uuid', 1),
    () => chavesRedis.cardapio(RESTAURANTE, -1),
    () => chavesRedis.personalizacao('*'),
    () => chavesRedis.mesaPorCodigo('curto'),
    () => chavesRedis.limite('mesa', 'a:b'),
    () => chavesRedis.tempoReal('*'),
    () => chavesRedis.trava('a:b'),
  ])('recusa valores que poderiam atravessar o espaço de outro restaurante (%#)', (montar) => {
    expect(montar).toThrow(expect.objectContaining({ codigo: CODIGOS.REDIS_CHAVE_INVALIDA }));
  });
});
