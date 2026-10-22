import { publicarCaixaDeSaida, type FilaDeJobs } from '@cardapio/aplicacao';
import { esquemaMensagemTempoReal, type MensagemTempoReal } from '@cardapio/contratos';
import type { Redis } from 'ioredis';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import type { AcessoAoBanco } from '../../banco/banco.ts';
import { caixaSaida } from '../../banco/esquema/index.ts';
import { criarCaixaDeSaida } from '../../banco/filas/caixa-de-saida.ts';
import {
  abrirBanco,
  consultarComoAdmin,
  criarRelatorDeTeste,
  criarRestauranteDeTeste,
} from '../../banco/testes/apoio.ts';
import { criarRedis } from '../../redis/conexao-redis.ts';
import { criarPublicadorTempoReal } from '../publicador-tempo-real.ts';
import { criarTravaDistribuida } from '../trava.ts';
import { abrirRedisSimples, criarProxyTcp, esperarAte, urlRedisDeTeste } from './apoio-filas.ts';

const filasSemRota: FilaDeJobs = {
  enfileirar: () => Promise.reject(new Error('sem rota neste teste')),
};

interface Assinante {
  readonly recebidas: MensagemTempoReal[];
  distintas(): number;
}

async function assinar(redis: Redis, restaurantes: ReadonlySet<string>): Promise<Assinante> {
  const recebidas: MensagemTempoReal[] = [];
  redis.on('pmessage', (_padrao: string, _canal: string, texto: string) => {
    const mensagem = esquemaMensagemTempoReal.parse(JSON.parse(texto));
    if (restaurantes.has(mensagem.restaurante_id)) {
      recebidas.push(mensagem);
    }
  });
  await redis.psubscribe('r:*:tempo-real');
  return { recebidas, distintas: () => new Set(recebidas.map((mensagem) => mensagem.id)).size };
}

async function gravarEventos(banco: AcessoAoBanco, restauranteId: string, quantidade: number) {
  const ids: string[] = [];
  await banco.comRestaurante(restauranteId, async (transacao) => {
    for (let indice = 0; indice < quantidade; indice += 1) {
      const id = uuidv7();
      ids.push(id);
      await transacao.insert(caixaSaida).values({
        id,
        restauranteId,
        tipoEvento: 'SessaoMesaExpirada',
        carga: { versao: 1, sessaoMesaId: uuidv7(), mesaId: uuidv7() },
      });
    }
  });
  return ids;
}

async function pendentes(ids: readonly string[]): Promise<number> {
  const linhas = await consultarComoAdmin<{ total: string }>(
    'SELECT count(*) AS total FROM caixa_saida WHERE id = ANY($1::uuid[]) AND publicado_em IS NULL',
    [ids],
  );
  return Number(linhas[0]?.total);
}

