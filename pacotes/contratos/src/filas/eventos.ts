import { z } from 'zod';

const SITUACOES_DO_RESTAURANTE = ['teste', 'ativo', 'carencia', 'inadimplente', 'cancelado'] as const;
const SITUACOES_DO_PEDIDO = ['enviado', 'em_preparo', 'pronto', 'entregue', 'cancelado'] as const;
const SITUACOES_DO_CHAMADO = ['aguardando', 'em_atendimento', 'concluido', 'cancelado'] as const;

export const EVENTOS = {
  SessaoMesaExpirada: z.strictObject({
    versao: z.literal(1),
    sessaoMesaId: z.uuid(),
    mesaId: z.uuid(),
  }),
  MidiaEnviada: z.strictObject({
    versao: z.literal(1),
    midiaId: z.uuid(),
    tentativa: z.number().int().positive(),
  }),
  MidiaDescartada: z.strictObject({
    versao: z.literal(1),
    midiaId: z.uuid(),
  }),
  PedidoCriado: z.strictObject({
    versao: z.literal(1),
    pedidoId: z.uuid(),
    numero: z.number().int().positive(),
    mesaId: z.uuid(),
  }),
  PedidoCancelado: z.strictObject({
    versao: z.literal(1),
    pedidoId: z.uuid(),
    numero: z.number().int().positive(),
    mesaId: z.uuid(),
  }),
  ChamadoCriado: z.strictObject({
    versao: z.literal(1),
    chamadoId: z.uuid(),
    tipo: z.enum(['garcom', 'conta']),
    mesaId: z.uuid(),
  }),
  ChamadoCancelado: z.strictObject({
    versao: z.literal(1),
    chamadoId: z.uuid(),
    tipo: z.enum(['garcom', 'conta']),
    mesaId: z.uuid(),
  }),
  PedidoSituacaoAlterada: z.strictObject({
    versao: z.literal(1),
    pedidoId: z.uuid(),
    numero: z.number().int().positive(),
    mesaId: z.uuid(),
    sessaoMesaId: z.uuid(),
    de: z.enum(SITUACOES_DO_PEDIDO),
    para: z.enum(SITUACOES_DO_PEDIDO),
  }),
  ChamadoSituacaoAlterada: z.strictObject({
    versao: z.literal(1),
    chamadoId: z.uuid(),
    tipo: z.enum(['garcom', 'conta']),
    mesaId: z.uuid(),
    sessaoMesaId: z.uuid(),
    de: z.enum(SITUACOES_DO_CHAMADO),
    para: z.enum(SITUACOES_DO_CHAMADO),
  }),
  SessaoMesaEncerrada: z.strictObject({
    versao: z.literal(1),
    sessaoMesaId: z.uuid(),
    mesaId: z.uuid(),
  }),
  AssinaturaAlterada: z.strictObject({
    versao: z.literal(1),
    assinaturaId: z.uuid(),
    situacao: z.enum(['pendente', 'autorizada', 'pausada', 'cancelada']),
  }),
  RestauranteSituacaoAlterada: z.strictObject({
    versao: z.literal(1),
    de: z.enum(SITUACOES_DO_RESTAURANTE),
    para: z.enum(SITUACOES_DO_RESTAURANTE),
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
