import { z } from 'zod';

export const ROTAS_DA_COBRANCA = {
  plano: '/api/v1/plano',
  assinatura: '/api/v1/plano/assinatura',
  aviso: '/api/v1/webhooks/mercado-pago',
} as const;

export const CABECALHO_IDEMPOTENCIA = 'idempotency-key';

export const esquemaChaveDeIdempotencia = z.uuid();

export const esquemaEscolherPlano = z.strictObject({
  codigoDoPlano: z.string().min(1).max(40),
  emailDoPagador: z.string().min(1).max(254),
});

export const esquemaAvisoNaUrl = z.object({
  'data.id': z.string().max(128).default(''),
  type: z.string().max(64).default(''),
});

export type SituacaoDoRestauranteNaApi = 'teste' | 'ativo' | 'carencia' | 'inadimplente' | 'cancelado';

export interface PlanoNaApi {
  readonly codigo: string;
  readonly nome: string;
  readonly precoCentavos: number;
  readonly limiteMesas: number;
}

export interface AssinaturaNaApi {
  readonly codigoDoPlano: string;
  readonly nomeDoPlano: string;
  readonly situacao: 'pendente' | 'autorizada' | 'pausada' | 'cancelada';
  readonly linkDePagamento: string | null;
  readonly pagoAte: string | null;
  readonly proximaCobrancaEm: string | null;
}

export interface CobrancaNaApi {
  readonly id: string;
  readonly valorCentavos: number;
  readonly situacao: 'agendada' | 'paga' | 'recusada' | 'em_retentativa' | 'cancelada';
  readonly venceEm: string;
  readonly pagaEm: string | null;
}

export interface RespostaPlanoECobranca {
  readonly situacao: SituacaoDoRestauranteNaApi;
  readonly testeTerminaEm: string;
  readonly vencimento: string;
  readonly diaDeAtraso: number;
  readonly diaDaInadimplencia: number;
  readonly podeAssinar: boolean;
  readonly planos: readonly PlanoNaApi[];
  readonly assinatura: AssinaturaNaApi | null;
  readonly cobrancas: readonly CobrancaNaApi[];
}

export interface RespostaCheckout {
  readonly linkDePagamento: string;
}
