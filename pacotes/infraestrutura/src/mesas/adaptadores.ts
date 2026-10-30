import type { ContadorDeTentativasInvalidas, GeradorDeCodigoDeMesa } from '@cardapio/aplicacao';
import { LIMITES_DA_MESA } from '@cardapio/dominio';
import type { Redis } from 'ioredis';
import { createHash, randomBytes } from 'node:crypto';
import { chavesRedis } from '../redis/chaves-redis.ts';

export const JANELA_DAS_TENTATIVAS_S = 15 * 60;

export const geradorDeCodigoDeMesa: GeradorDeCodigoDeMesa = {
  gerar: () => randomBytes(LIMITES_DA_MESA.bytesDoCodigo).toString('base64url'),
};

export function criarContadorDeTentativas(
  redis: Redis,
  espaco = 'qr_invalido',
): ContadorDeTentativasInvalidas {
  return {
    async registrar(origem) {
      const chave = chavesRedis.limite(
        espaco,
        createHash('sha256').update(origem).digest('hex').slice(0, 32),
      );
      const [[, total]] = (await redis
        .multi()
        .incr(chave)
        .expire(chave, JANELA_DAS_TENTATIVAS_S, 'NX')
        .exec()) as [[Error | null, number]];
      return total;
    },
  };
}
