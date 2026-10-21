import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const FIXTURE = fileURLToPath(new URL('../teste/fixtures/falha-nao-tratada.ts', import.meta.url));

describe('tratadores de falha do processo', () => {
  it('reporta a rejeição não tratada no log e encerra com código 1', () => {
    const resultado = spawnSync(process.execPath, [FIXTURE], { encoding: 'utf8', timeout: 10_000 });

    expect(resultado.status).toBe(1);
    expect(resultado.stdout).toContain('SISTEMA_FALHA_NAO_TIPADA');
    expect(resultado.stdout).toContain('Falha não tratada; o processo será encerrado');
  });
});
