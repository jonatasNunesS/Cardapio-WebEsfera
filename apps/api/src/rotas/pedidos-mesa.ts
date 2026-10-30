import {
  cancelarPedido,
  CODIGOS,
  criarErroDeNegocio,
  criarPedido,
  obterPedido,
  type DependenciasDosPedidos,
  type PedidoGuardado,
} from '@cardapio/aplicacao';
import {
  CABECALHO_DA_CHAVE_DE_IDEMPOTENCIA,
  esquemaChaveDoPedido,
  esquemaIdDoItem,
  esquemaPedidoDoCliente,
  ROTAS_DO_PEDIDO as ROTAS,
  type RespostaPedido,
} from '@cardapio/contratos';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { enviarFalhaDeNegocio } from '../http/problema.ts';
import { sessaoDeMesaDa } from '../http/sessao-de-mesa.ts';
import { STATUS_DAS_FALHAS } from '../identidade/falhas.ts';
import { LIMITES } from '../identidade/limites.ts';
import { apenasNoHost } from '../identidade/sessao.ts';

type Sessao = NonNullable<ReturnType<typeof sessaoDeMesaDa>>;

const SEM_SESSAO = criarErroDeNegocio(
  CODIGOS.PEDIDO_SESSAO_MESA_EXPIRADA,
  'Sua sessão nesta mesa acabou. Escaneie o QR Code da mesa de novo.',
);

function paraResposta(pedido: PedidoGuardado): RespostaPedido {
  return {
    id: pedido.id,
    numero: pedido.numero,
    situacao: pedido.situacao,
    totalCentavos: pedido.totalCentavos,
    criadoEm: pedido.criadoEm.toISOString(),
    itens: pedido.itens.map(({ pratoId, nome, precoCentavos, quantidade, observacao }) => ({
      pratoId,
      nome,
      precoCentavos,
      quantidade,
      observacao,
    })),
  };
}

function comSessao(
  requisicao: FastifyRequest,
  resposta: FastifyReply,
  acao: (sessao: Sessao) => Promise<unknown>,
): Promise<unknown> {
  const sessao = sessaoDeMesaDa(requisicao);
  if (sessao === null) {
    return Promise.resolve(enviarFalhaDeNegocio(requisicao, resposta, SEM_SESSAO, STATUS_DAS_FALHAS));
  }
  resposta.header('cache-control', 'no-store');
  return acao(sessao);
}

export function registrarPedidosDaMesa(
  servidor: FastifyInstance,
  dependencias: DependenciasDosPedidos,
  host: string,
): void {
  void servidor.register((publico, _opcoes, pronto) => {
    publico.addHook('onRequest', apenasNoHost(host));
    publico.post(ROTAS.pedidos, { config: { rateLimit: LIMITES.criarPedido } }, (requisicao, resposta) =>
      comSessao(requisicao, resposta, async (sessao) => {
        const chave = esquemaChaveDoPedido.parse(requisicao.headers[CABECALHO_DA_CHAVE_DE_IDEMPOTENCIA]);
        const { itens } = esquemaPedidoDoCliente.parse(requisicao.body);
        const resultado = await criarPedido(dependencias, sessao, { chave, itens });
        if (!resultado.ok) {
          return enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
        }
        return resposta.code(resultado.valor.novo ? 201 : 200).send(paraResposta(resultado.valor.pedido));
      }),
    );
    publico.get(ROTAS.pedido, { config: { rateLimit: LIMITES.consultarPedido } }, (requisicao, resposta) =>
      comSessao(requisicao, resposta, async (sessao) => {
        const resultado = await obterPedido(
          dependencias,
          sessao,
          esquemaIdDoItem.parse(requisicao.params).id,
        );
        return resultado.ok
          ? resposta.send(paraResposta(resultado.valor))
          : enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
      }),
    );
    publico.post(ROTAS.cancelamento, { config: { rateLimit: LIMITES.criarPedido } }, (requisicao, resposta) =>
      comSessao(requisicao, resposta, async (sessao) => {
        const resultado = await cancelarPedido(
          dependencias,
          sessao,
          esquemaIdDoItem.parse(requisicao.params).id,
        );
        return resultado.ok
          ? resposta.code(204).send()
          : enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
      }),
    );
    pronto();
  });
}
