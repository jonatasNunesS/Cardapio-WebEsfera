import type { Redis } from 'ioredis';
import { chavesRedis } from '../redis/chaves-redis.ts';
import type { LimitePorRestaurante } from './registro.ts';

const MINUTO_EM_MS = 60_000;

const SCRIPT_GCRA = `
local intervalo = tonumber(ARGV[1])
local tolerancia = tonumber(ARGV[2])
local relogio = redis.call('TIME')
local agora = tonumber(relogio[1]) * 1000 + math.floor(tonumber(relogio[2]) / 1000)
local tat = tonumber(redis.call('GET', KEYS[1]) or agora)
if tat < agora then tat = agora end
local atraso = tat - tolerancia - agora
if atraso < 0 then atraso = 0 end
local novo = tat + intervalo
redis.call('SET', KEYS[1], novo, 'PX', novo - agora)
return atraso
`;

export interface LimitadorPorRestaurante {
  atrasoMs(nomeDoJob: string, restauranteId: string, limite: LimitePorRestaurante): Promise<number>;
}

export function criarLimitadorPorRestaurante(redis: Redis): LimitadorPorRestaurante {
  return {
    async atrasoMs(nomeDoJob, restauranteId, limite) {
      const intervalo = Math.ceil(MINUTO_EM_MS / limite.porMinuto);
      const tolerancia = intervalo * (limite.rajada - 1);
      const chave = chavesRedis.limite(`jobs_${nomeDoJob}`, restauranteId);
      const atraso = await redis.eval(SCRIPT_GCRA, 1, chave, intervalo, tolerancia);
      return Number(atraso);
    },
  };
}
