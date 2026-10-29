import {
  CODIGOS,
  criarErroDeNegocio,
  ErroEstadoInconsistente,
  renovarSessao,
  type AcessoAoRestaurante,
  type NivelDaSessao,
  type Publico,
  type SessaoValida,
} from '@cardapio/aplicacao';
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  onRequestHookHandler,
  preHandlerAsyncHookHandler,
} from 'fastify';
import { apagarCookieDeSessao, COOKIES } from '../http/cookies.ts';
import { enviarFalhaDeNegocio } from '../http/problema.ts';
import type { DependenciasDeIdentidade } from './dependencias.ts';
import { STATUS_DAS_FALHAS } from './falhas.ts';

declare module 'fastify' {
  interface FastifyRequest {
    sessaoValida: SessaoValida | null;
  }
}

const SEM_SESSAO = criarErroDeNegocio(CODIGOS.SESSAO_VALIDAR_INVALIDA, 'Sua sessão terminou. Entre de novo.');
const SEM_VINCULO = criarErroDeNegocio(
  CODIGOS.RESTAURANTE_ACESSO_SEM_VINCULO,
  'Escolha ou crie um restaurante antes de continuar.',
);

export function cookieDoPublico(publico: Publico) {
  return publico === 'painel' ? COOKIES.painel : COOKIES.admin;
}

export function exigirSessao(
  dependencias: DependenciasDeIdentidade,
  publico: Publico,
  niveis: readonly NivelDaSessao[],
): preHandlerAsyncHookHandler {
  return async (requisicao, resposta) => {
    const token = requisicao.cookies[cookieDoPublico(publico)];
    const resultado =
      token === undefined || token === ''
        ? null
        : await renovarSessao(dependencias, { token, publico, niveis });
    if (resultado?.ok !== true) {
      apagarCookieDeSessao(resposta, cookieDoPublico(publico));
      return enviarFalhaDeNegocio(requisicao, resposta, SEM_SESSAO, STATUS_DAS_FALHAS);
    }
    requisicao.sessaoValida = resultado.valor;
    return undefined;
  };
}

export function sessaoDa(requisicao: FastifyRequest): SessaoValida {
  if (requisicao.sessaoValida === null) {
    throw new ErroEstadoInconsistente(
      CODIGOS.HTTP_SESSAO_AUSENTE,
      'Rota sem exigirSessao antes do tratador',
      {
        modulo: 'http',
        casoDeUso: requisicao.routeOptions.url ?? 'desconhecida',
      },
    );
  }
  return requisicao.sessaoValida;
}

export function acessoDa(requisicao: FastifyRequest, resposta: FastifyReply): AcessoAoRestaurante | null {
  const sessao = sessaoDa(requisicao);
  if (sessao.restauranteId === null || sessao.papel === null) {
    enviarFalhaDeNegocio(requisicao, resposta, SEM_VINCULO, STATUS_DAS_FALHAS);
    return null;
  }
  return { restauranteId: sessao.restauranteId, papel: sessao.papel, usuarioId: sessao.titularId };
}

export function apenasNoHost(host: string) {
  return async (requisicao: FastifyRequest, resposta: FastifyReply) => {
    if (requisicao.hostname !== host) {
      resposta.callNotFound();
      return resposta;
    }
    return undefined;
  };
}

export function protegerCsrf(escopo: FastifyInstance): onRequestHookHandler {
  return escopo.csrfProtection.bind(escopo);
}
