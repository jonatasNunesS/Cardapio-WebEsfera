import { Readable } from 'node:stream';
import {
  alterarSituacaoDaMesa,
  criarMesa,
  editarMesa,
  gerarNovoCodigoDaMesa,
  listarMesas,
  obterCartaoDaMesa,
  obterCartoesEmZip,
  renumerarMesa,
  type DependenciasDasMesas,
  type ErroDeNegocio,
  type ListaDeMesas,
  type MesaComLink,
  type Resultado,
} from '@cardapio/aplicacao';
import {
  esquemaCriarMesa,
  esquemaDadosDaMesa,
  esquemaIdDoItem,
  esquemaRenumerarMesa,
  esquemaSituacaoDaMesa,
  ROTAS_DAS_MESAS_NO_PAINEL as ROTAS,
  type MesaNaApi,
  type RespostaMesasDoPainel,
} from '@cardapio/contratos';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { enviarFalhaDeNegocio } from '../http/problema.ts';
import type { DependenciasDeIdentidade } from '../identidade/dependencias.ts';
import { STATUS_DAS_FALHAS } from '../identidade/falhas.ts';
import { LIMITES } from '../identidade/limites.ts';
import { acessoDa, exigirSessao, protegerCsrf } from '../identidade/sessao.ts';

type Acesso = NonNullable<ReturnType<typeof acessoDa>>;

function idDa(requisicao: FastifyRequest): string {
  return esquemaIdDoItem.parse(requisicao.params).id;
}

function paraMesa(mesa: MesaComLink): MesaNaApi {
  return {
    id: mesa.id,
    numero: mesa.numero,
    nome: mesa.nome,
    area: mesa.area,
    ativa: mesa.ativa,
    link: mesa.link,
  };
}

function paraLista(lista: ListaDeMesas): RespostaMesasDoPainel {
  return { slug: lista.slug, limite: lista.limite, mesas: lista.mesas.map(paraMesa) };
}

async function responder<T>(
  requisicao: FastifyRequest,
  resposta: FastifyReply,
  acao: (acesso: Acesso) => Promise<Resultado<T, ErroDeNegocio>>,
  enviar: (valor: T, acesso: Acesso) => unknown,
): Promise<unknown> {
  const acesso = acessoDa(requisicao, resposta);
  if (acesso === null) {
    return resposta;
  }
  const resultado = await acao(acesso);
  if (!resultado.ok) {
    return enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
  }
  return enviar(resultado.valor, acesso);
}

function registrarCartoes(
  painel: FastifyInstance,
  dependencias: DependenciasDasMesas,
  leitura: object,
): void {
  const limitado = { ...leitura, config: { rateLimit: LIMITES.cartoesDeQr } };
  painel.get(ROTAS.cartao, limitado, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) => obterCartaoDaMesa(dependencias, acesso, idDa(requisicao)),
      (cartao) =>
        resposta
          .header('content-type', 'image/png')
          .header('cache-control', 'private, no-store')
          .header('content-disposition', `inline; filename="mesa-${String(cartao.numero)}.png"`)
          .send(Buffer.from(cartao.png)),
    ),
  );
  painel.get(ROTAS.cartoes, limitado, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) => obterCartoesEmZip(dependencias, acesso),
      (cartoes) =>
        resposta
          .header('content-type', 'application/zip')
          .header('cache-control', 'private, no-store')
          .header('content-disposition', `attachment; filename="mesas-${cartoes.slug}.zip"`)
          .send(Readable.from(cartoes.zip)),
    ),
  );
}

export function registrarMesasNoPainel(
  painel: FastifyInstance,
  identidade: DependenciasDeIdentidade,
  dependencias: DependenciasDasMesas,
): void {
  const comSessao = exigirSessao(identidade, 'painel', ['completa']);
  const leitura = { preHandler: comSessao };
  const escrita = { onRequest: protegerCsrf(painel), preHandler: comSessao };

  painel.get(ROTAS.mesas, leitura, (requisicao, resposta) =>
    responder(requisicao, resposta, (acesso) => listarMesas(dependencias, acesso), paraLista),
  );
  painel.post(ROTAS.mesas, escrita, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) => criarMesa(dependencias, acesso, esquemaCriarMesa.parse(requisicao.body)),
      () => resposta.code(201).send(),
    ),
  );
  painel.put(ROTAS.mesa, escrita, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) =>
        editarMesa(dependencias, acesso, idDa(requisicao), esquemaDadosDaMesa.parse(requisicao.body)),
      () => resposta.code(204).send(),
    ),
  );
  painel.put(ROTAS.numero, escrita, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) =>
        renumerarMesa(
          dependencias,
          acesso,
          idDa(requisicao),
          esquemaRenumerarMesa.parse(requisicao.body).numero,
        ),
      () => resposta.code(204).send(),
    ),
  );
  painel.put(ROTAS.situacao, escrita, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) =>
        alterarSituacaoDaMesa(
          dependencias,
          acesso,
          idDa(requisicao),
          esquemaSituacaoDaMesa.parse(requisicao.body).ativa,
        ),
      () => resposta.code(204).send(),
    ),
  );
  painel.post(ROTAS.codigo, escrita, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) => gerarNovoCodigoDaMesa(dependencias, acesso, idDa(requisicao)),
      () => resposta.code(204).send(),
    ),
  );
  registrarCartoes(painel, dependencias, leitura);
}
