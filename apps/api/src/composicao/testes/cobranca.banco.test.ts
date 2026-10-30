import {
  CABECALHO_IDEMPOTENCIA,
  ROTAS_DA_COBRANCA as ROTAS,
  type RespostaCheckout,
  type RespostaPlanoECobranca,
} from '@cardapio/contratos';
import {
  assinarAviso,
  criarFila,
  criarMercadoPagoFalso,
  criarRedis,
  type MercadoPagoFalso,
} from '@cardapio/infraestrutura';
import {
  consultarComUrl,
  VARIAVEIS_DO_ARMAZENAMENTO_DE_TESTE,
  VARIAVEIS_DO_MERCADO_PAGO_DE_TESTE,
} from '@cardapio/infraestrutura/testes';
import type { FastifyInstance } from 'fastify';
import { randomBytes, randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { esquemaAmbienteApi } from '../../ambiente.ts';
import { comporApi } from '../index.ts';
import { donoComRestaurante } from './navegador.ts';

const HOSTS = { painel: 'painel.localhost', cardapio: 'cardapio.localhost' };
const SEGREDO = VARIAVEIS_DO_MERCADO_PAGO_DE_TESTE.MP_WEBHOOK_SECRET;
const TOKEN = VARIAVEIS_DO_MERCADO_PAGO_DE_TESTE.MP_ACCESS_TOKEN;
const relatorMudo = { reportar: () => randomUUID(), registrarPasso: () => undefined };

function ambiente(mudancas: Record<string, string> = {}) {
  return esquemaAmbienteApi.parse({
    NODE_ENV: 'test',
    APP_ENV: 'local',
    PORTA_API: '3000',
    URL_BANCO_API: inject('bancoDeTeste').urlApi,
    URL_REDIS: inject('urlRedisDeTeste'),
    DOMINIO_CARDAPIO: HOSTS.cardapio,
    DOMINIO_PAINEL: HOSTS.painel,
    DOMINIO_ADMIN: 'admin.localhost',
    URL_PAINEL: 'http://painel.localhost:5173',
    CHAVE_CIFRA_TOTP: Buffer.alloc(32, 7).toString('base64'),
    CHAVE_SESSAO_MESA: 'mesa-teste-mesa-teste-mesa-teste-mesa',
    ...VARIAVEIS_DO_ARMAZENAMENTO_DE_TESTE,
    ...VARIAVEIS_DO_MERCADO_PAGO_DE_TESTE,
    ...mudancas,
  });
}

function comoAdmin<T extends Record<string, unknown>>(texto: string, valores: unknown[] = []) {
  return consultarComUrl<T>(inject('bancoDeTeste').urlAdmin, texto, valores);
}

interface Aviso {
  readonly dataId: string;
  readonly assinadoComo?: string;
  readonly assinatura?: string;
  readonly xRequestId?: string;
}

function enviarAviso(servidor: FastifyInstance, aviso: Aviso) {
  const xRequestId = aviso.xRequestId ?? randomUUID();
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = assinarAviso(SEGREDO, aviso.assinadoComo ?? aviso.dataId, xRequestId, ts);
  return servidor.inject({
    method: 'POST',
    url: `${ROTAS.aviso}?data.id=${aviso.dataId}&type=subscription_preapproval`,
    remoteAddress: '203.0.113.7',
    headers: {
      host: HOSTS.painel,
      'content-type': 'application/json',
      'x-request-id': xRequestId,
      'x-signature': aviso.assinatura ?? `ts=${ts},v1=${v1}`,
    },
    payload: {
      action: 'updated',
      type: 'subscription_preapproval',
      data: { id: aviso.dataId },
      payer_email: 'x@y.com',
    },
  });
}

const eventosCom = (recursoId: string) =>
  comoAdmin<{ id: string; recurso_id: string }>(
    'SELECT id, recurso_id FROM eventos_pagamento WHERE recurso_id = $1',
    [recursoId],
  );

describe('cobrança pela API', () => {
  let falso: MercadoPagoFalso;
  let servidor: FastifyInstance;
  const linhasDoLog: string[] = [];

  beforeAll(async () => {
    falso = criarMercadoPagoFalso({ tokenDeAcesso: TOKEN, segredoDoWebhook: SEGREDO });
    const url = await falso.ouvir();
    const destinoDoLog = new Writable({
      write(pedaco: Buffer, _codificacao, pronto) {
        linhasDoLog.push(pedaco.toString('utf8'));
        pronto();
      },
    });
    servidor = comporApi(ambiente({ URL_MERCADO_PAGO: url }), { destinoDoLog });
    await servidor.ready();
  });

  afterAll(async () => {
    await servidor.close();
    await falso.encerrar();
  });

  it('o dono vê o teste e os planos, assina com Idempotency-Key e recebe o link do Mercado Pago', async () => {
    const { navegador } = await donoComRestaurante(servidor, HOSTS.painel, 'Cobrança API');
    const antes = (await navegador.pedir('GET', ROTAS.plano)).json<RespostaPlanoECobranca>();
    const semChave = await navegador.pedir('POST', ROTAS.assinatura, {
      codigoDoPlano: 'basico',
      emailDoPagador: 'pagador@exemplo.com.br',
    });
    const resposta = await servidor.inject({
      method: 'POST',
      url: ROTAS.assinatura,
      remoteAddress: navegador.ip,
      headers: {
        host: HOSTS.painel,
        cookie: [...navegador.cookies].map(([nome, valor]) => `${nome}=${valor}`).join('; '),
        'x-csrf-token': navegador.csrf,
        [CABECALHO_IDEMPOTENCIA]: randomUUID(),
      },
      payload: { codigoDoPlano: 'basico', emailDoPagador: 'pagador@exemplo.com.br' },
    });
    const depois = (await navegador.pedir('GET', ROTAS.plano)).json<RespostaPlanoECobranca>();

    expect(antes).toMatchObject({
      situacao: 'teste',
      podeAssinar: true,
      assinatura: null,
      diaDaInadimplencia: 15,
    });
    expect(antes.planos.map((plano) => [plano.codigo, plano.limiteMesas, plano.precoCentavos])).toEqual([
      ['basico', 10, 9900],
      ['pro', 30, 14900],
    ]);
    expect(semChave.statusCode).toBe(400);
    expect(resposta.statusCode).toBe(201);
    const { linkDePagamento } = resposta.json<RespostaCheckout>();
    expect(linkDePagamento).toMatch(/^https:\/\/www\.mercadopago\.com\.br\//);
    expect(depois.assinatura).toMatchObject({
      codigoDoPlano: 'basico',
      situacao: 'pendente',
      linkDePagamento,
    });
  });

  it('o corpo não escolhe o restaurante: campo a mais é recusado', async () => {
    const { navegador } = await donoComRestaurante(servidor, HOSTS.painel, 'Cobrança intruso');
    const resposta = await servidor.inject({
      method: 'POST',
      url: ROTAS.assinatura,
      remoteAddress: navegador.ip,
      headers: {
        host: HOSTS.painel,
        cookie: [...navegador.cookies].map(([nome, valor]) => `${nome}=${valor}`).join('; '),
        'x-csrf-token': navegador.csrf,
        [CABECALHO_IDEMPOTENCIA]: randomUUID(),
      },
      payload: { codigoDoPlano: 'basico', emailDoPagador: 'a@b.com.br', restauranteId: randomUUID() },
    });

    expect(resposta.statusCode).toBe(400);
  });

  it('aviso assinado: grava, enfileira e responde 200 em menos de 1 s', async () => {
    const recurso = randomBytes(8).toString('hex');
    const inicio = performance.now();
    const resposta = await enviarAviso(servidor, { dataId: recurso });
    const duracao = performance.now() - inicio;
    const [evento] = await eventosCom(recurso);
    const conexao = criarRedis(inject('urlRedisDeTeste'), relatorMudo);
    const fila = criarFila('pagamentos', { conexao, relator: relatorMudo });
    const job = await fila.getJob(`evento-${evento?.id ?? ''}`);
    await fila.close();
    conexao.disconnect();

    expect(resposta.statusCode).toBe(200);
    expect(duracao).toBeLessThan(1000);
    expect(job?.name).toBe('processar-evento-pagamento');
  });

  it('data.id em maiúsculas é normalizado antes de conferir a assinatura', async () => {
    const recurso = randomBytes(8).toString('hex');
    const resposta = await enviarAviso(servidor, { dataId: recurso.toUpperCase(), assinadoComo: recurso });

    expect(resposta.statusCode).toBe(200);
    expect((await eventosCom(recurso)).map((evento) => evento.recurso_id)).toEqual([recurso]);
  });

  it('o mesmo x-request-id grava um evento só', async () => {
    const recurso = randomBytes(8).toString('hex');
    const xRequestId = randomUUID();
    await enviarAviso(servidor, { dataId: recurso, xRequestId });
    await enviarAviso(servidor, { dataId: recurso, xRequestId });

    expect(await eventosCom(recurso)).toHaveLength(1);
  });

  it.each([
    ['assinatura errada', `ts=1730000000,v1=${'0'.repeat(64)}`],
    ['sem ts', `v1=${'a'.repeat(64)}`],
    ['sem v1', 'ts=1730000000'],
    ['sem cabeçalho', ''],
  ])('%s: 401 e nada gravado', async (_caso, assinatura) => {
    const recurso = randomBytes(8).toString('hex');
    const resposta = await enviarAviso(servidor, { dataId: recurso, assinatura });

    expect(resposta.statusCode).toBe(401);
    expect(await eventosCom(recurso)).toEqual([]);
  });

  it('o aviso só existe no host do painel', async () => {
    const resposta = await servidor.inject({
      method: 'POST',
      url: `${ROTAS.aviso}?data.id=abc&type=payment`,
      headers: { host: HOSTS.cardapio },
    });

    expect(resposta.statusCode).toBe(404);
  });

  it('nada secreto ou pessoal vai para o log', () => {
    const log = linhasDoLog.join('');

    expect(log).toContain('pagamento.aviso');
    for (const proibido of [SEGREDO, TOKEN, 'pagador@exemplo.com.br', 'x@y.com', 'v1=', 'ts=']) {
      expect(log).not.toContain(proibido);
    }
  });
});

describe('aviso com o Redis fora', () => {
  it('grava o evento e responde 200 mesmo sem conseguir enfileirar', async () => {
    const servidor = comporApi(ambiente({ URL_REDIS: 'redis://127.0.0.1:1' }));
    await servidor.ready();
    const recurso = randomBytes(8).toString('hex');
    const inicio = performance.now();
    const resposta = await enviarAviso(servidor, { dataId: recurso });
    const duracao = performance.now() - inicio;
    await servidor.close();

    expect(resposta.statusCode).toBe(200);
    expect(duracao).toBeLessThan(1000);
    expect(await eventosCom(recurso)).toHaveLength(1);
  });
});
