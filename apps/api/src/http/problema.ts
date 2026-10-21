import type { ErroDeNegocio } from '@cardapio/aplicacao';
import type { FastifyReply, FastifyRequest } from 'fastify';

export interface Problema {
  readonly status: number;
  readonly codigo: string;
  readonly titulo: string;
  readonly detalhe: string;
  readonly idRastreio: string;
  readonly extras?: Readonly<Record<string, unknown>>;
}

export function enviarProblema(resposta: FastifyReply, problema: Problema): FastifyReply {
  return resposta
    .code(problema.status)
    .type('application/problem+json')
    .send({
      type: `urn:cardapio-webesfera:problema:${problema.codigo}`,
      title: problema.titulo,
      status: problema.status,
      detail: problema.detalhe,
      codigo: problema.codigo,
      id_rastreio: problema.idRastreio,
      ...problema.extras,
    });
}

export type MapaDeStatusDeNegocio = Readonly<Record<string, 409 | 422>>;

export function enviarFalhaDeNegocio(
  requisicao: FastifyRequest,
  resposta: FastifyReply,
  erro: ErroDeNegocio,
  mapa: MapaDeStatusDeNegocio,
): FastifyReply {
  return enviarProblema(resposta, {
    status: mapa[erro.codigo] ?? 422,
    codigo: erro.codigo,
    titulo: 'Regra de negócio não atendida',
    detalhe: erro.mensagem,
    idRastreio: requisicao.id,
    ...(erro.detalhes === undefined ? {} : { extras: { detalhes: erro.detalhes } }),
  });
}
