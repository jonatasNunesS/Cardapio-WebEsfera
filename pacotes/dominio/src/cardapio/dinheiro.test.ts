import { describe, expect, it } from 'vitest';
import { CODIGOS } from '../compartilhado/codigos.ts';
import {
  criarDinheiro,
  DINHEIRO_MAXIMO_EM_CENTAVOS,
  formatarDinheiro,
  somarDinheiro,
  type Dinheiro,
} from './dinheiro.ts';

function dinheiro(centavos: number): Dinheiro {
  const resultado = criarDinheiro(centavos);
  if (!resultado.ok) {
    throw new Error('valor de teste inválido');
  }
  return resultado.valor;
}

describe('Dinheiro', () => {
  it('soma em centavos inteiros, sem erro de ponto flutuante', () => {
    const total = somarDinheiro(dinheiro(10), dinheiro(20), dinheiro(8900));
    expect(total.ok && total.valor.centavos).toBe(8930);
  });

  it('soma que passa do máximo é recusada', () => {
    const total = somarDinheiro(dinheiro(DINHEIRO_MAXIMO_EM_CENTAVOS), dinheiro(1));
    expect(total.ok).toBe(false);
  });

  it.each([
    [0, 'R$ 0,00'],
    [5, 'R$ 0,05'],
    [8900, 'R$ 89,00'],
    [123456, 'R$ 1.234,56'],
    [DINHEIRO_MAXIMO_EM_CENTAVOS, 'R$ 1.000.000,00'],
  ])('formata %i centavos como %s', (centavos, esperado) => {
    expect(formatarDinheiro(dinheiro(centavos))).toBe(esperado);
  });

  it.each([-1, 0.5, 89.9, Number.NaN, Number.POSITIVE_INFINITY, DINHEIRO_MAXIMO_EM_CENTAVOS + 1])(
    'rejeita %s (negativo, fração ou fora do limite)',
    (centavos) => {
      const resultado = criarDinheiro(centavos);
      expect(resultado.ok).toBe(false);
      expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.DINHEIRO_CRIAR_VALOR_INVALIDO);
    },
  );
});
