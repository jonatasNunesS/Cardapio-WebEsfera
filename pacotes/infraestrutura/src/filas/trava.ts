import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { chavesRedis } from '../redis/chaves-redis.ts';

const SCRIPT_LIBERAR = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export interface TravaDistribuida {
  comTrava<T>(nome: string, duracaoMs: number, executar: () => Promise<T>): Promise<T | 'ocupada'>;
}

export function criarTravaDistribuida(redis: Redis): TravaDistribuida {
  return {
    async comTrava(nome, duracaoMs, executar) {
      const chave = chavesRedis.trava(nome);
      const dono = randomUUID();
      if ((await redis.set(chave, dono, 'PX', duracaoMs, 'NX')) !== 'OK') {
        return 'ocupada';
      }
      try {
        return await executar();
      } finally {
        await redis.eval(SCRIPT_LIBERAR, 1, chave, dono);
      }
    },
  };
}
