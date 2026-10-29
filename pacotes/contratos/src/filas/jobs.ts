import { z } from 'zod';
import { EVENTOS } from './eventos.ts';

export const NOMES_DAS_FILAS = ['pagamentos', 'midia', 'notificacoes', 'caixa-saida', 'rotinas'] as const;

export type NomeDaFila = (typeof NOMES_DAS_FILAS)[number];

const envelope = {
  idRastreio: z.uuid().optional(),
  restauranteId: z.uuid().optional(),
};

function vindoDoEvento<T extends 'MidiaEnviada' | 'MidiaDescartada'>(tipo: T) {
  return z.strictObject({ ...envelope, eventoId: z.uuid(), tipo: z.literal(tipo), carga: EVENTOS[tipo] });
}

export const JOBS = {
  'publicar-caixa-saida': { fila: 'caixa-saida', esquema: z.strictObject({ ...envelope }) },
  'expirar-sessoes-mesa': { fila: 'rotinas', esquema: z.strictObject({ ...envelope }) },
  'processar-midia': { fila: 'midia', esquema: vindoDoEvento('MidiaEnviada') },
  'descartar-midia': { fila: 'midia', esquema: vindoDoEvento('MidiaDescartada') },
  'apagar-original-midia': { fila: 'midia', esquema: z.strictObject({ ...envelope, midiaId: z.uuid() }) },
} as const satisfies Record<string, { fila: NomeDaFila; esquema: z.ZodType }>;

export type NomeDoJob = keyof typeof JOBS;

export type DadosDoJob<N extends NomeDoJob> = z.infer<(typeof JOBS)[N]['esquema']>;

export const PADRAO_DO_ID_DO_JOB = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/i;
