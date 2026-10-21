import { propagadorNulo, type PropagadorDeContexto, type RelatorDeErros } from '@cardapio/aplicacao';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { comRestaurante } from './com-restaurante.ts';
import { comSistema } from './com-sistema.ts';
import { criarPool, type OpcoesDoPool } from './conexao.ts';
import { falhaDeConexao } from './erros.ts';
import * as esquema from './esquema/index.ts';
import { emTransacao, type BancoDrizzle, type Operacao } from './transacao.ts';

export type { Operacao, Transacao } from './transacao.ts';

export interface OpcoesDoBanco {
  readonly runtime: OpcoesDoPool;
  readonly sistema?: OpcoesDoPool;
  readonly propagador?: PropagadorDeContexto;
  readonly relator: RelatorDeErros;
}

export interface AcessoAoBanco {
  comRestaurante<T>(restauranteId: string, operacao: Operacao<T>): Promise<T>;
  comSistema<T>(operacao: Operacao<T>): Promise<T>;
  semRestaurante<T>(casoDeUso: string, operacao: Operacao<T>): Promise<T>;
  verificarConexao(): Promise<void>;
  encerrar(): Promise<void>;
}

function conectar(opcoes: OpcoesDoPool, relator: RelatorDeErros): BancoDrizzle {
  const pool = criarPool(opcoes, (erro) => {
    relator.reportar(falhaDeConexao(erro, 'conexaoOciosa'));
  });
  return drizzle({ client: pool, schema: esquema });
}

export function criarBanco(opcoes: OpcoesDoBanco): AcessoAoBanco {
  const runtime = conectar(opcoes.runtime, opcoes.relator);
  const sistema = opcoes.sistema === undefined ? undefined : conectar(opcoes.sistema, opcoes.relator);
  const propagador = opcoes.propagador ?? propagadorNulo;

  return {
    comRestaurante: (restauranteId, operacao) => comRestaurante(runtime, propagador, restauranteId, operacao),
    comSistema: (operacao) => comSistema(sistema, propagador, operacao),
    semRestaurante: (casoDeUso, operacao) =>
      emTransacao(runtime, { casoDeUso, escopo: 'sem-restaurante' }, operacao),
    async verificarConexao() {
      try {
        await runtime.execute(sql`SELECT 1`);
      } catch (erro) {
        throw falhaDeConexao(erro, 'verificarConexao');
      }
    },
    async encerrar() {
      await Promise.all([runtime.$client.end(), sistema?.$client.end()]);
    },
  };
}
