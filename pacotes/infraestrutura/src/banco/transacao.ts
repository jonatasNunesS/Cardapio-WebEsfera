import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { traduzirErroDoBanco, type ContextoDoBanco } from './erros.ts';
import type * as esquema from './esquema/index.ts';

export type BancoDrizzle = NodePgDatabase<typeof esquema> & { readonly $client: Pool };
export type Transacao = Parameters<Parameters<BancoDrizzle['transaction']>[0]>[0];
export type Operacao<T> = (transacao: Transacao) => Promise<T>;

export async function emTransacao<T>(
  banco: BancoDrizzle,
  contexto: ContextoDoBanco,
  operacao: Operacao<T>,
): Promise<T> {
  try {
    return await banco.transaction(operacao);
  } catch (erro) {
    throw traduzirErroDoBanco(erro, contexto);
  }
}
