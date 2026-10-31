// Entrada sem zod para o app do cliente, que tem orçamento de JavaScript: docs/adr/0013-cardapio-do-cliente.md
export const ROTAS_DO_CARDAPIO_PUBLICO = {
  cardapio: '/api/v1/cardapios/:slug',
  busca: '/api/v1/cardapios/:slug/busca',
} as const;

export const ROTAS_DA_MESA_PUBLICA = {
  abrir: '/api/v1/cardapios/:slug/mesa/:numero',
} as const;

export function rotaCom(rota: string, parametros: Readonly<Record<string, string>>): string {
  return rota.replace(/:([a-z]+)/gi, (_trecho, nome: string) => encodeURIComponent(parametros[nome] ?? ''));
}

export const ROTAS_DO_PEDIDO = {
  pedidos: '/api/v1/mesa/pedidos',
  pedido: '/api/v1/mesa/pedidos/:id',
  cancelamento: '/api/v1/mesa/pedidos/:id/cancelamento',
} as const;

export const CABECALHO_DA_CHAVE_DE_IDEMPOTENCIA = 'idempotency-key';

export type SituacaoDoPedidoNaApi = 'enviado' | 'em_preparo' | 'pronto' | 'entregue' | 'cancelado';

export interface LinhaDoPedidoNaApi {
  readonly pratoId: string;
  readonly quantidade: number;
  readonly observacao: string;
}

export interface ItemDoPedidoNaApi extends LinhaDoPedidoNaApi {
  readonly nome: string;
  readonly precoCentavos: number;
}

export interface RespostaPedido {
  readonly id: string;
  readonly numero: number;
  readonly situacao: SituacaoDoPedidoNaApi;
  readonly totalCentavos: number;
  readonly criadoEm: string;
  readonly itens: readonly ItemDoPedidoNaApi[];
}

// UUID v7 da RFC 9562, sem biblioteca, para caber no orçamento do cliente: docs/adr/0015-pedido-do-cliente.md
export function gerarUuidV7(agora: number, aleatorio: Uint8Array): string {
  const bytes = new Uint8Array(16);
  let tempo = agora;
  for (let indice = 5; indice >= 0; indice -= 1) {
    bytes[indice] = tempo % 256;
    tempo = Math.floor(tempo / 256);
  }
  bytes.set(aleatorio, 6);
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f);
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const ROTAS_DO_ATENDIMENTO = {
  garcom: '/api/v1/mesa/chamados/garcom',
  conta: '/api/v1/mesa/chamados/conta',
  chamado: '/api/v1/mesa/chamados/:id',
  cancelamento: '/api/v1/mesa/chamados/:id/cancelamento',
  resumo: '/api/v1/mesa/conta',
  sessao: '/api/v1/mesa/sessao',
} as const;

export type TipoDeChamadoNaApi = 'garcom' | 'conta';
export type SituacaoDoChamadoNaApi = 'aguardando' | 'em_atendimento' | 'concluido' | 'cancelado';

export interface RespostaChamado {
  readonly id: string;
  readonly tipo: TipoDeChamadoNaApi;
  readonly situacao: SituacaoDoChamadoNaApi;
  readonly criadoEm: string;
}

export interface RespostaConta {
  readonly itens: readonly {
    readonly nome: string;
    readonly quantidade: number;
    readonly precoCentavos: number;
  }[];
  readonly subtotalCentavos: number;
  readonly taxaCentavos: number;
  readonly totalComTaxaCentavos: number;
  readonly totalSemTaxaCentavos: number;
  readonly porPessoa: { readonly comTaxa: readonly number[]; readonly semTaxa: readonly number[] };
}

export interface RespostaSessaoDaMesa {
  readonly situacao: 'aberta' | 'encerrada' | 'expirada';
}
export * from './tempo-real/publico.ts';
