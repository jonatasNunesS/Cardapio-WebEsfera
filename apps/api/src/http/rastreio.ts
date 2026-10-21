import { abrirContexto, type ContextoDeExecucao } from '@cardapio/observabilidade/node';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { IncomingMessage } from 'node:http';
import { v7 as uuidv7 } from 'uuid';

export const CABECALHO_RASTREIO = 'x-id-rastreio';

const PADRAO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function gerarIdRastreio(requisicao: IncomingMessage): string {
  const recebido = requisicao.headers[CABECALHO_RASTREIO];
  return typeof recebido === 'string' && PADRAO_UUID.test(recebido) ? recebido.toLowerCase() : uuidv7();
}

export function contextoDaRequisicao(requisicao: FastifyRequest): ContextoDeExecucao {
  const rota = requisicao.routeOptions.url;
  return rota === undefined
    ? { idRastreio: requisicao.id, app: 'api' }
    : { idRastreio: requisicao.id, app: 'api', rota };
}

export function registrarRastreio(servidor: FastifyInstance): void {
  servidor.addHook('onRequest', (requisicao, resposta, concluir) => {
    resposta.header(CABECALHO_RASTREIO, requisicao.id);
    abrirContexto(contextoDaRequisicao(requisicao));
    concluir();
  });
}
