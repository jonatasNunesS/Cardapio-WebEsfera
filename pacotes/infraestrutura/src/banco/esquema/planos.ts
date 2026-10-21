import { sql } from 'drizzle-orm';
import { boolean, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { momento } from './comum.ts';

export const planos = pgTable('planos', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  codigo: text('codigo').notNull().unique(),
  nome: text('nome').notNull(),
  precoCentavos: integer('preco_centavos').notNull(),
  limiteMesas: integer('limite_mesas').notNull(),
  recursos: jsonb('recursos').notNull().default({}),
  mpPlanoId: text('mp_plano_id'),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: momento('criado_em').notNull().defaultNow(),
});