describe('publicador da caixa de saída', () => {
  let api: AcessoAoBanco;
  let worker: AcessoAoBanco;
  let assinatura: Redis;
  let redis: Redis;

  beforeAll(() => {
    api = abrirBanco('api');
    worker = abrirBanco('worker');
    assinatura = abrirRedisSimples();
    redis = criarRedis(urlRedisDeTeste(), criarRelatorDeTeste());
  });

  afterAll(async () => {
    await Promise.all([api.encerrar(), worker.encerrar(), assinatura.quit(), redis.quit()]);
  });

  function publicador(banco: AcessoAoBanco, conexao: Redis = redis) {
    const relator = criarRelatorDeTeste();
    const dependencias = {
      caixaDeSaida: criarCaixaDeSaida(banco, relator),
      publicador: criarPublicadorTempoReal(conexao),
      filas: filasSemRota,
      roteamento: {},
    };
    return { relator, rodar: () => publicarCaixaDeSaida(dependencias) };
  }

  async function rodarAteEsvaziar(rodar: () => Promise<unknown>, ids: readonly string[]) {
    await esperarAte(async () => {
      await rodar();
      return (await pendentes(ids)) === 0;
    }, 30_000);
  }

  it('o evento gravado junto com o dado é publicado no canal do restaurante e marcado', async () => {
    const restaurante = await criarRestauranteDeTeste(api);
    const ouvinte = await assinar(assinatura, new Set([restaurante.id]));
    const ids = await gravarEventos(api, restaurante.id, 3);

    await rodarAteEsvaziar(publicador(worker).rodar, ids);
    await esperarAte(() => ouvinte.recebidas.length === 3);

    expect(ouvinte.recebidas.map((mensagem) => mensagem.id).sort()).toEqual([...ids].sort());
    expect(ouvinte.recebidas[0]).toMatchObject({ tipo: 'SessaoMesaExpirada', versao: 1 });
    expect(Object.keys(ouvinte.recebidas[0]?.dados ?? {}).sort()).toEqual(['mesaId', 'sessaoMesaId']);
  });

  it('dois publicadores simultâneos não publicam o mesmo evento duas vezes', async () => {
    const restaurante = await criarRestauranteDeTeste(api);
    const ouvinte = await assinar(assinatura, new Set([restaurante.id]));
    const ids = await gravarEventos(api, restaurante.id, 150);
    const outroWorker = abrirBanco('worker');
    const [primeiro, segundo] = [publicador(worker), publicador(outroWorker)];

    await rodarAteEsvaziar(() => Promise.all([primeiro.rodar(), segundo.rodar()]), ids);
    await esperarAte(() => ouvinte.recebidas.length >= 150);
    await outroWorker.encerrar();

    expect(ouvinte.recebidas).toHaveLength(150);
    expect(ouvinte.distintas()).toBe(150);
  });

  it('matar o publicador no meio não perde evento e não marca nada pela metade', async () => {
    const restaurante = await criarRestauranteDeTeste(api);
    const ouvinte = await assinar(assinatura, new Set([restaurante.id]));
    const ids = await gravarEventos(api, restaurante.id, 20);
    const nomeAplicacao = `teste-queda-${uuidv7().slice(-8)}`;
    const condenado = abrirBanco('worker', {
      sistema: { url: inject('bancoDeTeste').urlWorker, nomeAplicacao, maxConexoes: 1 },
    });
    let publicadas = 0;
    const publicadorReal = criarPublicadorTempoReal(redis);
    const queda = publicarCaixaDeSaida({
      caixaDeSaida: criarCaixaDeSaida(condenado, criarRelatorDeTeste()),
      filas: filasSemRota,
      roteamento: {},
      publicador: {
        async publicar(evento) {
          await publicadorReal.publicar(evento);
          publicadas += 1;
          if (publicadas === 5) {
            await consultarComoAdmin(
              'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = $1',
              [nomeAplicacao],
            );
            throw new Error('processo morto no meio do lote');
          }
        },
      },
    });

    await expect(queda).rejects.toThrow();
    await condenado.encerrar();
    expect(await pendentes(ids)).toBe(20);

    await rodarAteEsvaziar(publicador(worker).rodar, ids);
    await esperarAte(() => ouvinte.distintas() === 20);

    expect(ouvinte.distintas()).toBe(20);
    expect(ouvinte.recebidas.length - ouvinte.distintas()).toBeLessThanOrEqual(5);
  });

  it('com o Redis parado a API grava, nada é marcado, e ao voltar os eventos saem', async () => {
    const proxy = await criarProxyTcp(urlRedisDeTeste());
    const viaProxy = criarRedis(proxy.url, criarRelatorDeTeste());
    await esperarAte(() => viaProxy.status === 'ready');
    const restaurante = await criarRestauranteDeTeste(api);
    const ouvinte = await assinar(assinatura, new Set([restaurante.id]));
    const { rodar, relator } = publicador(worker, viaProxy);

    await proxy.derrubar();
    const ids = await gravarEventos(api, restaurante.id, 10);
    await rodar();
    await rodar();

    expect(await pendentes(ids)).toBe(10);
    expect(ouvinte.recebidas).toHaveLength(0);
    const tentativas = await consultarComoAdmin<{ tentativas: number }>(
      'SELECT tentativas FROM caixa_saida WHERE id = ANY($1::uuid[]) ORDER BY criado_em, id',
      [ids],
    );
    expect(tentativas.map((linha) => linha.tentativas)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(relator.reportados).toHaveLength(0);

    await proxy.religar();
    await esperarAte(() => viaProxy.status === 'ready', 20_000);
    await rodarAteEsvaziar(rodar, ids);
    await esperarAte(() => ouvinte.distintas() === 10);
    await viaProxy.quit();
    await proxy.derrubar();

    expect(ouvinte.distintas()).toBe(10);
  });

  it('carga: 500 eventos de 50 restaurantes, sem perda e sem duplicata', { timeout: 60_000 }, async () => {
    const restaurantes = [];
    for (let indice = 0; indice < 50; indice += 1) {
      restaurantes.push(await criarRestauranteDeTeste(api));
    }
    const ouvinte = await assinar(assinatura, new Set(restaurantes.map((restaurante) => restaurante.id)));
    const ids = (
      await Promise.all(restaurantes.map((restaurante) => gravarEventos(api, restaurante.id, 10)))
    ).flat();
    const outroWorker = abrirBanco('worker');
    const [primeiro, segundo] = [publicador(worker), publicador(outroWorker)];

    await rodarAteEsvaziar(() => Promise.all([primeiro.rodar(), segundo.rodar()]), ids);
    await esperarAte(() => ouvinte.recebidas.length >= 500);
    await outroWorker.encerrar();

    expect(ids).toHaveLength(500);
    expect(ouvinte.recebidas).toHaveLength(500);
    expect(ouvinte.distintas()).toBe(500);
    const porRestaurante = new Map<string, number>();
    for (const mensagem of ouvinte.recebidas) {
      porRestaurante.set(mensagem.restaurante_id, (porRestaurante.get(mensagem.restaurante_id) ?? 0) + 1);
    }
    expect([...porRestaurante.values()].every((total) => total === 10)).toBe(true);
  });
});

describe('trava distribuída', () => {
  it('só uma instância ativa por vez, e a trava é liberada no fim', async () => {
    const redis = abrirRedisSimples();
    const trava = criarTravaDistribuida(redis);
    const nome = `teste-${uuidv7().slice(-12)}`;
    let liberar: () => void = () => undefined;
    const bloqueio = new Promise<void>((resolver) => {
      liberar = resolver;
    });

    const primeira = trava.comTrava(nome, 5000, () => bloqueio.then(() => 'primeira'));
    const segunda = await trava.comTrava(nome, 5000, () => Promise.resolve('segunda'));
    liberar();

    expect(segunda).toBe('ocupada');
    expect(await primeira).toBe('primeira');
    expect(await trava.comTrava(nome, 5000, () => Promise.resolve('terceira'))).toBe('terceira');
    await redis.quit();
  });
});
