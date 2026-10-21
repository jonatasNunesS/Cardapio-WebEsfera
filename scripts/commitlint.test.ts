import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const RAIZ = fileURLToPath(new URL('../', import.meta.url));
const COMMITLINT = path.join(RAIZ, 'node_modules', '.bin', 'commitlint');
const FOGUETE = String.fromCodePoint(0x1f680);

function validarMensagem(mensagem: string) {
  return spawnSync(COMMITLINT, [], { cwd: RAIZ, input: mensagem, encoding: 'utf8' });
}

describe('commitlint', () => {
  it('aceita um commit convencional sem emoji', () => {
    expect(validarMensagem('feat: criar fundação do monorepo').status).toBe(0);
  });

  it('recusa mensagem com emoji', () => {
    const resultado = validarMensagem(`feat: criar fundação do monorepo ${FOGUETE}`);

    expect(resultado.status).toBe(1);
    expect(resultado.stdout).toContain('sem-emoji');
  });

  it('recusa emoji no corpo da mensagem', () => {
    const resultado = validarMensagem(`fix: corrigir rota\n\nCorpo com emoji ${FOGUETE}`);

    expect(resultado.status).toBe(1);
  });

  it('recusa mensagem fora do padrão convencional', () => {
    const resultado = validarMensagem('Criei a fundação do monorepo');

    expect(resultado.status).toBe(1);
    expect(resultado.stdout).toContain('type-empty');
  });
});
