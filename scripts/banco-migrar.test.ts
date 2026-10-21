import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PASTA_MIGRACOES, urlDeMigracao } from './banco-migrar.ts';

describe('banco:migrar', () => {
  it('aponta para a pasta banco/migracoes', () => {
    expect(existsSync(path.join(PASTA_MIGRACOES, '0001_fundacao.sql'))).toBe(true);
  });

  it('exige URL_BANCO_MIGRACAO', () => {
    expect(() => urlDeMigracao({})).toThrow(/URL_BANCO_MIGRACAO/);
    expect(() => urlDeMigracao({ URL_BANCO_MIGRACAO: '' })).toThrow(/URL_BANCO_MIGRACAO/);
  });

  it('usa a URL recebida', () => {
    expect(urlDeMigracao({ URL_BANCO_MIGRACAO: 'postgres://m@h/db' })).toBe('postgres://m@h/db');
  });
});
