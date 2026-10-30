import type {
  ErroDeNegocio,
  Horario,
  ItemMontado,
  PedidoMontado,
  PratoParaPedido,
  Resultado,
  SituacaoDoPedido,
  SituacaoDoRestaurante,
} from '@cardapio/dominio';

export interface SessaoDoCliente {
  readonly restauranteId: string;
  readonly sessaoMesaId: string;
}

export interface PedidoGuardado {
  readonly id: string;
  readonly numero: number;
  readonly situacao: SituacaoDoPedido;
  readonly totalCentavos: number;
  readonly criadoEm: Date;
  readonly itens: readonly ItemMontado[];
}

export interface EstadoParaPedido {
  readonly situacaoDoRestaurante: SituacaoDoRestaurante;
  readonly fusoHorario: string;
  readonly horarios: readonly Horario[];
  readonly pratos: ReadonlyMap<string, PratoParaPedido>;
}

export interface NovoPedido {
  readonly chave: string;
  readonly hashDoConteudo: string;
  readonly pratoIds: readonly string[];
}

export type DesfechoDaCriacaoDoPedido =
  | { readonly tipo: 'criado' | 'existente'; readonly pedido: PedidoGuardado }
  | { readonly tipo: 'recusado'; readonly erro: ErroDeNegocio }
  | { readonly tipo: 'sessao-expirada' | 'chave-reusada' };

export type DesfechoDoCancelamento = 'cancelado' | 'nao-encontrado' | 'fora-de-hora' | 'sessao-expirada';

export interface RepositorioDePedidos {
  criar(
    sessao: SessaoDoCliente,
    novo: NovoPedido,
    agora: Date,
    decidir: (estado: EstadoParaPedido) => Resultado<PedidoMontado, ErroDeNegocio>,
  ): Promise<DesfechoDaCriacaoDoPedido>;
  obter(
    sessao: SessaoDoCliente,
    pedidoId: string,
    agora: Date,
  ): Promise<PedidoGuardado | 'sessao-expirada' | null>;
  cancelar(
    sessao: SessaoDoCliente,
    pedidoId: string,
    agora: Date,
    podeCancelar: (situacao: SituacaoDoPedido) => boolean,
  ): Promise<DesfechoDoCancelamento>;
}

export interface Resumidor {
  resumo(texto: string): string;
}
