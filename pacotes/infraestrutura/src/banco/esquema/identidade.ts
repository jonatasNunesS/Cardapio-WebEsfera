import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { idUuidV7, momento, restauranteId } from './comum.ts';
import { restaurantes } from './restaurantes.ts';

const idPrimario = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);

export const usuarios = pgTable('usuarios', {
  id: idPrimario(),
  nome: text('nome').notNull(),
  email: text('email').notNull().unique(),
  hashSenha: text('hash_senha').notNull(),
  criadoEm: momento('criado_em').notNull().defaultNow(),
  atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
});

export const vinculos = pgTable(
  'vinculos',
  {
    restauranteId: restauranteId().references(() => restaurantes.id),
    id: idUuidV7(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    papel: text('papel', { enum: ['dono', 'gerente', 'garcom', 'cozinha'] }).notNull(),
    criadoEm: momento('criado_em').notNull().defaultNow(),
  },
  (tabela) => [
    primaryKey({ columns: [tabela.restauranteId, tabela.id] }),
    unique().on(tabela.restauranteId, tabela.usuarioId),
    index('vinculos_usuario_idx').on(tabela.usuarioId),
  ],
);

export const administradores = pgTable('administradores', {
  id: idPrimario(),
  nome: text('nome').notNull(),
  email: text('email').notNull().unique(),
  hashSenha: text('hash_senha').notNull(),
  papel: text('papel', { enum: ['suporte', 'financeiro', 'dono_plataforma'] }).notNull(),
  trocaDeSenhaObrigatoria: boolean('troca_de_senha_obrigatoria').notNull().default(true),
  segredoTotpCifrado: text('segredo_totp_cifrado'),
  segredoTotpPendenteCifrado: text('segredo_totp_pendente_cifrado'),
  ultimoPassoTotp: bigint('ultimo_passo_totp', { mode: 'number' }).notNull().default(0),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: momento('criado_em').notNull().defaultNow(),
  atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
});

export const codigosRecuperacaoAdmin = pgTable(
  'codigos_recuperacao_admin',
  {
    administradorId: uuid('administrador_id')
      .notNull()
      .references(() => administradores.id),
    id: idUuidV7(),
    hashCodigo: text('hash_codigo').notNull(),
    usadoEm: momento('usado_em'),
    criadoEm: momento('criado_em').notNull().defaultNow(),
  },
  (tabela) => [
    primaryKey({ columns: [tabela.administradorId, tabela.id] }),
    unique().on(tabela.administradorId, tabela.hashCodigo),
  ],
);

export const sessoes = pgTable('sessoes', {
  id: idPrimario(),
  hashId: text('hash_id').notNull().unique(),
  publico: text('publico', { enum: ['painel', 'admin'] }).notNull(),
  usuarioId: uuid('usuario_id').references(() => usuarios.id),
  administradorId: uuid('administrador_id').references(() => administradores.id),
  restauranteAtualId: uuid('restaurante_atual_id').references(() => restaurantes.id),
  nivel: text('nivel', { enum: ['completa', 'segundo_fator', 'cadastro'] }).notNull(),
  criadaEm: momento('criada_em').notNull(),
  ultimoUsoEm: momento('ultimo_uso_em').notNull(),
  expiraEm: momento('expira_em').notNull(),
  revogadaEm: momento('revogada_em'),
});

export const tokensRedefinicaoSenha = pgTable('tokens_redefinicao_senha', {
  id: idPrimario(),
  usuarioId: uuid('usuario_id')
    .notNull()
    .references(() => usuarios.id),
  hashToken: text('hash_token').notNull().unique(),
  criadoEm: momento('criado_em').notNull(),
  expiraEm: momento('expira_em').notNull(),
  usadoEm: momento('usado_em'),
});

export const tentativasLogin = pgTable(
  'tentativas_login',
  {
    publico: text('publico', { enum: ['painel', 'admin'] }).notNull(),
    alvo: text('alvo').notNull(),
    falhas: integer('falhas').notNull(),
    ultimaFalhaEm: momento('ultima_falha_em').notNull(),
  },
  (tabela) => [primaryKey({ columns: [tabela.publico, tabela.alvo] })],
);
