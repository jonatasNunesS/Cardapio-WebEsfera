import type { AssinanteTempoReal, AvisoTempoReal } from '@cardapio/aplicacao';
import { Redis } from 'ioredis';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { criarRelatorDeTeste } from '../banco/testes/apoio.ts';
import { chavesRedis } from '../redis/chaves-redis.ts';
import { criarAssinanteRedis } from './assinante-redis.ts';

const NOME = `tempo-real-teste-${String(process.pid)}`;
let admin: Redis;
let assinante: AssinanteTempoReal;
const relator = criarRelatorDeTeste();

function mensagem(restauranteId: string, tipo = 'PedidoCriado') {
  return JSON.stringify({
    id: uuidv7(),
    tipo,
    restaurante_id: restauranteId,
    ocorrido_em: new Date().toISOString(),
    versao: 1,
    dados: { pedidoId: uuidv7() },
  });
}

function ouvinte() {
  const recebidos: AvisoTempoReal[] = [];
  const aoCair = vi.fn<() => void>();
  return {
    recebidos,
    aoCair,
    ouvinte: { aoReceber: (aviso: AvisoTempoReal) => recebidos.push(aviso), aoCair },
  };
}

const pronto = (redis: AssinanteTempoReal, restauranteId: string) =>
  vi.waitFor(() => redis.assinar(restauranteId, { aoReceber: () => undefined, aoCair: () => undefined }), {
    timeout: 2000,
    interval: 20,
  });

beforeAll(async () => {
  admin = new Redis(inject('urlRedisDeTeste'));
  assinante = criarAssinanteRedis(inject('urlRedisDeTeste'), relator, NOME);
  (await pronto(assinante, uuidv7()))();
});

afterAll(async () => {
  await assinante.encerrar();
  admin.disconnect();
});

const esperar = () => new Promise((resolver) => setTimeout(resolver, 50));

describe('assinante de tempo real no Redis', () => {
  it('A recebe só os avisos de A, nunca os de B', async () => {
    const [a, b] = [uuidv7(), uuidv7()];
    const deA = ouvinte();
    const cancelar = await assinante.assinar(a, deA.ouvinte);

    await admin.publish(chavesRedis.tempoReal(b), mensagem(b));
    await admin.publish(chavesRedis.tempoReal(a), mensagem(a));
    await esperar();

    expect(deA.recebidos.map((aviso) => aviso.restauranteId)).toEqual([a]);
    cancelar();
  });

  it('descarta mensagem cujo restaurante não é o do canal, e mensagem fora do contrato', async () => {
    const [a, b] = [uuidv7(), uuidv7()];
    const deA = ouvinte();
    const cancelar = await assinante.assinar(a, deA.ouvinte);

    await admin.publish(chavesRedis.tempoReal(a), mensagem(b));
    await admin.publish(chavesRedis.tempoReal(a), '{nao e json');
    await esperar();

    expect(deA.recebidos).toEqual([]);
    expect(relator.reportados.length).toBeGreaterThanOrEqual(2);
    cancelar();
  });

  it('dois ouvintes do mesmo restaurante: cancelar um mantém o outro', async () => {
    const a = uuidv7();
    const [primeiro, segundo] = [ouvinte(), ouvinte()];
    const cancelarPrimeiro = await assinante.assinar(a, primeiro.ouvinte);
    const cancelarSegundo = await assinante.assinar(a, segundo.ouvinte);
    cancelarPrimeiro();

    await admin.publish(chavesRedis.tempoReal(a), mensagem(a));
    await esperar();

    expect(primeiro.recebidos).toHaveLength(0);
    expect(segundo.recebidos).toHaveLength(1);
    cancelarSegundo();
  });

  it('quando a conexão com o Redis cai, todo ouvinte é avisado para reconectar e reconsultar', async () => {
    const a = uuidv7();
    const deA = ouvinte();
    await assinante.assinar(a, deA.ouvinte);

    const clientes = String(await admin.client('LIST'));
    const id = /^id=(\d+) .*? name=(\S*)/gm;
    for (const [, numero, nome] of clientes.matchAll(id)) {
      if (nome === NOME && numero !== undefined) {
        await admin.client('KILL', 'ID', numero);
      }
    }
    await vi.waitFor(() => {
      expect(deA.aoCair).toHaveBeenCalledOnce();
    });
    const depois = await pronto(assinante, a);
    depois();
  });
});
