import { sql } from 'drizzle-orm';
import { integer, jsonb, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { idUuidV7, momento, restauranteId } from './comum.ts';

export const caixaSaida = pgTable(
  'caixa_saida',
  {
    restauranteId: restauranteId(),
    id: idUuidV7(),
    tipoEvento: text('tipo_evento').notNull(),
    carga: jsonb('carga').notNull(),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    publicadoEm: momento('publicado_em'),
    tentativas: integer('tentativas').notNull().default(0),
  },
  (tabela) => [primaryKey({ columns: [tabela.restauranteId, tabela.id] })],
);

export const auditoria = pgTable('auditoria', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  restauranteId: uuid('restaurante_id'),
  autorTipo: text('autor_tipo', { enum: ['usuario', 'administrador', 'sistema', 'cliente'] }).notNull(),
  autorId: uuid('autor_id'),
  acao: text('acao').notNull(),
  entidade: text('entidade').notNull(),
  entidadeId: uuid('entidade_id'),
  antes: jsonb('antes'),
  depois: jsonb('depois'),
  motivo: text('motivo'),
  criadoEm: momento('criado_em').notNull().defaultNow(),
});
