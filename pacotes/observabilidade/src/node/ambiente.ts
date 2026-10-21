import { z } from 'zod';

const vazioComoAusente = (valor: unknown) => (valor === '' ? undefined : valor);

export const esquemaAmbienteObservabilidade = z.object({
  APP_ENV: z.enum(['local', 'preview', 'homologacao', 'producao']),
  SENTRY_DSN_BACKEND: z.preprocess(vazioComoAusente, z.url().optional()),
  SENTRY_AMOSTRAGEM_TRACES: z.preprocess(vazioComoAusente, z.coerce.number().min(0).max(1).optional()),
  COMMIT_SHA: z.preprocess(
    vazioComoAusente,
    z
      .string()
      .regex(/^[0-9a-f]{7,40}$/)
      .optional(),
  ),
});

export type AmbienteObservabilidade = z.output<typeof esquemaAmbienteObservabilidade>;
