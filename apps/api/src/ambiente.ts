import {
  camposDoArmazenamento,
  camposDoMercadoPago,
  esquemaAmbienteBase,
  exigirMercadoPagoReal,
} from '@cardapio/config';
import { z } from 'zod';

export const esquemaAmbienteApi = esquemaAmbienteBase
  .extend({
    PORTA_API: z.coerce.number().int().min(1).max(65535),
    URL_BANCO_API: z.url(),
    URL_REDIS: z.url(),
    DOMINIO_CARDAPIO: z.string().min(1),
    DOMINIO_PAINEL: z.string().min(1),
    DOMINIO_ADMIN: z.string().min(1),
    URL_PAINEL: z.url(),
    CHAVE_CIFRA_TOTP: z.base64().length(44),
    CHAVE_SESSAO_MESA: z.string().min(32),
    PROXIES_CONFIAVEIS: z.string().optional(),
    URL_SENTRY_DO_ADMIN: z.url().optional(),
    ...camposDoArmazenamento,
    ...camposDoMercadoPago,
    MP_WEBHOOK_SECRET: z.string().min(16),
  })
  .refine(exigirMercadoPagoReal, {
    path: ['URL_MERCADO_PAGO'],
    message: 'Fora do ambiente local, só a API real',
  });

export type AmbienteApi = z.output<typeof esquemaAmbienteApi>;
