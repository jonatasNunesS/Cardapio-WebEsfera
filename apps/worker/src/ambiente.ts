import { esquemaAmbienteBase } from '@cardapio/config';
import { z } from 'zod';

export const esquemaAmbienteWorker = esquemaAmbienteBase.extend({
  URL_REDIS: z.url(),
});
