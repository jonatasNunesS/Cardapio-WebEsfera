import { CODIGOS, criarErroDeNegocio, renovarSessao, type Publico } from '@cardapio/aplicacao';
import { ROTAS_DO_ADMIN } from '@cardapio/contratos';
import type { BaseAdapter } from '@bull-board/api/baseAdapter';
import { createBullBoard } from '@bull-board/api';
import { FastifyAdapter } from '@bull-board/fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { COOKIES } from '../http/cookies.ts';
import { enviarFalhaDeNegocio } from '../http/problema.ts';
import type { DependenciasDeIdentidade } from '../identidade/dependencias.ts';
import { STATUS_DAS_FALHAS } from '../identidade/falhas.ts';
import { apenasNoHost } from '../identidade/sessao.ts';

const SEM_SESSAO = criarErroDeNegocio(CODIGOS.SESSAO_VALIDAR_INVALIDA, 'Entre como administrador.');
const SEM_PERMISSAO = criarErroDeNegocio(
  CODIGOS.FILAS_PAINEL_SEM_PERMISSAO,
  'O painel de filas é só para administradores.',
);
const ORIGEM_RECUSADA = criarErroDeNegocio(
  CODIGOS.FILAS_PAINEL_ORIGEM_RECUSADA,
  'A ação precisa partir do próprio painel de filas.',
);
const METODOS_DE_LEITURA: ReadonlySet<string> = new Set(['GET', 'HEAD']);

export interface OpcoesDoPainelDeFilas {
  readonly dependencias: DependenciasDeIdentidade;
  readonly host: string;
  readonly adaptadores: readonly BaseAdapter[];
  readonly aoFalhar: (erro: Error) => void;
}

async function sessaoValida(
  dependencias: DependenciasDeIdentidade,
  requisicao: FastifyRequest,
  publico: Publico,
): Promise<boolean> {
  const token = requisicao.cookies[publico === 'admin' ? COOKIES.admin : COOKIES.painel];
  if (token === undefined || token === '') {
    return false;
  }
  return (await renovarSessao(dependencias, { token, publico, niveis: ['completa'] })).ok;
}

function autorizar(opcoes: OpcoesDoPainelDeFilas) {
  return async (requisicao: FastifyRequest, resposta: FastifyReply) => {
    if (!(await sessaoValida(opcoes.dependencias, requisicao, 'admin'))) {
      const ehDono = await sessaoValida(opcoes.dependencias, requisicao, 'painel');
      return enviarFalhaDeNegocio(
        requisicao,
        resposta,
        ehDono ? SEM_PERMISSAO : SEM_SESSAO,
        STATUS_DAS_FALHAS,
      );
    }
    if (
      !METODOS_DE_LEITURA.has(requisicao.method) &&
      requisicao.headers.origin !== `https://${opcoes.host}`
    ) {
      return enviarFalhaDeNegocio(requisicao, resposta, ORIGEM_RECUSADA, STATUS_DAS_FALHAS);
    }
    return undefined;
  };
}

function criarAdaptadorFastify(opcoes: OpcoesDoPainelDeFilas): FastifyAdapter {
  const adaptador = new FastifyAdapter();
  adaptador.setBasePath(ROTAS_DO_ADMIN.filas);
  createBullBoard({
    queues: [...opcoes.adaptadores],
    serverAdapter: adaptador,
    options: { uiConfig: { boardTitle: 'Filas' } },
  });
  adaptador.setErrorHandler((erro) => {
    opcoes.aoFalhar(erro);
    return { status: 500, body: { error: 'Erro interno no painel de filas' } };
  });
  return adaptador;
}

export function registrarPainelDeFilas(servidor: FastifyInstance, opcoes: OpcoesDoPainelDeFilas): void {
  const adaptador = criarAdaptadorFastify(opcoes);
  void servidor.register(async (painel) => {
    painel.addHook('onRequest', apenasNoHost(opcoes.host));
    painel.addHook('onRequest', autorizar(opcoes));
    await painel.register(adaptador.registerPlugin(), { prefix: ROTAS_DO_ADMIN.filas });
  });
}
