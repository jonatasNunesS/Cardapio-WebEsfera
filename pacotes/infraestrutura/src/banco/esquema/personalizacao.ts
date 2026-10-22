import { integer, jsonb, pgTable, primaryKey, smallint, text, time, unique } from 'drizzle-orm/pg-core';
import { idUuidV7, momento, restauranteId } from './comum.ts';
import { restaurantes } from './restaurantes.ts';

export interface TextosDaPersonalizacao {
  readonly boasVindas?: string | undefined;
  readonly aoChamarGarcom?: string | undefined;
  readonly restauranteFechado?: string | undefined;
}

export const personalizacoes = pgTable(
  'personalizacoes',
  {
    restauranteId: restauranteId().references(() => restaurantes.id),
    id: idUuidV7(),
    corMarca: text('cor_marca').notNull(),
    corSobreMarca: text('cor_sobre_marca').notNull(),
    corMarcaTexto: text('cor_marca_texto').notNull(),
    logoUrl: text('logo_url'),
    capaUrl: text('capa_url'),
    frase: text('frase').notNull().default(''),
    linkAvaliacaoGoogle: text('link_avaliacao_google'),
    textos: jsonb('textos').$type<TextosDaPersonalizacao>().notNull().default({}),
    versao: integer('versao').notNull().default(1),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (tabela) => [primaryKey({ columns: [tabela.restauranteId, tabela.id] }), unique().on(tabela.restauranteId)],
);

export const horarios = pgTable(
  'horarios',
  {
    restauranteId: restauranteId().references(() => restaurantes.id),
    id: idUuidV7(),
    diaSemana: smallint('dia_semana').notNull(),
    abre: time('abre').notNull(),
    fecha: time('fecha').notNull(),
  },
  (tabela) => [
    primaryKey({ columns: [tabela.restauranteId, tabela.id] }),
    unique().on(tabela.restauranteId, tabela.diaSemana),
  ],
);
