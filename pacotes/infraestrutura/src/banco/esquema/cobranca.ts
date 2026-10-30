import { sql } from 'drizzle-orm';
import { integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { idUuidV7, momento, restauranteId } from './comum.ts';

export const assinaturas = pgTable(
  'assinaturas',
  {
    restauranteId: restauranteId(),
    id: idUuidV7(),
    planoId: uuid('plano_id').notNull(),
    mpAssinaturaId: text('mp_assinatura_id').notNull().unique(),
    situacao: text('situacao', { enum: ['pendente', 'autorizada', 'pausada', 'cancelada'] })
      .notNull()
      .default('pendente'),
    initPoint: text('init_point').notNull(),
    pagoAte: momento('pago_ate'),
    proximaCobrancaEm: momento('proxima_cobranca_em'),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (tabela) => [primaryKey({ columns: [tabela.restauranteId, tabela.id] })],
);

export const cobrancas = pgTable(
  'cobrancas',
  {
    restauranteId: restauranteId(),
    id: idUuidV7(),
    assinaturaId: uuid('assinatura_id').notNull(),
    mpCobrancaId: text('mp_cobranca_id').notNull().unique(),
    mpPagamentoId: text('mp_pagamento_id'),
    valorCentavos: integer('valor_centavos').notNull(),
    situacao: text('situacao', {
      enum: ['agendada', 'paga', 'recusada', 'em_retentativa', 'cancelada'],
    }).notNull(),
    venceEm: momento('vence_em').notNull(),
    pagaEm: momento('paga_em'),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (tabela) => [primaryKey({ columns: [tabela.restauranteId, tabela.id] })],
);

export const eventosPagamento = pgTable('eventos_pagamento', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  provedor: text('provedor', { enum: ['mercado_pago'] }).notNull(),
  xRequestId: text('x_request_id').notNull(),
  topico: text('topico').notNull(),
  recursoId: text('recurso_id').notNull(),
  recebidoEm: momento('recebido_em').notNull().defaultNow(),
  emProcessamentoEm: momento('em_processamento_em'),
  processadoEm: momento('processado_em'),
  tentativas: integer('tentativas').notNull().default(0),
  ultimoErroCodigo: text('ultimo_erro_codigo'),
});
