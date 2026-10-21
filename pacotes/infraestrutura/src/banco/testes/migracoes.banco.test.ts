import { cpSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CODIGOS } from '@cardapio/aplicacao';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrarPorUrl } from '../migracoes/migrador.ts';
import { apagarBanco, criarBancoVazio, PASTA_MIGRACOES, urlAdminDeTeste } from './preparar-banco-de-teste.ts';

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

    expect(primeira.aplicadas).toEqual([
      '0001_fundacao',
      '0002_planos_e_restaurantes',
      '0003_mesas',
      '0004_caixa_saida_e_auditoria',
      '0005_resolver_mesa',
    ]);
    expect(segunda).toEqual({ aplicadas: [], jaAplicadas: 5 });
  });

  it('aplicam uma migração sem transação (índice CONCURRENTLY) por passos', async () => {
    writeFileSync(
      path.join(pastaCopia, '0006_indice_concorrente.sql'),
      [
        '-- cardapio:sem-transacao',
        "SET lock_timeout = '5s';",
        "SET statement_timeout = '60s';",
        '-- cardapio:passo',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS mesas_area_idx ON public.mesas (restaurante_id, area);',
      ].join('\n'),
    );

    await expect(migrarPorUrl(urlMigracao, pastaCopia)).resolves.toEqual({
      aplicadas: ['0006_indice_concorrente'],
      jaAplicadas: 5,
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
