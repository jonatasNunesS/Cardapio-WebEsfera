import { describe, expect, it } from 'vitest';
import { CODIGOS } from '../compartilhado/codigos.ts';
import { ehEmailValido, normalizarEmail } from './email.ts';
import { validarFormatoDaSenha } from './senha.ts';

describe('e-mail', () => {
  it('normaliza espaços e maiúsculas', () => {
    expect(normalizarEmail('  Dono@Brasa.com.BR ')).toBe('dono@brasa.com.br');
  });

  it.each(['dono@brasa.com.br', 'a.b+c@exemplo.co'])('aceita %s', (email) => {
    expect(ehEmailValido(email)).toBe(true);
  });

  it.each(['dono', 'dono@', '@brasa.com', 'dono@brasa', 'do no@brasa.com', `${'a'.repeat(250)}@x.com`])(
    'recusa %s',
    (email) => {
      expect(ehEmailValido(email)).toBe(false);
    },
  );
});

describe('senha', () => {
  it('exige 10 caracteres', () => {
    const resultado = validarFormatoDaSenha('123456789');
    expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.CONTA_SENHA_CURTA_DEMAIS);
    expect(validarFormatoDaSenha('cavalo-bateria').ok).toBe(true);
  });

  it('limita 128 caracteres', () => {
    const resultado = validarFormatoDaSenha('a'.repeat(129));
    expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.CONTA_SENHA_LONGA_DEMAIS);
  });

  it('conta caracteres, não unidades de código', () => {
    expect(validarFormatoDaSenha('ãããããããããã').ok).toBe(true);
  });
});
