import { esquemaAmbienteBase } from '@cardapio/config';
import { z } from 'zod';

export const esquemaAmbienteApi = esquemaAmbienteBase.extend({
  PORTA_API: z.coerce.number().int().min(1).max(65535),
  URL_BANCO: z.url(),
  URL_REDIS: z.url(),
});

export type AmbienteApi = z.output<typeof esquemaAmbienteApi>;
