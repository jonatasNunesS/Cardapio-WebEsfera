import type { RelatorDeErros } from '@cardapio/aplicacao';
import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import { inject } from 'vitest';
import { criarBanco, type AcessoAoBanco, type OpcoesDoBanco } from '../banco.ts';
import { restaurantes, historicoSlugs } from '../esquema/index.ts';

export type Usuario = 'api' | 'worker';

export interface RelatorDeTeste extends RelatorDeErros {
  readonly reportados: unknown[];
}

export function criarRelatorDeTeste(): RelatorDeTeste {
  const reportados: unknown[] = [];
  return {
    reportados,
    reportar(erro) {
      reportados.push(erro);
      return uuidv7();
    },
    registrarPasso: () => undefined,
  };
}

export function abrirBanco(
  usuario: Usuario,
  extras: Partial<OpcoesDoBanco> = {},
  maxConexoes = 4,
): AcessoAoBanco {
  const bancoDeTeste = inject('bancoDeTeste');
  const url = usuario === 'api' ? bancoDeTeste.urlApi : bancoDeTeste.urlWorker;
  return criarBanco({
    runtime: { url, nomeAplicacao: `teste-${usuario}`, maxConexoes },
    ...(usuario === 'worker' ? { sistema: { url, nomeAplicacao: 'teste-worker-sistema', maxConexoes } } : {}),
    relator: criarRelatorDeTeste(),
    ...extras,
  });
}

export async function consultarComoAdmin<T extends pg.QueryResultRow>(
  texto: string,
  valores: unknown[] = [],
): Promise<T[]> {
  const cliente = new pg.Client({ connectionString: inject('bancoDeTeste').urlAdmin });
  await cliente.connect();
  try {
    return (await cliente.query<T>(texto, valores)).rows;
  } finally {
    await cliente.end();
  }
}

let sequencia = 0;

export function sufixoUnico(): string {
  sequencia += 1;
  return `${String(Date.now()).slice(-6)}${String(process.pid)}${String(sequencia)}`;
}

export async function criarRestauranteDeTeste(
  banco: AcessoAoBanco,
  situacao: 'teste' | 'cancelado' = 'teste',
) {
  const id = uuidv7();
  const slug = `restaurante-${sufixoUnico()}`;
  await banco.comRestaurante(id, async (transacao) => {
    await transacao.insert(restaurantes).values({ id, slug, nome: `Restaurante ${slug}`, situacao });
    await transacao.insert(historicoSlugs).values({ restauranteId: id, slug });
  });
  return { id, slug };
}
