import { describe, expect, it } from 'vitest';
import { gerarSenhaTemporaria, lerArgumentos } from './admin-criar.ts';

describe('admin:criar', () => {
  it('lê o e-mail normalizado, com nome e papel padrão', () => {
    expect(lerArgumentos(['--email', ' Ops@WebEsfera.com.br '])).toEqual({
      email: 'ops@webesfera.com.br',
      nome: 'ops',
      papel: 'dono_plataforma',
    });
    expect(lerArgumentos(['--email', 'a@b.co', '--nome', 'Ana', '--papel', 'suporte'])).toEqual({
      email: 'a@b.co',
      nome: 'Ana',
      papel: 'suporte',
    });
  });

  it.each([
    [[]],
    [['--email', 'sem-arroba']],
    [['--email', 'a@b.co', '--papel', 'root']],
    [['--outro', 'x']],
  ])('recusa %j', (argumentos) => {
    expect(() => lerArgumentos(argumentos)).toThrow();
  });

  it('senha temporária de 120 bits, diferente a cada vez', () => {
    const [a, b] = [gerarSenhaTemporaria(), gerarSenhaTemporaria()];
    expect(a).toHaveLength(20);
    expect(a).not.toBe(b);
  });
});
