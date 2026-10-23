import { describe, expect, it } from 'vitest';
import { montarCardapio, type PratoDoCardapio } from './cardapio.ts';
import { criarDinheiro, type Dinheiro } from './dinheiro.ts';

const preco = (criarDinheiro(1000) as { valor: Dinheiro }).valor;

function prato(
  id: string,
  categoriaId: string,
  ordem: number,
  extra: Partial<PratoDoCardapio> = {},
): PratoDoCardapio {
  return {
    id,
    categoriaId,
    nome: id,
    descricao: '',
    preco,
    disponivel: true,
    destaque: false,
    ordem,
    removido: false,
    ...extra,
  };
}

describe('montar o cardápio', () => {
  const categorias = [
    { id: 'principais', nome: 'Principais', ordem: 2048 },
    { id: 'entradas', nome: 'Entradas', ordem: 1024 },
    { id: 'vazia', nome: 'Vazia', ordem: 3072 },
  ];

  it('ordena categorias e pratos, esconde removido e categoria sem prato visível, mantém esgotado', () => {
    const cardapio = montarCardapio(categorias, [
      prato('costela', 'principais', 2048, { destaque: true }),
      prato('picanha', 'principais', 1024),
      prato('pao', 'entradas', 1024),
      prato('burrata', 'entradas', 2048, { disponivel: false }),
      prato('antigo', 'vazia', 1024, { removido: true }),
    ]);

    expect(cardapio.secoes.map((secao) => [secao.id, secao.pratos.map((item) => item.id)])).toEqual([
      ['entradas', ['pao', 'burrata']],
      ['principais', ['picanha', 'costela']],
    ]);
    expect(cardapio.secoes[0]?.pratos[1]?.disponivel).toBe(false);
    expect(cardapio.destaques.map((item) => item.id)).toEqual(['costela']);
  });
});
