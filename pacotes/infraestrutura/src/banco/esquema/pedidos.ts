import { integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { idUuidV7, momento, restauranteId } from './comum.ts';

export const contadoresPedido = pgTable('contadores_pedido', {
  restauranteId: uuid('restaurante_id').primaryKey(),
  ultimoNumero: integer('ultimo_numero').notNull(),
});

export const pedidos = pgTable(
  'pedidos',
  {
    restauranteId: restauranteId(),
    id: idUuidV7(),
    sessaoMesaId: uuid('sessao_mesa_id').notNull(),
    mesaId: uuid('mesa_id').notNull(),
    numero: integer('numero').notNull(),
    situacao: text('situacao', { enum: ['enviado', 'em_preparo', 'pronto', 'entregue', 'cancelado'] })
      .notNull()
      .default('enviado'),
    totalCentavos: integer('total_centavos').notNull(),
    chaveIdempotencia: uuid('chave_idempotencia').notNull(),
    hashConteudo: text('hash_conteudo').notNull(),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (tabela) => [primaryKey({ columns: [tabela.restauranteId, tabela.id] })],
);

export const itensPedido = pgTable(
  'itens_pedido',
  {
    restauranteId: restauranteId(),
    id: idUuidV7(),
    pedidoId: uuid('pedido_id').notNull(),
    pratoId: uuid('prato_id').notNull(),
    nomeNoMomento: text('nome_no_momento').notNull(),
    precoNoMomentoCentavos: integer('preco_no_momento_centavos').notNull(),
    quantidade: integer('quantidade').notNull(),
    observacao: text('observacao').notNull().default(''),
  },
  (tabela) => [primaryKey({ columns: [tabela.restauranteId, tabela.id] })],
);
