import { CODIGOS, criarErroDeNegocio, type SessaoDoCliente } from '@cardapio/aplicacao';
import { COOKIE_DA_SESSAO_DE_MESA } from '@cardapio/contratos';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { STATUS_DAS_FALHAS } from '../identidade/falhas.ts';
import { enviarFalhaDeNegocio } from './problema.ts';

const PADRAO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// O restaurante vem do cookie assinado, nunca da URL ou do corpo: docs/adr/0015-pedido-do-cliente.md
export function valorDaSessaoDeMesa(restauranteId: string, sessaoId: string): string {
  return `${restauranteId}:${sessaoId}`;
}

export function sessaoDeMesaDa(requisicao: FastifyRequest): SessaoDoCliente | null {
  const bruto = requisicao.cookies[COOKIE_DA_SESSAO_DE_MESA];
  if (bruto === undefined) {
    return null;
  }
  const lido = requisicao.unsignCookie(bruto);
  if (!lido.valid) {
    return null;
  }
  const [restauranteId = '', sessaoMesaId = ''] = lido.value.split(':');
  return PADRAO_UUID.test(restauranteId) && PADRAO_UUID.test(sessaoMesaId)
    ? { restauranteId, sessaoMesaId }
    : null;
}

const SEM_SESSAO = criarErroDeNegocio(
  CODIGOS.PEDIDO_SESSAO_MESA_EXPIRADA,
  'Sua sessão nesta mesa acabou. Escaneie o QR Code da mesa de novo.',
);

export function comSessaoDeMesa(
  requisicao: FastifyRequest,
  resposta: FastifyReply,
  acao: (sessao: SessaoDoCliente) => Promise<unknown>,
): Promise<unknown> {
  const sessao = sessaoDeMesaDa(requisicao);
  if (sessao === null) {
    return Promise.resolve(enviarFalhaDeNegocio(requisicao, resposta, SEM_SESSAO, STATUS_DAS_FALHAS));
  }
  resposta.header('cache-control', 'no-store');
  return acao(sessao);
}
