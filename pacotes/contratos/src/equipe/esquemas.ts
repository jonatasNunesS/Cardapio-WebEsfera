import { z } from 'zod';

export const ROTAS_DA_EQUIPE = {
  fila: '/api/v1/fila',
  avancoDoPedido: '/api/v1/fila/pedidos/:id/avanco',
  cancelamentoDoPedido: '/api/v1/fila/pedidos/:id/cancelamento',
  avancoDoChamado: '/api/v1/fila/chamados/:id/avanco',
  encerramentoDaSessao: '/api/v1/fila/sessoes/:id/encerramento',
} as const;

const SITUACOES_DO_PEDIDO = ['enviado', 'em_preparo', 'pronto', 'entregue', 'cancelado'] as const;
const SITUACOES_DO_CHAMADO = ['aguardando', 'em_atendimento', 'concluido', 'cancelado'] as const;

export const esquemaAvancoDoPedido = z.strictObject({ situacaoEsperada: z.enum(SITUACOES_DO_PEDIDO) });

export const esquemaCancelamentoPelaEquipe = z.strictObject({
  situacaoEsperada: z.enum(SITUACOES_DO_PEDIDO),
  motivo: z.string().max(800),
});

export const esquemaAvancoDoChamado = z.strictObject({ situacaoEsperada: z.enum(SITUACOES_DO_CHAMADO) });

export const esquemaEncerramentoDaSessao = z.strictObject({ confirmado: z.boolean() });

export type SituacaoDoPedidoNaFila = (typeof SITUACOES_DO_PEDIDO)[number];
export type SituacaoDoChamadoNaFila = (typeof SITUACOES_DO_CHAMADO)[number];

export interface PedidoNaFilaApi {
  readonly id: string;
  readonly numero: number;
  readonly situacao: SituacaoDoPedidoNaFila;
  readonly mesaNumero: number;
  readonly sessaoMesaId: string;
  readonly totalCentavos: number;
  readonly criadoEm: string;
  readonly itens: readonly { readonly nome: string; readonly quantidade: number; readonly observacao: string }[];
}

export interface ChamadoNaFilaApi {
  readonly id: string;
  readonly tipo: 'garcom' | 'conta';
  readonly situacao: SituacaoDoChamadoNaFila;
  readonly mesaNumero: number;
  readonly sessaoMesaId: string;
  readonly criadoEm: string;
}

export interface SessaoNaFilaApi {
  readonly id: string;
  readonly mesaNumero: number;
  readonly abertaEm: string;
}

export interface RespostaFila {
  readonly pedidos: readonly PedidoNaFilaApi[];
  readonly chamados: readonly ChamadoNaFilaApi[];
  readonly sessoes: readonly SessaoNaFilaApi[];
}
