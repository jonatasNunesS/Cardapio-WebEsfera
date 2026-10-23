import type { Desfecho, Movimento } from '@cardapio/aplicacao';
import type { ItemOrdenado } from '@cardapio/dominio';
import { sql, type SQL } from 'drizzle-orm';
import type { Transacao } from '../banco.ts';
import { semLinhaAtualizada } from './linhas.ts';

interface LinhaOrdenada extends Record<string, unknown> {
  readonly id: string;
  readonly ordem: number;
  readonly versao: number;
}

async function irmaos(transacao: Transacao, movimento: Movimento): Promise<readonly LinhaOrdenada[]> {
  const filtro: SQL =
    movimento.tipo === 'categoria'
      ? sql`FROM categorias WHERE removida_em IS NULL`
      : sql`FROM pratos WHERE removido_em IS NULL
             AND categoria_id = (SELECT categoria_id FROM pratos WHERE id = ${movimento.id})`;
  const { rows } = await transacao.execute<LinhaOrdenada>(
    sql`SELECT id, ordem, versao ${filtro} ORDER BY ordem, id FOR UPDATE`,
  );
  return rows;
}

export async function moverItem(transacao: Transacao, movimento: Movimento): Promise<Desfecho<null>> {
  const tabela = movimento.tipo === 'categoria' ? 'categorias' : 'pratos';
  const linhas = await irmaos(transacao, movimento);
  const alvo = linhas.find((linha) => linha.id === movimento.id);
  if (alvo?.versao !== movimento.versao) {
    return semLinhaAtualizada(transacao, tabela, movimento.id);
  }
  const itens: ItemOrdenado[] = linhas.map((linha) => ({ id: linha.id, ordem: linha.ordem }));
  for (const mudanca of movimento.planejar(itens)) {
    await transacao.execute(
      sql`UPDATE ${sql.raw(tabela)} SET ordem = ${mudanca.ordem} WHERE id = ${mudanca.id}`,
    );
  }
  await transacao.execute(
    sql`UPDATE ${sql.raw(tabela)} SET versao = versao + 1, atualizado_em = now() WHERE id = ${movimento.id}`,
  );
  return { tipo: 'ok', valor: null };
}
