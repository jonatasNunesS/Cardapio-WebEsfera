import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MEMBROS } from './preparar-banco-de-teste.ts';

const USUARIOS_SQL = readFileSync(new URL('../../../../../banco/usuarios.sql', import.meta.url), 'utf8');

describe('usuários de login', () => {
  it.each(MEMBROS)('os testes e banco/usuarios.sql concedem o mesmo: %s', (comando) => {
    expect(USUARIOS_SQL).toContain(`${comando};`);
  });

  it('banco/usuarios.sql não concede nada além do que os testes usam', () => {
    expect(USUARIOS_SQL.match(/^GRANT /gm)).toHaveLength(MEMBROS.length);
  });
});
