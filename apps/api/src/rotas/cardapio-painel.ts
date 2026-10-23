import {
  alterarSituacaoDoPrato,
  criarCategoria,
  criarPrato,
  editarCategoria,
  editarPrato,
  listarCardapioDoPainel,
  moverItemDoCardapio,
  removerCategoria,
  removerPrato,
  type CardapioDoPainel,
  type DependenciasDoCardapio,
  type ErroDeNegocio,
  type Resultado,
} from '@cardapio/aplicacao';
import {
  esquemaAlterarSituacaoDoPrato,
  esquemaCriarCategoria,
  esquemaCriarPrato,
  esquemaEditarCategoria,
  esquemaEditarPrato,
  esquemaIdDoItem,
  esquemaMoverItem,
  esquemaVersaoDoItem,
  ROTAS_DO_CARDAPIO_NO_PAINEL as ROTAS,
  type RespostaCardapioDoPainel,
} from '@cardapio/contratos';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { enviarFalhaDeNegocio } from '../http/problema.ts';
import type { DependenciasDeIdentidade } from '../identidade/dependencias.ts';
import { STATUS_DAS_FALHAS } from '../identidade/falhas.ts';
import { acessoDa, exigirSessao, protegerCsrf } from '../identidade/sessao.ts';

type Acao = (
  acesso: NonNullable<ReturnType<typeof acessoDa>>,
  requisicao: FastifyRequest,
) => Promise<Resultado<unknown, ErroDeNegocio>>;

function paraResposta(cardapio: CardapioDoPainel): RespostaCardapioDoPainel {
  return {
    categorias: cardapio.categorias.map((categoria) => ({
      ...categoria,
      pratos: cardapio.pratos.filter((prato) => prato.categoriaId === categoria.id),
    })),
  };
}

function idDa(requisicao: FastifyRequest): string {
  return esquemaIdDoItem.parse(requisicao.params).id;
}

async function responder(
  requisicao: FastifyRequest,
  resposta: FastifyReply,
  acao: Acao,
  sucesso: number,
): Promise<unknown> {
  const acesso = acessoDa(requisicao, resposta);
  if (acesso === null) {
    return resposta;
  }
  const resultado = await acao(acesso, requisicao);
  if (!resultado.ok) {
    return enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
  }
  return sucesso === 204 ? resposta.code(204).send() : resposta.code(sucesso).send(resultado.valor);
}

function registrarCategorias(
  painel: FastifyInstance,
  dependencias: DependenciasDoCardapio,
  escrita: object,
): void {
  painel.post(ROTAS.categorias, escrita, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) => criarCategoria(dependencias, acesso, esquemaCriarCategoria.parse(requisicao.body)),
      201,
    ),
  );
  painel.put(ROTAS.categoria, escrita, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) => {
        const { versao, ...dados } = esquemaEditarCategoria.parse(requisicao.body);
        return editarCategoria(dependencias, acesso, { id: idDa(requisicao), versao }, dados);
      },
      200,
    ),
  );
  painel.delete(ROTAS.categoria, escrita, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) => {
        const { versao } = esquemaVersaoDoItem.parse(requisicao.body);
        return removerCategoria(dependencias, acesso, { id: idDa(requisicao), versao });
      },
      204,
    ),
  );
  painel.put(ROTAS.posicaoDaCategoria, escrita, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) => {
        const corpo = esquemaMoverItem.parse(requisicao.body);
        return moverItemDoCardapio(dependencias, acesso, {
          tipo: 'categoria',
          id: idDa(requisicao),
          ...corpo,
        });
      },
      204,
    ),
  );
}

function registrarPratos(
  painel: FastifyInstance,
  dependencias: DependenciasDoCardapio,
  escrita: object,
): void {
  painel.post(ROTAS.pratos, escrita, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) => criarPrato(dependencias, acesso, esquemaCriarPrato.parse(requisicao.body)),
      201,
    ),
  );
  painel.put(ROTAS.prato, escrita, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) => {
        const { versao, ...dados } = esquemaEditarPrato.parse(requisicao.body);
        return editarPrato(dependencias, acesso, { id: idDa(requisicao), versao }, dados);
      },
      200,
    ),
  );
  painel.patch(ROTAS.situacaoDoPrato, escrita, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) => {
        const corpo = esquemaAlterarSituacaoDoPrato.parse(requisicao.body);
        return alterarSituacaoDoPrato(dependencias, acesso, { id: idDa(requisicao), ...corpo });
      },
      200,
    ),
  );
  painel.delete(ROTAS.prato, escrita, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) => {
        const { versao } = esquemaVersaoDoItem.parse(requisicao.body);
        return removerPrato(dependencias, acesso, { id: idDa(requisicao), versao });
      },
      204,
    ),
  );
  painel.put(ROTAS.posicaoDoPrato, escrita, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) => {
        const corpo = esquemaMoverItem.parse(requisicao.body);
        return moverItemDoCardapio(dependencias, acesso, { tipo: 'prato', id: idDa(requisicao), ...corpo });
      },
      204,
    ),
  );
}

export function registrarCardapioNoPainel(
  painel: FastifyInstance,
  identidade: DependenciasDeIdentidade,
  dependencias: DependenciasDoCardapio,
): void {
  const comSessao = exigirSessao(identidade, 'painel', ['completa']);
  const escrita = { onRequest: protegerCsrf(painel), preHandler: comSessao };
  painel.get(ROTAS.cardapio, { preHandler: comSessao }, async (requisicao, resposta) => {
    const acesso = acessoDa(requisicao, resposta);
    if (acesso === null) {
      return resposta;
    }
    const resultado = await listarCardapioDoPainel(dependencias, acesso);
    return resultado.ok
      ? paraResposta(resultado.valor)
      : enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
  });
  registrarCategorias(painel, dependencias, escrita);
  registrarPratos(painel, dependencias, escrita);
}
