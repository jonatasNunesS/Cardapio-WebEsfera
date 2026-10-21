import { describe, expect, it } from 'vitest';
import { Resultado } from './resultado.ts';

describe('Resultado', () => {
  it('ok guarda o valor', () => {
    expect(Resultado.ok(42)).toEqual({ ok: true, valor: 42 });
  });

  it('falha guarda o erro', () => {
    expect(Resultado.falha('esgotado')).toEqual({ ok: false, erro: 'esgotado' });
  });

  it('mapear transforma só o sucesso', () => {
    const dobro = (valor: number) => valor * 2;

    expect(Resultado.mapear(Resultado.ok(21), dobro)).toEqual(Resultado.ok(42));
    expect(Resultado.mapear(Resultado.falha('esgotado'), dobro)).toEqual(Resultado.falha('esgotado'));
  });

  it('ehOk e ehFalha estreitam o tipo', () => {
    const resultado: Resultado<number, string> = Math.random() > 2 ? Resultado.falha('x') : Resultado.ok(7);

    if (Resultado.ehOk(resultado)) {
      const valor: number = resultado.valor;
      expect(valor).toBe(7);
    }
    expect(Resultado.ehFalha(resultado)).toBe(false);
    const falha: Resultado<number, string> = Resultado.falha('mesa fechada');
    if (Resultado.ehFalha(falha)) {
      const erro: string = falha.erro;
      expect(erro).toBe('mesa fechada');
    }
  });
});
