import type { RelatorDeErros } from '@cardapio/aplicacao';
import type { Redis } from 'ioredis';
import { criarRedis } from '../redis/conexao-redis.ts';

export async function fecharRedis(redis: Redis): Promise<void> {
  if (redis.status === 'ready') {
    await redis.quit();
    return;
  }
  redis.disconnect();
}

export interface ConexoesDeFila {
  readonly produtora: Redis;
  readonly consumidora: Redis;
  encerrar(): Promise<void>;
}

export function criarConexoesDeFila(url: string, relator: RelatorDeErros): ConexoesDeFila {
  const produtora = criarRedis(url, relator, {
    connectionName: 'filas-produtora',
    enableOfflineQueue: false,
  });
  const consumidora = criarRedis(url, relator, {
    connectionName: 'filas-consumidora',
    connectTimeout: 2000,
    maxRetriesPerRequest: null,
  });
  return {
    produtora,
    consumidora,
    async encerrar() {
      await Promise.all([fecharRedis(produtora), fecharRedis(consumidora)]);
    },
  };
}
