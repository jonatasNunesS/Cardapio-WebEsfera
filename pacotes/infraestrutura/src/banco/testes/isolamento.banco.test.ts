import { ErroIsolamentoInquilino } from '@cardapio/aplicacao';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AcessoAoBanco } from '../banco.ts';
import { abrirBanco, consultarComoAdmin, criarRestauranteDeTeste, type Usuario } from './apoio.ts';
import { FABRICAS, type Fabrica } from './fabricas/index.ts';

type Comando = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

async function permissoesDoRuntime(): Promise<Map<string, Set<Comando>>> {
  const linhas = await consultarComoAdmin<{ tabela: string; comando: Comando }>(
    `SELECT table_name AS tabela, privilege_type AS comando FROM information_schema.role_table_grants
      WHERE grantee = 'app_runtime' AND table_schema = 'public'`,
  );
  const mapa = new Map<string, Set<Comando>>();
  for (const linha of linhas) {
    mapa.set(linha.tabela, (mapa.get(linha.tabela) ?? new Set<Comando>()).add(linha.comando));
  }
  return mapa;
}

const contarDoOutro = (fabrica: Fabrica, outro: string) =>
  sql`SELECT count(*)::int AS total FROM ${sql.identifier(fabrica.tabela)} WHERE ${sql.identifier(fabrica.colunaDoRestaurante)} = ${outro}`;

describe.each<Usuario>(['api', 'worker'])('acesso cruzado com o usuário %s', (usuario) => {
  let banco: AcessoAoBanco;
  let permissoes: Map<string, Set<Comando>>;
  let restauranteA = '';
  let restauranteB = '';

  beforeAll(async () => {
    banco = abrirBanco(usuario);
    permissoes = await permissoesDoRuntime();
    restauranteA = (await criarRestauranteDeTeste(banco)).id;
    restauranteB = (await criarRestauranteDeTeste(banco)).id;
    for (const fabrica of FABRICAS.filter((item) => item.tabela !== 'restaurantes')) {
      await banco.comRestaurante(restauranteA, (transacao) => fabrica.criar(transacao, restauranteA));
      await banco.comRestaurante(restauranteB, (transacao) => fabrica.criar(transacao, restauranteB));
    }
  });

  afterAll(async () => {
    await banco.encerrar();
  });

  describe.each(FABRICAS.map((fabrica) => [fabrica.tabela, fabrica] as const))('%s', (_tabela, fabrica) => {
    const pode = (comando: Comando) => permissoes.get(fabrica.tabela)?.has(comando) === true;

    it('nenhuma linha de B aparece dentro de A', async () => {
      const ler = banco.comRestaurante(restauranteA, (transacao) =>
        transacao.execute(contarDoOutro(fabrica, restauranteB)),
      );
      if (!pode('SELECT')) {
        await expect(ler).rejects.toBeInstanceOf(ErroIsolamentoInquilino);
        return;
      }
      const resultado = await ler;
      expect(resultado.rows[0]).toEqual({ total: 0 });
      const [dB] = await consultarComoAdmin<{ total: number }>(
        `SELECT count(*)::int AS total FROM ${fabrica.tabela} WHERE ${fabrica.colunaDoRestaurante} = $1`,
        [restauranteB],
      );
      expect(dB?.total).toBeGreaterThan(0);
    });

    it.each<Comando>(['UPDATE', 'DELETE'])('%s em linhas de B afeta zero linhas', async (comando) => {
      const coluna = sql.identifier(fabrica.colunaDoRestaurante);
      const consulta =
        comando === 'UPDATE'
          ? sql`UPDATE ${sql.identifier(fabrica.tabela)} SET ${coluna} = ${coluna} WHERE ${coluna} = ${restauranteB}`
          : sql`DELETE FROM ${sql.identifier(fabrica.tabela)} WHERE ${coluna} = ${restauranteB}`;
      const executar = banco.comRestaurante(restauranteA, (transacao) => transacao.execute(consulta));
      if (!pode(comando)) {
        await expect(executar).rejects.toBeInstanceOf(ErroIsolamentoInquilino);
        return;
      }
      expect((await executar).rowCount).toBe(0);
    });

    it('INSERT com o restaurante_id de B falha com ErroIsolamentoInquilino', async () => {
      await expect(
        banco.comRestaurante(restauranteA, (transacao) => fabrica.criar(transacao, restauranteB)),
      ).rejects.toBeInstanceOf(ErroIsolamentoInquilino);
    });

    it('sem contexto, a tabela devolve zero linhas', async () => {
      const ler = banco.semRestaurante('teste', (transacao) =>
        transacao.execute(sql`SELECT count(*)::int AS total FROM ${sql.identifier(fabrica.tabela)}`),
      );
      if (!pode('SELECT')) {
        await expect(ler).rejects.toBeInstanceOf(ErroIsolamentoInquilino);
        return;
      }
      expect((await ler).rows[0]).toEqual({ total: 0 });
    });
  });
});

describe('contexto entre transações', () => {
  it('9. com uma conexão só, a transação seguinte sem contexto não enxerga A', async () => {
    const banco = abrirBanco('api', {}, 1);
    const restaurante = await criarRestauranteDeTeste(banco);
    const comA = await banco.comRestaurante(restaurante.id, (transacao) =>
      transacao.execute(sql`SELECT count(*)::int AS total FROM restaurantes`),
    );
    const semContexto = await banco.semRestaurante('teste', (transacao) =>
      transacao.execute(
        sql`SELECT count(*)::int AS total, current_setting('app.restaurante_id', true) AS valor FROM restaurantes`,
      ),
    );
    await banco.encerrar();

    expect(comA.rows[0]).toEqual({ total: 1 });
    expect(semContexto.rows[0]).toEqual({ total: 0, valor: '' });
  });
});
