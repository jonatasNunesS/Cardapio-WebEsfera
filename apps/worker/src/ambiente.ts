import { esquemaAmbienteBase } from '@cardapio/config';
import { z } from 'zod';

export const esquemaAmbienteWorker = esquemaAmbienteBase.extend({
  URL_BANCO_WORKER: z.url(),
  URL_REDIS: z.url(),
});

export type AmbienteWorker = z.output<typeof esquemaAmbienteWorker>;
