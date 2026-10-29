import type { Derivados } from '@cardapio/dominio';
import { bigint, integer, jsonb, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { idUuidV7, momento, restauranteId } from './comum.ts';

export const midias = pgTable(
  'midias',
  {
    restauranteId: restauranteId(),
    id: idUuidV7(),
    pratoId: uuid('prato_id').notNull(),
    tipo: text('tipo', { enum: ['foto', 'video'] }).notNull(),
    situacao: text('situacao', { enum: ['enviando', 'processando', 'pronta', 'falhou'] })
      .notNull()
      .default('enviando'),
    tipoConteudo: text('tipo_conteudo').notNull(),
    tamanhoBytes: bigint('tamanho_bytes', { mode: 'number' }).notNull(),
    caminhoOriginal: text('caminho_original').notNull(),
    tentativa: integer('tentativa').notNull().default(0),
    motivoFalha: text('motivo_falha'),
    derivados: jsonb('derivados').$type<Derivados>(),
    duracaoMs: integer('duracao_ms'),
    processamentoIniciadoEm: momento('processamento_iniciado_em'),
    prontaEm: momento('pronta_em'),
    originalApagadoEm: momento('original_apagado_em'),
    descartadaEm: momento('descartada_em'),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (tabela) => [primaryKey({ columns: [tabela.restauranteId, tabela.id] })],
);
