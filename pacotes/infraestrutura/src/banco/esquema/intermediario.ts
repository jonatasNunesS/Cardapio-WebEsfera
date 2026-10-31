import { pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { idUuidV7, momento, restauranteId } from './comum.ts';

// INTERMEDIARIO: tabelas da migração 0901: docs/adr/0017-intermediario-essencial.md
export const suspensoesRestaurante = pgTable(
  'suspensoes_restaurante',
  {
    restauranteId: restauranteId(),
    id: idUuidV7(),
    motivo: text('motivo').notNull(),
    suspensaPor: uuid('suspensa_por').notNull(),
    suspensaEm: momento('suspensa_em').notNull().defaultNow(),
    motivoReativacao: text('motivo_reativacao'),
    reativadaPor: uuid('reativada_por'),
    reativadaEm: momento('reativada_em'),
  },
  (tabela) => [primaryKey({ columns: [tabela.restauranteId, tabela.id] })],
);

export const convites = pgTable(
  'convites',
  {
    restauranteId: restauranteId(),
    id: idUuidV7(),
    usuarioId: uuid('usuario_id').notNull(),
    hashToken: text('hash_token').notNull(),
    criadoPor: uuid('criado_por').notNull(),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    expiraEm: momento('expira_em').notNull(),
    usadoEm: momento('usado_em'),
    invalidadoEm: momento('invalidado_em'),
  },
  (tabela) => [primaryKey({ columns: [tabela.restauranteId, tabela.id] })],
);
