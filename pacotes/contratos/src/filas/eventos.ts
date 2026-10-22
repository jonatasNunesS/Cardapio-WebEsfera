import { z } from 'zod';

export const EVENTOS = {
  SessaoMesaExpirada: z.strictObject({
    versao: z.literal(1),
    sessaoMesaId: z.uuid(),
    mesaId: z.uuid(),
  }),
} as const;

export type TipoDeEvento = keyof typeof EVENTOS;

export type CargaDoEvento<T extends TipoDeEvento> = z.infer<(typeof EVENTOS)[T]>;

export const esquemaMensagemTempoReal = z.strictObject({
  id: z.uuid(),
  tipo: z.string().regex(/^[A-Z][A-Za-z]+$/),
  restaurante_id: z.uuid(),
  ocorrido_em: z.iso.datetime(),
  versao: z.number().int().positive(),
  dados: z.record(z.string(), z.unknown()),
});

export type MensagemTempoReal = z.infer<typeof esquemaMensagemTempoReal>;

export function ehTipoDeEvento(tipo: string): tipo is TipoDeEvento {
  return Object.hasOwn(EVENTOS, tipo);
}
