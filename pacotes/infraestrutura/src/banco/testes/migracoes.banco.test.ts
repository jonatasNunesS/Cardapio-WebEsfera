import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CODIGOS } from '@cardapio/aplicacao';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrarPorUrl, TRILHA_INTERMEDIARIA } from '../migracoes/migrador.ts';
import pg from 'pg';
import {
  apagarBanco,
  criarBancoVazio,
  PASTA_MIGRACOES,
  PASTA_MIGRACOES_INTERMEDIARIO,
  urlAdminDeTeste,
} from './preparar-banco-de-teste.ts';

async function consultarComoAdminEm(urlDoBanco: string, texto: string): Promise<{ total: number }[]> {
  const url = new URL(urlAdminDeTeste());
  url.pathname = new URL(urlDoBanco).pathname;
  const cliente = new pg.Client({ connectionString: url.toString() });
  await cliente.connect();
  try {
    return (await cliente.query<{ total: number }>(texto)).rows;
  } finally {
    await cliente.end();
  }
}

const VERSIONADAS = readdirSync(PASTA_MIGRACOES)
  .filter((arquivo) => arquivo.endsWith('.sql'))
  .sort()
  .map((arquivo) => arquivo.replace(/\.sql$/, ''));
const PROXIMA = String(VERSIONADAS.length + 1).padStart(4, '0');

const nome = `cardapio_migracoes_${String(Date.now())}`;
let urlMigracao = '';
let pastaCopia = '';

beforeAll(async () => {
  const urlDoBanco = new URL(await criarBancoVazio(urlAdminDeTeste(), nome));
  urlDoBanco.username = 'cardapio_migracao';
  urlDoBanco.password = process.env.SENHA_BANCO_MIGRACAO ?? 'migracao_local';
  urlMigracao = urlDoBanco.toString();
  pastaCopia = mkdtempSync(path.join(tmpdir(), 'migracoes-'));
  cpSync(PASTA_MIGRACOES, pastaCopia, { recursive: true });
});

afterAll(async () => {
  rmSync(pastaCopia, { recursive: true, force: true });
  await apagarBanco(urlAdminDeTeste(), nome);
});

describe('16. migrações', () => {
  it('rodam do zero e, rodando de novo, não fazem nada', async () => {
    const primeira = await migrarPorUrl(urlMigracao, pastaCopia);
    const segunda = await migrarPorUrl(urlMigracao, pastaCopia);

    expect(primeira.aplicadas).toEqual(VERSIONADAS);
    expect(VERSIONADAS.slice(0, 5)).toEqual([
      '0001_fundacao',
      '0002_planos_e_restaurantes',
      '0003_mesas',
      '0004_caixa_saida_e_auditoria',
      '0005_resolver_mesa',
    ]);
    expect(segunda).toEqual({ aplicadas: [], jaAplicadas: VERSIONADAS.length });
  });

  it('aplicam uma migração sem transação (índice CONCURRENTLY) por passos', async () => {
    writeFileSync(
      path.join(pastaCopia, `${PROXIMA}_indice_concorrente.sql`),
      [
        '-- cardapio:sem-transacao',
        "SET lock_timeout = '5s';",
        "SET statement_timeout = '60s';",
        '-- cardapio:passo',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS mesas_area_idx ON public.mesas (restaurante_id, area);',
      ].join('\n'),
    );

    await expect(migrarPorUrl(urlMigracao, pastaCopia)).resolves.toEqual({
      aplicadas: [`${PROXIMA}_indice_concorrente`],
      jaAplicadas: VERSIONADAS.length,
    });
  });

  it('falham se o checksum de uma migração já aplicada mudar', async () => {
    const arquivo = path.join(pastaCopia, '0003_mesas.sql');
    writeFileSync(arquivo, `${readFileSync(arquivo, 'utf8')}\n-- alterada depois de aplicada\n`);

    await expect(migrarPorUrl(urlMigracao, pastaCopia)).rejects.toMatchObject({
      codigo: CODIGOS.BANCO_MIGRACAO_ALTERADA,
      contexto: { dados: { numero: 3 } },
    });
  });
});

