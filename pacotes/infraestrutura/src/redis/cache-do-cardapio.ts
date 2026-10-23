import type { CacheDoCardapio, CardapioPublicado } from '@cardapio/aplicacao';
import type { Redis } from 'ioredis';
import { chavesRedis } from './chaves-redis.ts';

export const VALIDADE_DO_CARDAPIO_EM_SEGUNDOS = 600;

export function criarCacheDoCardapio(redis: Redis): CacheDoCardapio {
  return {
    async ler(restauranteId, versao) {
      if (redis.status !== 'ready') {
        return null;
      }
      const texto = await redis.get(chavesRedis.cardapio(restauranteId, versao));
      return texto === null ? null : (JSON.parse(texto) as CardapioPublicado);
    },
    async gravar(restauranteId, cardapio) {
      if (redis.status !== 'ready') {
        return;
      }
      await redis.set(
        chavesRedis.cardapio(restauranteId, cardapio.versao),
        JSON.stringify(cardapio),
        'EX',
        VALIDADE_DO_CARDAPIO_EM_SEGUNDOS,
      );
    },
  };
}
