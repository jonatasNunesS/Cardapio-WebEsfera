import { describe, expect, it } from 'vitest';
import {
  centavosDoTexto,
  esquemaCriarPrato,
  esquemaMoverItem,
  rotaCom,
  ROTAS_DO_CARDAPIO_NO_PAINEL,
} from './esquemas.ts';

const PRATO = {
  categoriaId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
  nome: 'Costela',
  descricao: '',
  precoCentavos: 8900,
  disponivel: true,
  destaque: false,
};

describe('contratos do cardápio', () => {
  it.each([
    ['89,90', 8990],
    ['R$ 1.234,5', 123450],
    ['12', 1200],
    ['0,05', 5],
    ['89.90', null],
    ['1.23', null],
    ['12.345,67', 1234567],
    ['-1', null],
    ['abc', null],
    ['', null],
  ])('converte o texto de preço %s em centavos sem ponto flutuante', (texto, esperado) => {
    expect(centavosDoTexto(texto)).toBe(esperado);
  });

  it('preço em float, negativo ou campo a mais é recusado', () => {
    expect(esquemaCriarPrato.safeParse(PRATO).success).toBe(true);
    expect(esquemaCriarPrato.safeParse({ ...PRATO, precoCentavos: 89.9 }).success).toBe(false);
    expect(esquemaCriarPrato.safeParse({ ...PRATO, precoCentavos: -1 }).success).toBe(false);
    expect(esquemaCriarPrato.safeParse({ ...PRATO, restauranteId: PRATO.categoriaId }).success).toBe(false);
  });

  it('nome conta acento como um caractere e respeita o limite', () => {
    expect(esquemaCriarPrato.safeParse({ ...PRATO, nome: 'ã'.repeat(80) }).success).toBe(true);
    expect(esquemaCriarPrato.safeParse({ ...PRATO, nome: 'a'.repeat(81) }).success).toBe(false);
    expect(esquemaCriarPrato.safeParse({ ...PRATO, nome: '   ' }).success).toBe(false);
  });

  it('mover exige versão e posição inteira', () => {
    expect(esquemaMoverItem.safeParse({ versao: 1, posicao: 0 }).success).toBe(true);
    expect(esquemaMoverItem.safeParse({ versao: 0, posicao: 1 }).success).toBe(false);
  });

  it('monta a rota com o id codificado', () => {
    expect(rotaCom(ROTAS_DO_CARDAPIO_NO_PAINEL.prato, { id: 'a b' })).toBe('/api/v1/cardapio/pratos/a%20b');
  });
});
