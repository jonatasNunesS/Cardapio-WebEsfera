import { camposDoArmazenamento, esquemaAmbienteBase } from '@cardapio/config';
import { z } from 'zod';

export const esquemaAmbienteApi = esquemaAmbienteBase.extend({
  PORTA_API: z.coerce.number().int().min(1).max(65535),
  URL_BANCO_API: z.url(),
  URL_REDIS: z.url(),
  DOMINIO_CARDAPIO: z.string().min(1),
  DOMINIO_PAINEL: z.string().min(1),
  DOMINIO_ADMIN: z.string().min(1),
  URL_PAINEL: z.url(),
  CHAVE_CIFRA_TOTP: z.base64().length(44),
  PROXIES_CONFIAVEIS: z.string().optional(),
  ...camposDoArmazenamento,
});

export type AmbienteApi = z.output<typeof esquemaAmbienteApi>;
