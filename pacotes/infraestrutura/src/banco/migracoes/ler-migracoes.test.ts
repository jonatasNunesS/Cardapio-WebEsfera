import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CODIGOS } from '@cardapio/aplicacao';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lerMigracoes } from './ler-migracoes.ts';

const CABECALHO = "SET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '60s';\n";
let pasta = '';

beforeEach(() => {
  pasta = mkdtempSync(path.join(tmpdir(), 'ler-migracoes-'));
});

afterEach(() => {
  rmSync(pasta, { recursive: true, force: true });
});

describe('lerMigracoes', () => {
  it('lê em ordem, com checksum', () => {
    writeFileSync(path.join(pasta, '0002_b.sql'), `${CABECALHO}SELECT 2;`);
    writeFileSync(path.join(pasta, '0001_a.sql'), `${CABECALHO}SELECT 1;`);

    const migracoes = lerMigracoes(pasta);

    expect(migracoes.map((migracao) => [migracao.numero, migracao.nome])).toEqual([
      [1, 'a'],
      [2, 'b'],
    ]);
    expect(migracoes[0]?.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('recusa numeração com buraco', () => {
    writeFileSync(path.join(pasta, '0001_a.sql'), `${CABECALHO}SELECT 1;`);
    writeFileSync(path.join(pasta, '0003_c.sql'), `${CABECALHO}SELECT 3;`);

    expect(() => lerMigracoes(pasta)).toThrow(
      expect.objectContaining({ codigo: CODIGOS.BANCO_MIGRACAO_INVALIDA }),
    );
  });

  it('recusa migração sem SET lock_timeout e SET statement_timeout no começo', () => {
    writeFileSync(path.join(pasta, '0001_a.sql'), 'CREATE TABLE x (id int);');

    expect(() => lerMigracoes(pasta)).toThrow(/lock_timeout/);
  });

  it('recusa nome fora do padrão', () => {
    writeFileSync(path.join(pasta, '1_Mesas.sql'), `${CABECALHO}SELECT 1;`);

    expect(() => lerMigracoes(pasta)).toThrow(/padrão/);
  });
});
