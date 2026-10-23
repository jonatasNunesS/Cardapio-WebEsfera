import { sql } from 'drizzle-orm';
import { boolean, customType, integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { idUuidV7, momento, restauranteId } from './comum.ts';

const tsvector = customType<{ data: string }>({
  dataType: () => 'tsvector',
});

export const categorias = pgTable(
  'categorias',
  {
    restauranteId: restauranteId(),
    id: idUuidV7(),
    nome: text('nome').notNull(),
    ordem: integer('ordem').notNull(),
    versao: integer('versao').notNull().default(1),
    removidaEm: momento('removida_em'),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (tabela) => [primaryKey({ columns: [tabela.restauranteId, tabela.id] })],
);

export const pratos = pgTable(
  'pratos',
  {
    restauranteId: restauranteId(),
    id: idUuidV7(),
    categoriaId: uuid('categoria_id').notNull(),
    nome: text('nome').notNull(),
    descricao: text('descricao').notNull().default(''),
    precoCentavos: integer('preco_centavos').notNull(),
    disponivel: boolean('disponivel').notNull().default(true),
    destaque: boolean('destaque').notNull().default(false),
    ordem: integer('ordem').notNull(),
    versao: integer('versao').notNull().default(1),
    midiaId: uuid('midia_id'),
    removidoEm: momento('removido_em'),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
    busca: tsvector('busca').generatedAlwaysAs(
      sql`setweight(to_tsvector('portuguese', app.sem_acento(nome)), 'A') || setweight(to_tsvector('portuguese', app.sem_acento(descricao)), 'B')`,
    ),
  },
  (tabela) => [primaryKey({ columns: [tabela.restauranteId, tabela.id] })],
);
