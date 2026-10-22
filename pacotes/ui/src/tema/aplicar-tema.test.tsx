import { describe, expect, it, vi } from 'vitest';
import { aplicarTemaRestaurante, CODIGO_TEMA_COR_INVALIDA, ErroTemaInvalido } from './aplicar-tema.ts';

const VALIDO = { corMarca: '#2F6B3A', corSobreMarca: '#FFFFFF', corMarcaTexto: '#2F6B3A' };

function variaveis(elemento: HTMLElement) {
  return ['--cor-marca', '--cor-sobre-marca', '--cor-marca-texto'].map((nome) =>
    elemento.style.getPropertyValue(nome),
  );
}

describe('aplicarTemaRestaurante', () => {
  it('aplica os três valores válidos no elemento e não reporta', () => {
    const elemento = document.createElement('div');
    const reportar = vi.fn();

    expect(aplicarTemaRestaurante(elemento, VALIDO, reportar)).toBe(true);
    expect(variaveis(elemento)).toEqual(['#2F6B3A', '#FFFFFF', '#2F6B3A']);
    expect(reportar).not.toHaveBeenCalled();
  });

  it.each([
    ['corMarca', { ...VALIDO, corMarca: 'red' }],
    ['corSobreMarca', { ...VALIDO, corSobreMarca: '#FFF' }],
    ['corMarcaTexto', { ...VALIDO, corMarcaTexto: 'url(javascript:alert(1))' }],
  ] as const)('com %s inválido mantém o tema padrão e reporta uma vez', (campo, tema) => {
    const elemento = document.createElement('div');
    const reportar = vi.fn();

    expect(aplicarTemaRestaurante(elemento, tema, reportar)).toBe(false);
    expect(variaveis(elemento)).toEqual(['', '', '']);
    expect(reportar).toHaveBeenCalledTimes(1);
    expect(reportar).toHaveBeenCalledWith(expect.any(ErroTemaInvalido), {
      codigo: CODIGO_TEMA_COR_INVALIDA,
      campo,
    });
  });

  it('um tema inválido depois de um válido volta ao padrão', () => {
    const elemento = document.createElement('div');
    aplicarTemaRestaurante(elemento, VALIDO, vi.fn());

    aplicarTemaRestaurante(elemento, { ...VALIDO, corMarca: '' }, vi.fn());

    expect(variaveis(elemento)).toEqual(['', '', '']);
  });
});
