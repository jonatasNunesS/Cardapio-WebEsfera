import {
  cancelarChamado,
  chamarGarcom,
  obterChamado,
  obterResumoDaConta,
  obterSituacaoDaSessao,
  pedirConta,
  type ChamadoGuardado,
  type DependenciasDoAtendimento,
  type ErroDeNegocio,
  type Resultado,
} from '@cardapio/aplicacao';
import {
  CABECALHO_DA_CHAVE_DE_IDEMPOTENCIA,
  esquemaChaveDoPedido,
  esquemaIdDoItem,
  ROTAS_DO_ATENDIMENTO as ROTAS,
  type RespostaChamado,
  type RespostaSessaoDaMesa,
} from '@cardapio/contratos';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { enviarFalhaDeNegocio } from '../http/problema.ts';
import { comSessaoDeMesa, sessaoDeMesaDa } from '../http/sessao-de-mesa.ts';
import { STATUS_DAS_FALHAS } from '../identidade/falhas.ts';
import { LIMITES } from '../identidade/limites.ts';
import { apenasNoHost } from '../identidade/sessao.ts';

const paraResposta = (chamado: ChamadoGuardado): RespostaChamado => ({
  id: chamado.id,
  tipo: chamado.tipo,
  situacao: chamado.situacao,
  criadoEm: chamado.criadoEm.toISOString(),
});

function responder<T>(
  requisicao: FastifyRequest,
  resposta: FastifyReply,
  resultado: Resultado<T, ErroDeNegocio>,
  enviar: (valor: T) => unknown,
) {
  return resultado.ok
    ? enviar(resultado.valor)
    : enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
}

export function registrarAtendimentoDaMesa(
  servidor: FastifyInstance,
  dependencias: DependenciasDoAtendimento,
  host: string,
): void {
  void servidor.register((publico, _opcoes, pronto) => {
    publico.addHook('onRequest', apenasNoHost(host));
    const escrita = { config: { rateLimit: LIMITES.criarPedido } };
    const leitura = { config: { rateLimit: LIMITES.consultarPedido } };
    for (const [rota, abrir] of [
      [ROTAS.garcom, chamarGarcom],
      [ROTAS.conta, pedirConta],
    ] as const) {
      publico.post(rota, escrita, (requisicao, resposta) =>
        comSessaoDeMesa(requisicao, resposta, async (sessao) => {
          const chave = esquemaChaveDoPedido.parse(requisicao.headers[CABECALHO_DA_CHAVE_DE_IDEMPOTENCIA]);
          const resultado = await abrir(dependencias, sessao, chave);
          return responder(requisicao, resposta, resultado, (aberto) =>
            resposta.code(aberto.novo ? 201 : 200).send(paraResposta(aberto.chamado)),
          );
        }),
      );
    }
    publico.get(ROTAS.chamado, leitura, (requisicao, resposta) =>
      comSessaoDeMesa(requisicao, resposta, async (sessao) => {
        const resultado = await obterChamado(
          dependencias,
          sessao,
          esquemaIdDoItem.parse(requisicao.params).id,
        );
        return responder(requisicao, resposta, resultado, (chamado) => resposta.send(paraResposta(chamado)));
      }),
    );
    publico.post(ROTAS.cancelamento, escrita, (requisicao, resposta) =>
      comSessaoDeMesa(requisicao, resposta, async (sessao) => {
        const resultado = await cancelarChamado(
          dependencias,
          sessao,
          esquemaIdDoItem.parse(requisicao.params).id,
        );
        return responder(requisicao, resposta, resultado, () => resposta.code(204).send());
      }),
    );
    publico.get(ROTAS.resumo, leitura, (requisicao, resposta) =>
      comSessaoDeMesa(requisicao, resposta, async (sessao) => {
        const resultado = await obterResumoDaConta(dependencias, sessao);
        return responder(requisicao, resposta, resultado, (conta) => resposta.send(conta));
      }),
    );
    publico.get(ROTAS.sessao, leitura, async (requisicao, resposta) => {
      const corpo: RespostaSessaoDaMesa = {
        situacao: await obterSituacaoDaSessao(dependencias, sessaoDeMesaDa(requisicao)),
      };
      return resposta.header('cache-control', 'no-store').send(corpo);
    });
    pronto();
  });
}
