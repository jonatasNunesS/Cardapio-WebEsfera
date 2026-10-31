import { z } from 'zod';

export const ROTAS_DA_PLATAFORMA = {
  restaurantes: '/api/v1/admin/restaurantes',
  convite: '/api/v1/admin/restaurantes/:slug/convite',
  suspensao: '/api/v1/admin/restaurantes/:slug/suspensao',
  reativacao: '/api/v1/admin/restaurantes/:slug/reativacao',
  financeiro: '/api/v1/admin/restaurantes/:slug/financeiro',
  visaoGeral: '/api/v1/admin/visao-geral',
} as const;

export const ROTAS_DO_CONVITE = {
  aceitacao: '/api/v1/convites/aceitacao',
} as const;

export const esquemaNovoRestauranteDoAdmin = z.strictObject({
  nome: z.string().max(800),
  slug: z.string().max(240),
  emailDoDono: z.string().max(1000),
});

export const esquemaMotivoDoAdmin = z.strictObject({ motivo: z.string().max(2000) });

export const esquemaAceitarConvite = z.strictObject({
  token: z.string().min(16).max(200),
  senha: z.string().max(1000),
});

export type SituacaoNaPlataforma = 'teste' | 'ativo' | 'carencia' | 'inadimplente' | 'cancelado' | 'suspenso';

export interface RestauranteNaPlataformaApi {
  readonly nome: string;
  readonly slug: string;
  readonly situacao: SituacaoNaPlataforma;
  readonly diasDeTeste: number | null;
}

export interface RespostaRestaurantesDaPlataforma {
  readonly restaurantes: readonly RestauranteNaPlataformaApi[];
}

export interface RespostaConviteGerado {
  readonly slug: string;
  readonly linkDoConvite: string | null;
}

export interface RespostaFinanceiroDoRestaurante {
  readonly situacaoDoRestaurante: string;
  readonly assinatura: {
    readonly situacao: string;
    readonly plano: string;
    readonly pagoAte: string | null;
    readonly proximaCobrancaEm: string | null;
  } | null;
  readonly cobrancas: readonly {
    readonly situacao: string;
    readonly valorCentavos: number;
    readonly venceEm: string;
    readonly pagaEm: string | null;
  }[];
}

export interface RespostaVisaoGeral {
  readonly porSituacao: Readonly<Record<string, number>>;
  readonly pedidosUltimas24h: number;
  readonly linkDoSentry: string | null;
}
