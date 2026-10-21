import {
  abrirContexto,
  ehIdRastreioValido,
  gerarIdRastreio,
  type ContextoDeExecucao,
} from '@cardapio/observabilidade/node';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { IncomingMessage } from 'node:http';

export const CABECALHO_RASTREIO = 'x-id-rastreio';

export function idRastreioDaRequisicao(requisicao: IncomingMessage): string {
  const recebido = requisicao.headers[CABECALHO_RASTREIO];
  return ehIdRastreioValido(recebido) ? recebido.toLowerCase() : gerarIdRastreio();
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
