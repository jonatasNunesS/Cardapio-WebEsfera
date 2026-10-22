import { describe, expect, it } from 'vitest';
import { CODIGOS } from '../compartilhado/codigos.ts';
import { LIMITES_DO_CARDAPIO, validarCategoria, validarPrato } from './itens.ts';

const PRATO = {
  categoriaId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
  nome: '  Costela   na brasa ',
  descricao: ' 12 horas no fogo de chão. ',
  precoCentavos: 8900,
  disponivel: true,
  destaque: false,
};

describe('itens do cardápio', () => {
  it('prato válido sai com espaços normalizados e preço em Dinheiro', () => {
    const resultado = validarPrato(PRATO);
    expect(resultado.ok && resultado.valor).toMatchObject({
      nome: 'Costela na brasa',
      descricao: '12 horas no fogo de chão.',
      preco: { centavos: 8900 },
    });
  });

  it.each([
    [{ nome: '   ' }, CODIGOS.CARDAPIO_EDITAR_NOME_INVALIDO],
    [{ nome: 'a'.repeat(LIMITES_DO_CARDAPIO.nomeDoPrato + 1) }, CODIGOS.CARDAPIO_EDITAR_NOME_INVALIDO],
    [
      { descricao: 'á'.repeat(LIMITES_DO_CARDAPIO.descricaoDoPrato + 1) },
      CODIGOS.CARDAPIO_EDITAR_DESCRICAO_LONGA,
    ],
    [{ precoCentavos: 89.9 }, CODIGOS.CARDAPIO_EDITAR_PRECO_INVALIDO],
    [{ precoCentavos: -100 }, CODIGOS.CARDAPIO_EDITAR_PRECO_INVALIDO],
  ])('recusa %o', (mudanca, codigo) => {
    const resultado = validarPrato({ ...PRATO, ...mudanca });
    expect(!resultado.ok && resultado.erro.codigo).toBe(codigo);
  });

  it('descrição no limite exato, contando acento como um caractere, passa', () => {
    expect(validarPrato({ ...PRATO, descricao: 'ã'.repeat(LIMITES_DO_CARDAPIO.descricaoDoPrato) }).ok).toBe(
      true,
    );
  });

  it('categoria precisa de nome de 1 a 40 caracteres', () => {
    expect(validarCategoria({ nome: ' Entradas ' })).toEqual({ ok: true, valor: { nome: 'Entradas' } });
    expect(validarCategoria({ nome: '' }).ok).toBe(false);
    expect(validarCategoria({ nome: 'x'.repeat(41) }).ok).toBe(false);
  });
});
