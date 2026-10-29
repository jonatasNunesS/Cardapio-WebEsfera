import {
  confirmarEnvioDeMidia,
  consultarMidiasDoPrato,
  removerMidiaDoPrato,
  solicitarEnvioDeMidia,
  tentarProcessarMidiaDeNovo,
  type DependenciasDaMidia,
  type EnvioAutorizado,
  type ErroDeNegocio,
  type Resultado,
} from '@cardapio/aplicacao';
import {
  esquemaIdDoItem,
  esquemaPedidoDeEnvio,
  ROTAS_DA_MIDIA_NO_PAINEL as ROTAS,
  type RespostaMidiasDoPrato,
  type RespostaPedidoDeEnvio,
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

function paraResposta(envio: EnvioAutorizado): RespostaPedidoDeEnvio {
  return {
    midiaId: envio.midiaId,
    url: envio.url,
    metodo: 'PUT',
    cabecalhos: envio.cabecalhos,
    expiraEm: envio.expiraEm.toISOString(),
  };
}

async function responder<T>(
  requisicao: FastifyRequest,
  resposta: FastifyReply,
  acao: (acesso: Acesso) => Promise<Resultado<T, ErroDeNegocio>>,
  enviar: (valor: T) => unknown,
): Promise<unknown> {
  const acesso = acessoDa(requisicao, resposta);
  if (acesso === null) {
    return resposta;
  }
  const resultado = await acao(acesso);
  if (!resultado.ok) {
    return enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
  }
  return enviar(resultado.valor);
}

export function registrarMidiaNoPainel(
  painel: FastifyInstance,
  identidade: DependenciasDeIdentidade,
  dependencias: DependenciasDaMidia,
): void {
  const comSessao = exigirSessao(identidade, 'painel', ['completa']);
  const escrita = { onRequest: protegerCsrf(painel), preHandler: comSessao };
  const semCorpo = (resposta: FastifyReply) => () => resposta.code(204).send();

  painel.get(ROTAS.midiasDoPrato, { preHandler: comSessao }, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) => consultarMidiasDoPrato(dependencias, acesso, idDa(requisicao)),
      (midias): RespostaMidiasDoPrato => midias,
    ),
  );
  painel.post(
    ROTAS.midiasDoPrato,
    { ...escrita, config: { rateLimit: LIMITES.envioDeMidia } },
    (requisicao, resposta) =>
      responder(
        requisicao,
        resposta,
        (acesso) =>
          solicitarEnvioDeMidia(
            dependencias,
            acesso,
            idDa(requisicao),
            esquemaPedidoDeEnvio.parse(requisicao.body),
          ),
        (envio) => resposta.code(201).send(paraResposta(envio)),
      ),
  );
  painel.post(ROTAS.confirmacao, escrita, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) => confirmarEnvioDeMidia(dependencias, acesso, idDa(requisicao)),
      semCorpo(resposta),
    ),
  );
  painel.post(ROTAS.novaTentativa, escrita, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) => tentarProcessarMidiaDeNovo(dependencias, acesso, idDa(requisicao)),
      semCorpo(resposta),
    ),
  );
  painel.delete(ROTAS.midiaDoPrato, escrita, (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      (acesso) => removerMidiaDoPrato(dependencias, acesso, idDa(requisicao)),
      semCorpo(resposta),
    ),
  );
}
