import type { CardapioPublicado } from '@cardapio/aplicacao';
import { Redis } from 'ioredis';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { criarCacheDoCardapio, VALIDADE_DO_CARDAPIO_EM_SEGUNDOS } from './cache-do-cardapio.ts';

function cardapio(versao: number): CardapioPublicado {
  return {
    versao,
    restaurante: { nome: 'Brasa', slug: 'brasa', fusoHorario: 'America/Sao_Paulo' },
    personalizacao: {
      corMarca: '#B4441F',
      corSobreMarca: '#FFFFFF',
      corMarcaTexto: '#B4441F',
      logoUrl: null,
      capaUrl: null,
      frase: '',
      linkAvaliacaoGoogle: null,
      linkInstagram: null,
      textos: { boasVindas: '', aoChamarGarcom: '', restauranteFechado: '' },
    },
    horarios: [],
    secoes: [],
    destaques: [],
  };
}

describe('cache do cardápio no Redis', () => {
  let redis: Redis;

  beforeAll(async () => {
    redis = new Redis(inject('urlRedisDeTeste'));
    await redis.ping();
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('a chave leva o restaurante e a versão, com validade de 10 minutos', async () => {
    const restauranteId = uuidv7();
    const cache = criarCacheDoCardapio(redis);

    await cache.gravar(restauranteId, cardapio(3));

    expect(await cache.ler(restauranteId, 3)).toEqual(cardapio(3));
    expect(await cache.ler(restauranteId, 4)).toBeNull();
    expect(await cache.ler(uuidv7(), 3)).toBeNull();
    const chave = `r:${restauranteId}:cardapio:v3`;
    expect(await redis.ttl(chave)).toBeGreaterThan(VALIDADE_DO_CARDAPIO_EM_SEGUNDOS - 5);
  });

  it('com o Redis fora, lê como ausente e não grava, sem derrubar a leitura', async () => {
    const fora = new Redis('redis://127.0.0.1:1', { lazyConnect: true, maxRetriesPerRequest: 0 });
    const cache = criarCacheDoCardapio(fora);

    expect(await cache.ler(uuidv7(), 1)).toBeNull();
    await expect(cache.gravar(uuidv7(), cardapio(1))).resolves.toBeUndefined();
    fora.disconnect();
  });
});
