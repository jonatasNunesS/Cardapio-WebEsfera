import type { CategoriaGuardada, Desfecho, ItemVersionado } from '@cardapio/aplicacao';
import { ESPACO_DA_ORDEM } from '@cardapio/dominio';
import { sql } from 'drizzle-orm';
import type { Transacao } from '../banco.ts';
import { categoriaOuFalta, COLUNAS_DE_CATEGORIA, paraCategoria, type LinhaDeCategoria } from './linhas.ts';

export async function inserirCategoria(
  transacao: Transacao,
  nome: string,
): Promise<Desfecho<CategoriaGuardada>> {
  const { rows } = await transacao.execute<LinhaDeCategoria>(sql`
    INSERT INTO categorias (restaurante_id, nome, ordem)
    SELECT app.restaurante_atual(), ${nome}, coalesce(max(ordem), 0) + ${ESPACO_DA_ORDEM}
      FROM categorias WHERE removida_em IS NULL
    ON CONFLICT (restaurante_id, lower(app.sem_acento(nome))) WHERE removida_em IS NULL DO NOTHING
    RETURNING ${COLUNAS_DE_CATEGORIA}`);
  const [linha] = rows;
  return linha === undefined ? { tipo: 'nome-repetido' } : { tipo: 'ok', valor: paraCategoria(linha) };
}

async function nomeOcupado(transacao: Transacao, id: string, nome: string): Promise<boolean> {
  await transacao.execute(sql`SELECT 1 FROM categorias WHERE removida_em IS NULL FOR UPDATE`);
  const { rows } = await transacao.execute(sql`
    SELECT 1 FROM categorias
     WHERE removida_em IS NULL AND id <> ${id}
       AND lower(app.sem_acento(nome)) = lower(app.sem_acento(${nome}))`);
  return rows.length > 0;
}

export async function atualizarCategoria(
  transacao: Transacao,
  item: ItemVersionado,
  nome: string,
): Promise<Desfecho<CategoriaGuardada>> {
  if (await nomeOcupado(transacao, item.id, nome)) {
    return { tipo: 'nome-repetido' };
  }
  return categoriaOuFalta(
    transacao,
    sql`UPDATE categorias SET nome = ${nome}, versao = versao + 1, atualizado_em = now()
         WHERE id = ${item.id} AND versao = ${item.versao} AND removida_em IS NULL
     RETURNING ${COLUNAS_DE_CATEGORIA}`,
    item.id,
  );
}

export async function marcarCategoriaRemovida(
  transacao: Transacao,
  item: ItemVersionado,
): Promise<Desfecho<null>> {
  const alvo = await categoriaOuFalta(
    transacao,
    sql`SELECT ${COLUNAS_DE_CATEGORIA} FROM categorias
         WHERE id = ${item.id} AND versao = ${item.versao} AND removida_em IS NULL FOR UPDATE`,
    item.id,
  );
  if (alvo.tipo !== 'ok') {
    return alvo;
  }
  const { rows } = await transacao.execute(sql`
    SELECT 1 FROM pratos WHERE categoria_id = ${item.id} AND removido_em IS NULL LIMIT 1`);
  if (rows.length > 0) {
    return { tipo: 'com-pratos' };
  }
  await transacao.execute(sql`
    UPDATE categorias SET removida_em = now(), versao = versao + 1, atualizado_em = now() WHERE id = ${item.id}`);
  return { tipo: 'ok', valor: null };
}
