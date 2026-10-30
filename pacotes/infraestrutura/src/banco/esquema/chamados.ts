import { pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { idUuidV7, momento, restauranteId } from './comum.ts';

export const chamados = pgTable(
  'chamados',
  {
    restauranteId: restauranteId(),
    id: idUuidV7(),
    sessaoMesaId: uuid('sessao_mesa_id').notNull(),
    mesaId: uuid('mesa_id').notNull(),
    tipo: text('tipo', { enum: ['garcom', 'conta'] }).notNull(),
    situacao: text('situacao', { enum: ['aguardando', 'em_atendimento', 'concluido', 'cancelado'] })
      .notNull()
      .default('aguardando'),
    chaveIdempotencia: uuid('chave_idempotencia').notNull(),
    assumidoPor: uuid('assumido_por'),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (tabela) => [primaryKey({ columns: [tabela.restauranteId, tabela.id] })],
);
