import type { CategoriaGuardada, Desfecho, PratoGuardado } from '@cardapio/aplicacao';
import { sql, type SQL } from 'drizzle-orm';
import type { Transacao } from '../banco.ts';

export interface LinhaDeCategoria extends Record<string, unknown> {
  readonly id: string;
  readonly nome: string;
  readonly ordem: number;
  readonly versao: number;
}

export interface LinhaDePrato extends Record<string, unknown> {
  readonly id: string;
  readonly categoria_id: string;
  readonly nome: string;
  readonly descricao: string;
  readonly preco_centavos: number;
  readonly disponivel: boolean;
  readonly destaque: boolean;
  readonly ordem: number;
  readonly versao: number;
}

export const COLUNAS_DE_CATEGORIA = sql.raw('id, nome, ordem, versao');
export const COLUNAS_DE_PRATO = sql.raw(
  'id, categoria_id, nome, descricao, preco_centavos, disponivel, destaque, ordem, versao',
);

export function paraCategoria(linha: LinhaDeCategoria): CategoriaGuardada {
  return { id: linha.id, nome: linha.nome, ordem: linha.ordem, versao: linha.versao };
}

export function paraPrato(linha: LinhaDePrato): PratoGuardado {
  return {
    id: linha.id,
    categoriaId: linha.categoria_id,
    nome: linha.nome,
    descricao: linha.descricao,
    precoCentavos: linha.preco_centavos,
    disponivel: linha.disponivel,
    destaque: linha.destaque,
    ordem: linha.ordem,
    versao: linha.versao,
  };
}

export async function semLinhaAtualizada(
  transacao: Transacao,
  tabela: 'categorias' | 'pratos',
  id: string,
): Promise<{ readonly tipo: 'conflito' } | { readonly tipo: 'nao-encontrado' }> {
  const removido = sql.raw(tabela === 'categorias' ? 'removida_em' : 'removido_em');
  const { rows } = await transacao.execute(
    sql`SELECT 1 FROM ${sql.raw(tabela)} WHERE id = ${id} AND ${removido} IS NULL`,
  );
  return rows.length > 0 ? { tipo: 'conflito' } : { tipo: 'nao-encontrado' };
}

export async function categoriaOuFalta(
  transacao: Transacao,
  consulta: SQL,
  id: string,
): Promise<Desfecho<CategoriaGuardada>> {
  const [linha] = (await transacao.execute<LinhaDeCategoria>(consulta)).rows;
  return linha === undefined
    ? semLinhaAtualizada(transacao, 'categorias', id)
    : { tipo: 'ok', valor: paraCategoria(linha) };
}

export async function pratoOuFalta(
  transacao: Transacao,
  consulta: SQL,
  id: string,
): Promise<Desfecho<PratoGuardado>> {
  const [linha] = (await transacao.execute<LinhaDePrato>(consulta)).rows;
  return linha === undefined
    ? semLinhaAtualizada(transacao, 'pratos', id)
    : { tipo: 'ok', valor: paraPrato(linha) };
}
