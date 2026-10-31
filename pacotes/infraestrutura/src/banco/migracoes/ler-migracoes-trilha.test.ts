import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CODIGOS } from '@cardapio/aplicacao';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lerMigracoes } from './ler-migracoes.ts';

const CABECALHO = "SET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '60s';\n";
let pasta = '';

beforeEach(() => {
  pasta = mkdtempSync(path.join(tmpdir(), 'ler-migracoes-trilha-'));
});

afterEach(() => {
  rmSync(pasta, { recursive: true, force: true });
});

describe('lerMigracoes com numeração inicial da trilha', () => {
  it('aceita a trilha que começa em 0900', () => {
    writeFileSync(path.join(pasta, '0900_intermediario_a.sql'), `${CABECALHO}SELECT 1;`);
    writeFileSync(path.join(pasta, '0901_intermediario_b.sql'), `${CABECALHO}SELECT 2;`);

    expect(lerMigracoes(pasta, 900).map((migracao) => migracao.numero)).toEqual([900, 901]);
  });

  it('recusa a trilha que não começa no número dela', () => {
    writeFileSync(path.join(pasta, '0901_intermediario_b.sql'), `${CABECALHO}SELECT 2;`);

    expect(() => lerMigracoes(pasta, 900)).toThrow(
      expect.objectContaining({ codigo: CODIGOS.BANCO_MIGRACAO_INVALIDA }),
    );
  });
});
