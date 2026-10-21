import pg from 'pg';

const { Pool } = pg;

export interface OpcoesDoPool {
  readonly url: string;
  readonly nomeAplicacao: string;
  readonly maxConexoes?: number;
  readonly limiteConsultaMs?: number;
}

export type AoFalharConexaoOciosa = (erro: Error) => void;

export function criarPool(opcoes: OpcoesDoPool, aoFalharConexaoOciosa: AoFalharConexaoOciosa): pg.Pool {
  const pool = new Pool({
    connectionString: opcoes.url,
    application_name: opcoes.nomeAplicacao,
    max: opcoes.maxConexoes ?? 10,
    statement_timeout: opcoes.limiteConsultaMs ?? 5000,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30_000,
  });
  pool.on('error', aoFalharConexaoOciosa);
  return pool;
}
