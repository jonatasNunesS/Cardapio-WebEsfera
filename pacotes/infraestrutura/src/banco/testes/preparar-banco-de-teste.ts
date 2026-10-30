import { readFileSync } from 'node:fs';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { migrarPorUrl, TRILHA_INTERMEDIARIA } from '../migracoes/migrador.ts';

const RAIZ = new URL('../../../../../', import.meta.url);
export const PASTA_MIGRACOES = new URL('banco/migracoes/', RAIZ).pathname;
export const PASTA_MIGRACOES_INTERMEDIARIO = new URL('banco/migracoes-intermediario/', RAIZ).pathname;
const PAPEIS_SQL = readFileSync(new URL('banco/papeis.sql', RAIZ), 'utf8');

export interface BancoDeTeste {
  readonly nome: string;
  readonly urlAdmin: string;
  readonly urlApi: string;
  readonly urlWorker: string;
  readonly urlMigracao: string;
}

declare module 'vitest' {
  export interface ProvidedContext {
    bancoDeTeste: BancoDeTeste;
    urlRedisDeTeste: string;
  }
}

const SENHAS = {
  cardapio_migracao: process.env.SENHA_BANCO_MIGRACAO ?? 'migracao_local',
  cardapio_api: process.env.SENHA_BANCO_API ?? 'api_local',
  cardapio_worker: process.env.SENHA_BANCO_WORKER ?? 'worker_local',
} as const;

export const MEMBROS = [
  'GRANT cardapio_dono TO cardapio_migracao WITH INHERIT TRUE, SET TRUE',
  'GRANT app_runtime TO cardapio_api WITH INHERIT TRUE',
  'GRANT app_runtime TO cardapio_worker WITH INHERIT TRUE',
  'GRANT app_sistema TO cardapio_worker WITH INHERIT FALSE, SET TRUE',
];

function urlCom(base: URL, usuario: string, senha: string, banco: string): string {
  const url = new URL(base);
  url.username = usuario;
  url.password = senha;
  url.pathname = `/${banco}`;
  return url.toString();
}

async function comAdmin<T>(url: string, executar: (cliente: pg.Client) => Promise<T>): Promise<T> {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    return await executar(cliente);
  } finally {
    await cliente.end();
  }
}

export async function prepararPapeisEUsuarios(cliente: pg.Client): Promise<void> {
  await cliente.query(PAPEIS_SQL);
  for (const [usuario, senha] of Object.entries(SENHAS)) {
    const { rowCount } = await cliente.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [usuario]);
    if (rowCount === 0) {
      await cliente.query(`CREATE ROLE ${cliente.escapeIdentifier(usuario)} LOGIN`);
    }
    await cliente.query(
      `ALTER ROLE ${cliente.escapeIdentifier(usuario)} WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD ${cliente.escapeLiteral(senha)}`,
    );
  }
  for (const comando of MEMBROS) {
    await cliente.query(comando);
  }
}

export async function criarBancoVazio(urlAdmin: URL, nome: string): Promise<string> {
  await comAdmin(urlAdmin.toString(), (cliente) =>
    cliente.query(`CREATE DATABASE ${cliente.escapeIdentifier(nome)}`),
  );
  const urlDoBanco = new URL(urlAdmin);
  urlDoBanco.pathname = `/${nome}`;
  await comAdmin(urlDoBanco.toString(), prepararPapeisEUsuarios);
  return urlDoBanco.toString();
}

export async function apagarBanco(urlAdmin: URL, nome: string): Promise<void> {
  await comAdmin(urlAdmin.toString(), (cliente) =>
    cliente.query(`DROP DATABASE IF EXISTS ${cliente.escapeIdentifier(nome)} WITH (FORCE)`),
  );
}

export function urlAdminDeTeste(): URL {
  return new URL(
    process.env.URL_BANCO_TESTE_ADMIN ?? 'postgres://cardapio:cardapio_local@127.0.0.1:5432/postgres',
  );
}

export default async function preparar(projeto: TestProject): Promise<() => Promise<void>> {
  const urlAdmin = urlAdminDeTeste();
  const nome = `cardapio_teste_${String(Date.now())}_${String(process.pid)}`;
  const urlDoBanco = await criarBancoVazio(urlAdmin, nome);
  const urlMigracao = urlCom(urlAdmin, 'cardapio_migracao', SENHAS.cardapio_migracao, nome);
  await migrarPorUrl(urlMigracao, PASTA_MIGRACOES);
  await migrarPorUrl(urlMigracao, PASTA_MIGRACOES_INTERMEDIARIO, TRILHA_INTERMEDIARIA);
  projeto.provide('bancoDeTeste', {
    nome,
    urlAdmin: urlDoBanco,
    urlApi: urlCom(urlAdmin, 'cardapio_api', SENHAS.cardapio_api, nome),
    urlWorker: urlCom(urlAdmin, 'cardapio_worker', SENHAS.cardapio_worker, nome),
    urlMigracao,
  });
  projeto.provide('urlRedisDeTeste', process.env.URL_REDIS_TESTE ?? 'redis://127.0.0.1:6379/15');
  return () => apagarBanco(urlAdmin, nome);
}
