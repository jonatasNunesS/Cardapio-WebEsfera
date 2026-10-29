import { describe, expect, it } from 'vitest';
import { CODIGOS } from '../compartilhado/codigos.ts';
import { ErroInvarianteDominio } from '../compartilhado/erro-invariante-dominio.ts';
import {
  exigirCodigoDaMesa,
  LIMITE_MESAS_TESTE,
  linkDaMesa,
  podeCriarMesa,
  validarDadosDaMesa,
  validarNumeroDaMesa,
} from './mesa.ts';

describe('mesa', () => {
  it.each([1, 12, 999])('aceita o número %s', (numero) => {
    expect(validarNumeroDaMesa(numero)).toEqual({ ok: true, valor: numero });
  });

  it.each([0, -1, 1000, 1.5, Number.NaN])('recusa o número %s', (numero) => {
    const resultado = validarNumeroDaMesa(numero);
    expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.MESA_EDITAR_NUMERO_INVALIDO);
  });

  it('nome e área são opcionais, com espaços normalizados e até 60 caracteres', () => {
    expect(validarDadosDaMesa({ nome: '  Varanda   1 ', area: '   ' })).toEqual({
      ok: true,
      valor: { nome: 'Varanda 1', area: null },
    });
    const longo = validarDadosDaMesa({ nome: 'x'.repeat(61), area: null });
    expect(!longo.ok && longo.erro.codigo).toBe(CODIGOS.MESA_EDITAR_TEXTO_LONGO);
  });

  it('link canônico: slug, número e código, sem barra dupla', () => {
    expect(linkDaMesa('https://cardapio.webesfera.com.br/', 'brasa', 12, 'abc_DEF-123456789012345')).toBe(
      'https://cardapio.webesfera.com.br/brasa/mesa/12?c=abc_DEF-123456789012345',
    );
  });

  it('código fora do formato de 22 caracteres base64url é um defeito', () => {
    expect(exigirCodigoDaMesa('A'.repeat(22))).toBe('A'.repeat(22));
    for (const ruim of ['A'.repeat(21), 'A'.repeat(23), `${'A'.repeat(21)}=`, `${'A'.repeat(21)}+`]) {
      expect(() => exigirCodigoDaMesa(ruim)).toThrow(ErroInvarianteDominio);
    }
  });

  it('limite do período de teste é 30 e conta só as ativas', () => {
    expect(LIMITE_MESAS_TESTE).toBe(30);
    expect(podeCriarMesa(29, LIMITE_MESAS_TESTE)).toBe(true);
    expect(podeCriarMesa(30, LIMITE_MESAS_TESTE)).toBe(false);
  });
});
