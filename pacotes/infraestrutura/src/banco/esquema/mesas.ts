import { boolean, integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { idUuidV7, momento, restauranteId } from './comum.ts';

export const mesas = pgTable(
  'mesas',
  {
    restauranteId: restauranteId(),
    id: idUuidV7(),
    numero: integer('numero').notNull(),
    nome: text('nome'),
    area: text('area'),
    codigo: text('codigo').notNull().unique(),
    ativa: boolean('ativa').notNull().default(true),
    codigoGeradoEm: momento('codigo_gerado_em').notNull().defaultNow(),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (tabela) => [primaryKey({ columns: [tabela.restauranteId, tabela.id] })],
);

export const historicoNumerosMesa = pgTable(
  'historico_numeros_mesa',
  {
    restauranteId: restauranteId(),
    id: idUuidV7(),
    mesaId: uuid('mesa_id').notNull(),
    numero: integer('numero').notNull(),
    criadoEm: momento('criado_em').notNull().defaultNow(),
  },
  (tabela) => [primaryKey({ columns: [tabela.restauranteId, tabela.id] })],
);

export const sessoesMesa = pgTable(
  'sessoes_mesa',
  {
    restauranteId: restauranteId(),
    id: idUuidV7(),
    mesaId: uuid('mesa_id').notNull(),
    abertaEm: momento('aberta_em').notNull().defaultNow(),
    expiraEm: momento('expira_em').notNull(),
    fechadaEm: momento('fechada_em'),
  },
  (tabela) => [primaryKey({ columns: [tabela.restauranteId, tabela.id] })],
);