describe('16b. migrações concorrentes', () => {
  const nomeConcorrente = `cardapio_migracoes_concorrentes_${String(Date.now())}`;
  let urlConcorrente = '';
  let pastaLenta = '';

  beforeAll(async () => {
    const url = new URL(await criarBancoVazio(urlAdminDeTeste(), nomeConcorrente));
    url.username = 'cardapio_migracao';
    url.password = process.env.SENHA_BANCO_MIGRACAO ?? 'migracao_local';
    urlConcorrente = url.toString();
    pastaLenta = mkdtempSync(path.join(tmpdir(), 'migracoes-lentas-'));
    cpSync(PASTA_MIGRACOES, pastaLenta, { recursive: true });
    writeFileSync(
      path.join(pastaLenta, `${PROXIMA}_lenta.sql`),
      "SET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '60s';\nSELECT pg_sleep(0.5);\n",
    );
  });

  afterAll(async () => {
    rmSync(pastaLenta, { recursive: true, force: true });
    await apagarBanco(urlAdminDeTeste(), nomeConcorrente);
  });

  it('duas execuções ao mesmo tempo: uma aplica tudo, a outra espera e não aplica nada', async () => {
    const resultados = await Promise.all([
      migrarPorUrl(urlConcorrente, pastaLenta),
      migrarPorUrl(urlConcorrente, pastaLenta),
    ]);
    const [aplicou, esperou] = [...resultados].sort((a, b) => b.aplicadas.length - a.aplicadas.length);

    expect(aplicou?.aplicadas).toHaveLength(VERSIONADAS.length + 1);
    expect(esperou).toEqual({ aplicadas: [], jaAplicadas: VERSIONADAS.length + 1 });
    const [controle] = await consultarComoAdminEm(
      urlConcorrente,
      'SELECT count(*)::int AS total FROM migracoes.aplicadas',
    );
    expect(controle?.total).toBe(VERSIONADAS.length + 1);
  });
});

// INTERMEDIARIO: trilha 0900 à parte da main: docs/adr/0017-intermediario-essencial.md
const INTERMEDIARIAS = readdirSync(PASTA_MIGRACOES_INTERMEDIARIO)
  .filter((arquivo) => arquivo.endsWith('.sql'))
  .sort()
  .map((arquivo) => arquivo.replace(/\.sql$/, ''));

describe('16c. trilha do intermediário', () => {
  const nomeIntermediario = `cardapio_migracoes_intermediario_${String(Date.now())}`;
  let urlIntermediario = '';
  let pastaDaMain = '';

  beforeAll(async () => {
    const url = new URL(await criarBancoVazio(urlAdminDeTeste(), nomeIntermediario));
    url.username = 'cardapio_migracao';
    url.password = process.env.SENHA_BANCO_MIGRACAO ?? 'migracao_local';
    urlIntermediario = url.toString();
    pastaDaMain = mkdtempSync(path.join(tmpdir(), 'migracoes-main-'));
    cpSync(PASTA_MIGRACOES, pastaDaMain, { recursive: true });
  });

  afterAll(async () => {
    rmSync(pastaDaMain, { recursive: true, force: true });
    await apagarBanco(urlAdminDeTeste(), nomeIntermediario);
  });

  it('aplica a trilha 0900 depois da principal, sem misturar o controle', async () => {
    await migrarPorUrl(urlIntermediario, PASTA_MIGRACOES);
    const intermediaria = await migrarPorUrl(
      urlIntermediario,
      PASTA_MIGRACOES_INTERMEDIARIO,
      TRILHA_INTERMEDIARIA,
    );

    expect(INTERMEDIARIAS[0]).toMatch(/^0900_intermediario_/);
    expect(intermediaria).toEqual({ aplicadas: INTERMEDIARIAS, jaAplicadas: 0 });
  });

  it('a main continua migrando sobre o banco do intermediário', async () => {
    writeFileSync(
      path.join(pastaDaMain, `${PROXIMA}_futura_da_main.sql`),
      [
        "SET LOCAL lock_timeout = '5s';",
        "SET LOCAL statement_timeout = '60s';",
        'ALTER TABLE public.pedidos ADD COLUMN coluna_futura_da_main text;',
        'UPDATE public.pedidos SET situacao = situacao WHERE false;',
      ].join('\n'),
    );

    await expect(migrarPorUrl(urlIntermediario, pastaDaMain)).resolves.toEqual({
      aplicadas: [`${PROXIMA}_futura_da_main`],
      jaAplicadas: VERSIONADAS.length,
    });
    await expect(
      migrarPorUrl(urlIntermediario, PASTA_MIGRACOES_INTERMEDIARIO, TRILHA_INTERMEDIARIA),
    ).resolves.toEqual({ aplicadas: [], jaAplicadas: INTERMEDIARIAS.length });
  });
});
