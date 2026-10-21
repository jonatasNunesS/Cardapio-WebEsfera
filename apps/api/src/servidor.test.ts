import { Writable } from 'node:stream';
import { Resultado, criarErroDeNegocio } from '@cardapio/aplicacao';
import {
  aguardarEnvio,
  criarLogger,
  definirLoggerPadrao,
  iniciarSentryNode,
  relatorDeErrosSentry,
  type AmbienteApp,
} from '@cardapio/observabilidade/node';
import { criarTransporteFalso, DSN_DE_TESTE } from '@cardapio/observabilidade/teste';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { enviarFalhaDeNegocio } from './http/problema.ts';
import { construirServidor } from './servidor.ts';

const transporte = criarTransporteFalso();
const linhasDoLog: string[] = [];
const logger = criarLogger({
  app: 'api',
  destino: new Writable({
    write(pedaco: Buffer, _codificacao, concluir) {
      linhasDoLog.push(pedaco.toString());
      concluir();
    },
  }),
});

const esquemaPedido = z.object({ mesa: z.number().int(), itens: z.array(z.string()).min(1) });

function servidorDeTeste(ambiente: AmbienteApp = 'local') {
  const servidor = construirServidor({ logger, ambiente, relatorDeErros: relatorDeErrosSentry });
  servidor.post('/teste/pedidos', (requisicao, resposta) => {
    const corpo = esquemaPedido.parse(requisicao.body);
    const resultado =
      corpo.mesa === 99
        ? Resultado.falha(
            criarErroDeNegocio('PEDIDO_CRIAR_MESA_FECHADA', 'A mesa está fechada para pedidos.'),
          )
        : Resultado.ok(corpo);
    return resultado.ok
      ? resultado.valor
      : enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, { PEDIDO_CRIAR_MESA_FECHADA: 422 });
  });
  servidor.get('/teste/bug', () => {
    throw new TypeError('x is undefined');
  });
  return servidor;
}

beforeAll(() => {
  definirLoggerPadrao(logger);
  iniciarSentryNode({
    app: 'api',
    dsn: DSN_DE_TESTE,
    release: 'api@0.0.0+teste',
    ambiente: 'local',
    transporte: transporte.fabrica,
  });
});

beforeEach(() => {
  transporte.eventos.length = 0;
  linhasDoLog.length = 0;
});

describe('API: saúde e rastreio', () => {
  it('GET /saude responde 200 com a situação ok', async () => {
    const resposta = await servidorDeTeste().inject({ method: 'GET', url: '/saude' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ situacao: 'ok' });
  });

  it('devolve o x-id-rastreio recebido', async () => {
    const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
    const resposta = await servidorDeTeste().inject({
      method: 'GET',
      url: '/saude',
      headers: { 'x-id-rastreio': id },
    });

    expect(resposta.headers['x-id-rastreio']).toBe(id);
  });

  it('gera um id novo quando o recebido não é um UUID', async () => {
    const resposta = await servidorDeTeste().inject({
      method: 'GET',
      url: '/saude',
      headers: { 'x-id-rastreio': 'nao-e-uuid' },
    });

    expect(resposta.headers['x-id-rastreio']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
  });

  it('não registra o código do QR nem o IP no log', async () => {
    await servidorDeTeste().inject({ method: 'GET', url: '/brasa-e-trigo/mesa/12?c=Abc123Segredo' });
    const log = linhasDoLog.join('');

    expect(log).toContain('requisição recebida');
    expect(log).toContain('"idRastreio"');
    for (const linha of linhasDoLog) {
      expect(linha.match(/"idRastreio"/g)?.length ?? 0).toBeLessThanOrEqual(1);
    }
    expect(log).not.toContain('Abc123Segredo');
    expect(log).not.toContain('remoteAddress');
  });
});

describe('API: erros em Problem Details', () => {
  it('erro de negócio dá 422 sem Sentry', async () => {
    const resposta = await servidorDeTeste().inject({
      method: 'POST',
      url: '/teste/pedidos',
      payload: { mesa: 99, itens: ['pizza'] },
    });
    await aguardarEnvio(1000);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    expect(resposta.json()).toMatchObject({
      status: 422,
      codigo: 'PEDIDO_CRIAR_MESA_FECHADA',
      detail: 'A mesa está fechada para pedidos.',
      id_rastreio: resposta.headers['x-id-rastreio'],
    });
    expect(transporte.eventos).toHaveLength(0);
  });

  it('entrada inválida no Zod dá 400 com os campos', async () => {
    const resposta = await servidorDeTeste().inject({
      method: 'POST',
      url: '/teste/pedidos',
      payload: { mesa: 'doze', itens: [] },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toMatchObject({
      codigo: 'HTTP_ENTRADA_INVALIDA',
      campos: [
        { campo: 'mesa', motivo: 'invalid_type' },
        { campo: 'itens', motivo: 'too_small' },
      ],
    });
    expect(transporte.eventos).toHaveLength(0);
  });

  it('rota inexistente dá 404 sem Sentry', async () => {
    const resposta = await servidorDeTeste().inject({ method: 'GET', url: '/nao-existe' });
    await aguardarEnvio(1000);

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toMatchObject({ codigo: 'HTTP_ROTA_INEXISTENTE', status: 404 });
    expect(transporte.eventos).toHaveLength(0);
  });

  it('erro inesperado dá 500 com o id do evento, reporta uma vez e não expõe a pilha', async () => {
    const resposta = await servidorDeTeste().inject({ method: 'GET', url: '/teste/bug' });
    await aguardarEnvio(1000);
    const corpo = resposta.json<Record<string, unknown>>();

    expect(resposta.statusCode).toBe(500);
    expect(transporte.eventos).toHaveLength(1);
    expect(corpo.id_rastreio).toBe(transporte.eventos[0]?.event_id);
    expect(Object.keys(corpo).sort()).toEqual(['codigo', 'detail', 'id_rastreio', 'status', 'title', 'type']);
    expect(resposta.body).not.toContain('x is undefined');
    expect(resposta.body).not.toContain('servidor.test.ts');
    expect(transporte.eventos[0]?.tags).toMatchObject({ app: 'api', rota: '/teste/bug' });
  });
});

describe('API: rota de depuração', () => {
  it('existe em local e lança um ErroAplicacao reportado ao Sentry', async () => {
    const resposta = await servidorDeTeste('local').inject({ method: 'GET', url: '/depuracao/erro' });
    await aguardarEnvio(1000);

    expect(resposta.statusCode).toBe(500);
    expect(transporte.eventos[0]?.tags?.codigo).toBe('DEPURACAO_ERRO_PROVOCADO');
  });

  it('não existe em produção', async () => {
    const resposta = await servidorDeTeste('producao').inject({ method: 'GET', url: '/depuracao/erro' });

    expect(resposta.statusCode).toBe(404);
  });
});
