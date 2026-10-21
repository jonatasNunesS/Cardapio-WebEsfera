import { CODIGOS, ErroAplicacao } from '@cardapio/aplicacao';
import pg, { type ClientBase } from 'pg';
import { lerMigracoes, MARCA_PASSO, type Migracao } from './ler-migracoes.ts';

const { Client } = pg;

const CHAVE_DA_TRAVA = 7_284_120_001;

export interface RelatorioDeMigracao {
  readonly aplicadas: readonly string[];
  readonly jaAplicadas: number;
}

interface LinhaAplicada {
  readonly numero: number;
  readonly nome: string;
  readonly checksum: string;
}

async function prepararControle(cliente: ClientBase): Promise<void> {
  await cliente.query('SET ROLE cardapio_dono');
  await cliente.query('CREATE SCHEMA IF NOT EXISTS migracoes');
  await cliente.query(`CREATE TABLE IF NOT EXISTS migracoes.aplicadas (
    numero integer PRIMARY KEY,
    nome text NOT NULL,
    checksum text NOT NULL,
    aplicada_em timestamptz NOT NULL DEFAULT now()
  )`);
}

function conferirAplicadas(aplicadas: readonly LinhaAplicada[], migracoes: readonly Migracao[]): void {
  for (const linha of aplicadas) {
    const arquivo = migracoes.find((migracao) => migracao.numero === linha.numero);
    if (arquivo?.checksum !== linha.checksum) {
      throw new ErroAplicacao(
        CODIGOS.BANCO_MIGRACAO_ALTERADA,
        'Uma migração já aplicada foi alterada ou removida; crie uma migração nova em vez de editar',
        {
          modulo: 'banco',
          casoDeUso: 'Migrar',
          entidade: 'migracao',
          dados: { numero: linha.numero, nome: linha.nome },
        },
      );
    }
  }
}

async function registrar(cliente: ClientBase, migracao: Migracao): Promise<void> {
  await cliente.query('INSERT INTO migracoes.aplicadas (numero, nome, checksum) VALUES ($1, $2, $3)', [
    migracao.numero,
    migracao.nome,
    migracao.checksum,
  ]);
}

function falhaAoAplicar(migracao: Migracao, causa: unknown): ErroAplicacao {
  return new ErroAplicacao(
    CODIGOS.BANCO_MIGRACAO_INVALIDA,
    `A migração ${String(migracao.numero).padStart(4, '0')}_${migracao.nome} falhou`,
    {
      modulo: 'banco',
      casoDeUso: 'Migrar',
      entidade: 'migracao',
      dados: { numero: migracao.numero, nome: migracao.nome },
    },
    causa,
  );
}

async function aplicarEmTransacao(cliente: ClientBase, migracao: Migracao): Promise<void> {
  await cliente.query('BEGIN');
  try {
    await cliente.query(migracao.sql);
    await registrar(cliente, migracao);
    await cliente.query('COMMIT');
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw falhaAoAplicar(migracao, erro);
  }
}

async function aplicarSemTransacao(cliente: ClientBase, migracao: Migracao): Promise<void> {
  for (const passo of migracao.sql.split(MARCA_PASSO)) {
    await cliente.query(passo);
  }
  await registrar(cliente, migracao);
}

export async function migrar(cliente: ClientBase, pasta: string): Promise<RelatorioDeMigracao> {
  const migracoes = lerMigracoes(pasta);
  await cliente.query('SELECT pg_advisory_lock($1)', [CHAVE_DA_TRAVA]);
  try {
    await prepararControle(cliente);
    const { rows } = await cliente.query<LinhaAplicada>(
      'SELECT numero, nome, checksum FROM migracoes.aplicadas ORDER BY numero',
    );
    conferirAplicadas(rows, migracoes);
    const pendentes = migracoes.filter((migracao) => !rows.some((linha) => linha.numero === migracao.numero));
    for (const migracao of pendentes) {
      await (migracao.semTransacao
        ? aplicarSemTransacao(cliente, migracao)
        : aplicarEmTransacao(cliente, migracao));
    }
    return {
      aplicadas: pendentes.map((migracao) => `${String(migracao.numero).padStart(4, '0')}_${migracao.nome}`),
      jaAplicadas: rows.length,
    };
  } finally {
    await cliente.query('SELECT pg_advisory_unlock($1)', [CHAVE_DA_TRAVA]);
  }
}

export async function migrarPorUrl(url: string, pasta: string): Promise<RelatorioDeMigracao> {
  const cliente = new Client({ connectionString: url, application_name: 'cardapio-migracoes' });
  await cliente.connect();
  try {
    return await migrar(cliente, pasta);
  } finally {
    await cliente.end();
  }
}
