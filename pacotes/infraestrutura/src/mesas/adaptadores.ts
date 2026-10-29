import type {
  ContadorDeTentativasInvalidas,
  GeradorDeCodigoDeMesa,
  LimiteDeMesas,
} from '@cardapio/aplicacao';
import { LIMITE_MESAS_TESTE, LIMITES_DA_MESA } from '@cardapio/dominio';
import type { Redis } from 'ioredis';
import { createHash, randomBytes } from 'node:crypto';
import { chavesRedis } from '../redis/chaves-redis.ts';

export const JANELA_DAS_TENTATIVAS_S = 15 * 60;

export const geradorDeCodigoDeMesa: GeradorDeCodigoDeMesa = {
  gerar: () => randomBytes(LIMITES_DA_MESA.bytesDoCodigo).toString('base64url'),
};

// Sem assinatura ainda (M10), todo restaurante usa o limite do período de teste: docs/adr/0012-mesas-e-qr.md
export const limiteDeMesasDoTeste: LimiteDeMesas = { limite: () => Promise.resolve(LIMITE_MESAS_TESTE) };

export function criarContadorDeTentativas(redis: Redis): ContadorDeTentativasInvalidas {
  return {
    async registrar(origem) {
      const chave = chavesRedis.limite(
        'qr_invalido',
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
