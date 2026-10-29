import { z } from 'zod';

export const LIMITES_DA_MESA_NA_API = {
  numeroMinimo: 1,
  numeroMaximo: 999,
  nome: 60,
  area: 60,
} as const;

export const ROTAS_DAS_MESAS_NO_PAINEL = {
  mesas: '/api/v1/mesas',
  mesa: '/api/v1/mesas/:id',
  numero: '/api/v1/mesas/:id/numero',
  situacao: '/api/v1/mesas/:id/situacao',
  codigo: '/api/v1/mesas/:id/codigo',
  cartao: '/api/v1/mesas/:id/qr.png',
  cartoes: '/api/v1/mesas/qr.zip',
} as const;

export const ROTAS_DA_MESA_PUBLICA = {
  abrir: '/api/v1/cardapios/:slug/mesa/:numero',
} as const;

export const ROTAS_DAS_MESAS_NO_ADMIN = {
  mesas: '/api/v1/admin/restaurantes/:slug/mesas',
} as const;

export const COOKIE_DA_SESSAO_DE_MESA = '__Host-sessao_mesa';

const numero = z
  .number()
  .int()
  .min(LIMITES_DA_MESA_NA_API.numeroMinimo)
  .max(LIMITES_DA_MESA_NA_API.numeroMaximo);
const textoOpcional = (limite: number) =>
  z
    .string()
    .max(limite * 4)
    .nullable();

export const esquemaDadosDaMesa = z.strictObject({
  nome: textoOpcional(LIMITES_DA_MESA_NA_API.nome),
  area: textoOpcional(LIMITES_DA_MESA_NA_API.area),
});

export const esquemaCriarMesa = z.strictObject({ ...esquemaDadosDaMesa.shape, numero });
export const esquemaRenumerarMesa = z.strictObject({ numero });
export const esquemaSituacaoDaMesa = z.strictObject({ ativa: z.boolean() });

export const esquemaLinkDaMesa = z.strictObject({
  slug: z.string().min(1).max(80),
  numero: z.coerce
    .number()
    .int()
    .min(LIMITES_DA_MESA_NA_API.numeroMinimo)
    .max(LIMITES_DA_MESA_NA_API.numeroMaximo),
});

export const esquemaCodigoNoLink = z.strictObject({ c: z.string().max(64).default('') });

export const esquemaSlugDoAdmin = z.strictObject({ slug: z.string().min(1).max(80) });

export interface MesaNaApi {
  readonly id: string;
  readonly numero: number;
  readonly nome: string | null;
  readonly area: string | null;
  readonly ativa: boolean;
  readonly link: string;
}

export interface RespostaMesasDoPainel {
  readonly slug: string;
  readonly limite: number;
  readonly mesas: readonly MesaNaApi[];
}

export interface RespostaSessaoDeMesa {
  readonly slug: string;
  readonly numero: number;
  readonly expiraEm: string;
}

export interface MesaNoAdmin {
  readonly numero: number;
  readonly nome: string | null;
  readonly area: string | null;
  readonly ativa: boolean;
  readonly link: string;
}

export interface RespostaMesasNoAdmin {
  readonly nomeDoRestaurante: string;
  readonly slug: string;
  readonly mesas: readonly MesaNoAdmin[];
}
