import {
  CODIGOS,
  conteudoCanonico,
  criarErroDeNegocio,
  momentoLocal,
  montarPedido,
  podeReceberPedidos,
  Resultado,
  situacaoDoHorario,
  validarCarrinho,
  type ErroDeNegocio,
  type LinhaDoCarrinho,
  type PedidoMontado,
} from '@cardapio/dominio';
import type { DependenciasDosPedidos } from '../dependencias.ts';
import { SESSAO_EXPIRADA } from '../falhas.ts';
import type { EstadoParaPedido, PedidoGuardado, SessaoDoCliente } from '../portas/repositorio-de-pedidos.ts';

export interface PedidoDoCliente {
  readonly chave: string;
  readonly itens: readonly LinhaDoCarrinho[];
}

export interface PedidoCriado {
  readonly novo: boolean;
  readonly pedido: PedidoGuardado;
}

const recusa = (codigo: string, mensagem: string) => Resultado.falha(criarErroDeNegocio(codigo, mensagem));

function decidir(linhas: readonly LinhaDoCarrinho[], agora: Date) {
  return (estado: EstadoParaPedido): Resultado<PedidoMontado, ErroDeNegocio> => {
    if (!podeReceberPedidos({ situacao: estado.situacaoDoRestaurante, suspenso: estado.suspenso })) {
      return recusa(
        CODIGOS.PEDIDO_CRIAR_RESTAURANTE_SUSPENSO,
        'Este restaurante não está recebendo pedidos pelo QR Code agora. Chame um atendente.',
      );
    }
    if (!situacaoDoHorario(estado.horarios, momentoLocal(agora, estado.fusoHorario)).aberto) {
      return recusa(CODIGOS.PEDIDO_CRIAR_RESTAURANTE_FECHADO, 'O restaurante está fechado agora.');
    }
    return montarPedido(linhas, estado.pratos);
  };
}

export async function criarPedido(
  dependencias: DependenciasDosPedidos,
  sessao: SessaoDoCliente,
  pedido: PedidoDoCliente,
): Promise<Resultado<PedidoCriado, ErroDeNegocio>> {
  const carrinho = validarCarrinho(pedido.itens);
  if (!carrinho.ok) {
    return carrinho;
  }
  const agora = dependencias.relogio.agora();
  const desfecho = await dependencias.pedidos.criar(
    sessao,
    {
      chave: pedido.chave,
      hashDoConteudo: dependencias.resumidor.resumo(conteudoCanonico(carrinho.valor)),
      pratoIds: [...new Set(carrinho.valor.map((linha) => linha.pratoId))],
    },
    agora,
    decidir(carrinho.valor, agora),
  );
  switch (desfecho.tipo) {
    case 'criado':
    case 'existente':
      return Resultado.ok({ novo: desfecho.tipo === 'criado', pedido: desfecho.pedido });
    case 'recusado':
      return Resultado.falha(desfecho.erro);
    case 'sessao-expirada':
      return Resultado.falha(SESSAO_EXPIRADA);
    case 'chave-reusada':
      return recusa(
        CODIGOS.PEDIDO_CRIAR_CHAVE_REUSADA,
        'Este envio já foi usado para outro carrinho. Envie de novo.',
      );
  }
}
