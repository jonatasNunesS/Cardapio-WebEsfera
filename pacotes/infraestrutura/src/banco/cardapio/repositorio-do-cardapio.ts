import type { RepositorioDoCardapio } from '@cardapio/aplicacao';
import { sql } from 'drizzle-orm';
import type { AcessoAoBanco } from '../banco.ts';
import { atualizarCategoria, inserirCategoria, marcarCategoriaRemovida } from './categorias.ts';
import {
  COLUNAS_DE_CATEGORIA,
  COLUNAS_DE_PRATO,
  paraCategoria,
  paraPrato,
  type LinhaDeCategoria,
  type LinhaDePrato,
} from './linhas.ts';
import { moverItem } from './mover.ts';
import { atualizarPrato, atualizarSituacao, inserirPrato, marcarPratoRemovido } from './pratos.ts';

export function criarRepositorioDoCardapio(banco: AcessoAoBanco): RepositorioDoCardapio {
  return {
    listar: (restauranteId) =>
      banco.comRestaurante(restauranteId, async (transacao) => {
        const categorias = await transacao.execute<LinhaDeCategoria>(
          sql`SELECT ${COLUNAS_DE_CATEGORIA} FROM categorias WHERE removida_em IS NULL ORDER BY ordem, id`,
        );
        const pratos = await transacao.execute<LinhaDePrato>(
          sql`SELECT ${COLUNAS_DE_PRATO} FROM pratos WHERE removido_em IS NULL ORDER BY ordem, id`,
        );
        return { categorias: categorias.rows.map(paraCategoria), pratos: pratos.rows.map(paraPrato) };
      }),
    criarCategoria: (restauranteId, nome) =>
      banco.comRestaurante(restauranteId, (transacao) => inserirCategoria(transacao, nome)),
    editarCategoria: (restauranteId, item, nome) =>
      banco.comRestaurante(restauranteId, (transacao) => atualizarCategoria(transacao, item, nome)),
    removerCategoria: (restauranteId, item) =>
      banco.comRestaurante(restauranteId, (transacao) => marcarCategoriaRemovida(transacao, item)),
    criarPrato: (restauranteId, prato) =>
      banco.comRestaurante(restauranteId, (transacao) => inserirPrato(transacao, prato)),
    editarPrato: (restauranteId, item, prato) =>
      banco.comRestaurante(restauranteId, (transacao) => atualizarPrato(transacao, item, prato)),
    alterarSituacaoDoPrato: (restauranteId, situacao) =>
      banco.comRestaurante(restauranteId, (transacao) => atualizarSituacao(transacao, situacao)),
    removerPrato: (restauranteId, item) =>
      banco.comRestaurante(restauranteId, (transacao) => marcarPratoRemovido(transacao, item)),
    mover: (restauranteId, movimento) =>
      banco.comRestaurante(restauranteId, (transacao) => moverItem(transacao, movimento)),
  };
}
