import {
  avancarChamado,
  avancarPedido,
  cancelarPedidoPelaEquipe,
  encerrarSessaoDeMesa,
  obterFila,
  type AcessoAoRestaurante,
  type AssinanteTempoReal,
  type DependenciasDaEquipe,
  type ErroDeNegocio,
  type FilaDaEquipe,
  type Resultado,
} from '@cardapio/aplicacao';
import {
  esquemaAvancoDoChamado,
  esquemaAvancoDoPedido,
  esquemaCancelamentoPelaEquipe,
  esquemaEncerramentoDaSessao,
  esquemaIdDoItem,
  ROTAS_DA_EQUIPE as ROTAS,
  type RespostaFila,
} from '@cardapio/contratos';
import { ROTAS_DO_TEMPO_REAL } from '@cardapio/contratos/publico';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { enviarFalhaDeNegocio } from '../http/problema.ts';
import type { DependenciasDeIdentidade } from '../identidade/dependencias.ts';
import { STATUS_DAS_FALHAS } from '../identidade/falhas.ts';
import { acessoDa, exigirSessao, protegerCsrf } from '../identidade/sessao.ts';
import { abrirFluxoSse } from './fluxo-sse.ts';

const idDa = (requisicao: FastifyRequest) => esquemaIdDoItem.parse(requisicao.params).id;

function paraResposta(fila: FilaDaEquipe): RespostaFila {
  return {
    pedidos: fila.pedidos.map((pedido) => ({ ...pedido, criadoEm: pedido.criadoEm.toISOString() })),
    chamados: fila.chamados.map((chamado) => ({ ...chamado, criadoEm: chamado.criadoEm.toISOString() })),
    sessoes: fila.sessoes.map((sessao) => ({ ...sessao, abertaEm: sessao.abertaEm.toISOString() })),
  };
}

async function responder<T>(
  requisicao: FastifyRequest,
  resposta: FastifyReply,
  acao: (acesso: AcessoAoRestaurante) => Promise<Resultado<T, ErroDeNegocio>>,
  enviar: (valor: T) => unknown,
): Promise<unknown> {
  const acesso = acessoDa(requisicao, resposta);
  if (acesso === null) {
    return resposta;
  }
  const resultado = await acao(acesso);
  return resultado.ok
    ? enviar(resultado.valor)
    : enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
}

export function registrarFilaNoPainel(
  painel: FastifyInstance,
  identidade: DependenciasDeIdentidade,
  dependencias: DependenciasDaEquipe,
  assinante: AssinanteTempoReal,
): void {
  const comSessao = exigirSessao(identidade, 'painel', ['completa']);
  const leitura = { preHandler: comSessao };
  const escrita = { onRequest: protegerCsrf(painel), preHandler: comSessao };
  const semCorpo = (resposta: FastifyReply) => () => resposta.code(204).send();

  painel.get(ROTAS.fila, leitura, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) => obterFila(dependencias, acesso),
      (fila) => resposta.header('cache-control', 'no-store').send(paraResposta(fila)),
    ),
  );
  painel.post(ROTAS.avancoDoPedido, escrita, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) =>
        avancarPedido(
          dependencias,
          acesso,
          idDa(requisicao),
          esquemaAvancoDoPedido.parse(requisicao.body).situacaoEsperada,
        ),
      semCorpo(resposta),
    ),
  );
  painel.post(ROTAS.cancelamentoDoPedido, escrita, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) =>
        cancelarPedidoPelaEquipe(
          dependencias,
          acesso,
          idDa(requisicao),
          esquemaCancelamentoPelaEquipe.parse(requisicao.body),
        ),
      semCorpo(resposta),
    ),
  );
  painel.post(ROTAS.avancoDoChamado, escrita, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) =>
        avancarChamado(
          dependencias,
          acesso,
          idDa(requisicao),
          esquemaAvancoDoChamado.parse(requisicao.body).situacaoEsperada,
        ),
      semCorpo(resposta),
    ),
  );
  painel.post(ROTAS.encerramentoDaSessao, escrita, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) =>
        encerrarSessaoDeMesa(
          dependencias,
          acesso,
          idDa(requisicao),
          esquemaEncerramentoDaSessao.parse(requisicao.body).confirmado,
        ),
      semCorpo(resposta),
    ),
  );
  painel.get(ROTAS_DO_TEMPO_REAL.painel, leitura, async (requisicao, resposta) => {
    const acesso = acessoDa(requisicao, resposta);
    if (acesso === null) {
      return resposta;
    }
    await abrirFluxoSse(requisicao, resposta, {
      assinante,
      restauranteId: acesso.restauranteId,
      filtrar: (aviso) => aviso.dados,
    });
    return resposta;
  });
}
