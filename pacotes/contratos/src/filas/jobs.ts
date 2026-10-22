import { z } from 'zod';

export const NOMES_DAS_FILAS = ['pagamentos', 'midia', 'notificacoes', 'caixa-saida', 'rotinas'] as const;

export type NomeDaFila = (typeof NOMES_DAS_FILAS)[number];

const envelope = {
  idRastreio: z.uuid().optional(),
  restauranteId: z.uuid().optional(),
};

export const JOBS = {
  'publicar-caixa-saida': { fila: 'caixa-saida', esquema: z.strictObject({ ...envelope }) },
  'expirar-sessoes-mesa': { fila: 'rotinas', esquema: z.strictObject({ ...envelope }) },
} as const satisfies Record<string, { fila: NomeDaFila; esquema: z.ZodType }>;

export type NomeDoJob = keyof typeof JOBS;

export type DadosDoJob<N extends NomeDoJob> = z.infer<(typeof JOBS)[N]['esquema']>;

export const PADRAO_DO_ID_DO_JOB = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/i;
