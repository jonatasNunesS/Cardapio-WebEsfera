import { sql } from 'drizzle-orm';
import { bigint, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { idUuidV7, momento, restauranteId } from './comum.ts';

export const restaurantes = pgTable('restaurantes', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  slug: text('slug').notNull().unique(),
  nome: text('nome').notNull(),
  situacao: text('situacao', { enum: ['teste', 'ativo', 'carencia', 'inadimplente', 'cancelado'] })
    .notNull()
    .default('teste'),
  fusoHorario: text('fuso_horario').notNull().default('America/Sao_Paulo'),
  testeTerminaEm: momento('teste_termina_em')
    .notNull()
    .default(sql`now() + interval '10 days'`),
  versaoCardapio: bigint('versao_cardapio', { mode: 'number' }).notNull().default(1),
  criadoEm: momento('criado_em').notNull().defaultNow(),
  atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
});

export const historicoSlugs = pgTable(
  'historico_slugs',
  {
    restauranteId: restauranteId(),
    id: idUuidV7(),
    slug: text('slug').notNull().unique(),
    criadoEm: momento('criado_em').notNull().defaultNow(),
  },
  (tabela) => [primaryKey({ columns: [tabela.restauranteId, tabela.id] })],
);
