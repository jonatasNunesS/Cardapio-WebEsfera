import type {
  DadosDoPratoParaGravar,
  Desfecho,
  ItemVersionado,
  PratoGuardado,
  SituacaoDoPrato,
} from '@cardapio/aplicacao';
import { ESPACO_DA_ORDEM } from '@cardapio/dominio';
import { sql } from 'drizzle-orm';
import type { Transacao } from '../banco.ts';
import { COLUNAS_DE_PRATO, paraPrato, pratoOuFalta, type LinhaDePrato } from './linhas.ts';

const fimDaCategoria = (categoriaId: string) => sql`(
  SELECT coalesce(max(ordem), 0) + ${ESPACO_DA_ORDEM} FROM pratos
   WHERE categoria_id = ${categoriaId} AND removido_em IS NULL)`;

async function categoriaAtiva(transacao: Transacao, categoriaId: string): Promise<boolean> {
  const { rows } = await transacao.execute(
    sql`SELECT 1 FROM categorias WHERE id = ${categoriaId} AND removida_em IS NULL FOR SHARE`,
  );
  return rows.length > 0;
}

export async function inserirPrato(
  transacao: Transacao,
  prato: DadosDoPratoParaGravar,
): Promise<Desfecho<PratoGuardado>> {
  if (!(await categoriaAtiva(transacao, prato.categoriaId))) {
    return { tipo: 'categoria-inexistente' };
  }
  const { rows } = await transacao.execute<LinhaDePrato>(sql`
    INSERT INTO pratos (restaurante_id, categoria_id, nome, descricao, preco_centavos, disponivel, destaque, ordem)
    VALUES (app.restaurante_atual(), ${prato.categoriaId}, ${prato.nome}, ${prato.descricao},
            ${prato.precoCentavos}, ${prato.disponivel}, ${prato.destaque}, ${fimDaCategoria(prato.categoriaId)})
    RETURNING ${COLUNAS_DE_PRATO}`);
  const [linha] = rows;
  return linha === undefined ? { tipo: 'categoria-inexistente' } : { tipo: 'ok', valor: paraPrato(linha) };
}

export async function atualizarPrato(
  transacao: Transacao,
  item: ItemVersionado,
  prato: DadosDoPratoParaGravar,
): Promise<Desfecho<PratoGuardado>> {
  if (!(await categoriaAtiva(transacao, prato.categoriaId))) {
    return { tipo: 'categoria-inexistente' };
  }
  return pratoOuFalta(
    transacao,
    sql`UPDATE pratos SET
          ordem = CASE WHEN categoria_id = ${prato.categoriaId} THEN ordem ELSE ${fimDaCategoria(prato.categoriaId)} END,
          categoria_id = ${prato.categoriaId}, nome = ${prato.nome}, descricao = ${prato.descricao},
          preco_centavos = ${prato.precoCentavos}, disponivel = ${prato.disponivel}, destaque = ${prato.destaque},
          versao = versao + 1, atualizado_em = now()
        WHERE id = ${item.id} AND versao = ${item.versao} AND removido_em IS NULL
     RETURNING ${COLUNAS_DE_PRATO}`,
    item.id,
  );
}

export function atualizarSituacao(
  transacao: Transacao,
  situacao: SituacaoDoPrato,
): Promise<Desfecho<PratoGuardado>> {
  return pratoOuFalta(
    transacao,
    sql`UPDATE pratos SET
          disponivel = coalesce(${situacao.disponivel ?? null}::boolean, disponivel),
          destaque = coalesce(${situacao.destaque ?? null}::boolean, destaque),
          versao = versao + 1, atualizado_em = now()
        WHERE id = ${situacao.id} AND versao = ${situacao.versao} AND removido_em IS NULL
     RETURNING ${COLUNAS_DE_PRATO}`,
    situacao.id,
  );
}

export async function marcarPratoRemovido(
  transacao: Transacao,
  item: ItemVersionado,
): Promise<Desfecho<null>> {
  const resultado = await pratoOuFalta(
    transacao,
    sql`UPDATE pratos SET removido_em = now(), versao = versao + 1, atualizado_em = now()
         WHERE id = ${item.id} AND versao = ${item.versao} AND removido_em IS NULL
     RETURNING ${COLUNAS_DE_PRATO}`,
    item.id,
  );
  return resultado.tipo === 'ok' ? { tipo: 'ok', valor: null } : resultado;
}
