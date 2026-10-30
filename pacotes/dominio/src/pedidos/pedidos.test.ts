import { describe, expect, it } from 'vitest';
import { CODIGOS } from '../compartilhado/codigos.ts';
import { conteudoCanonico, montarPedido, validarCarrinho, type PratoParaPedido } from './carrinho.ts';
import { clientePodeCancelar, podeTransitar, type SituacaoDoPedido } from './pedido.ts';

const prato = (id: string, precoCentavos: number, disponivel = true): PratoParaPedido => ({
  id,
  nome: `Prato ${id}`,
  precoCentavos,
  disponivel,
});
const pratos = new Map([
  ['a', prato('a', 3200)],
  ['b', prato('b', 1550)],
  ['esgotado', prato('esgotado', 900, false)],
]);

describe('máquina de estados do pedido', () => {
  const todas: SituacaoDoPedido[] = ['enviado', 'em_preparo', 'pronto', 'entregue', 'cancelado'];

  it('avança só na ordem e cancela antes de entregue', () => {
    const validas = todas.flatMap((de) =>
      todas.filter((para) => podeTransitar(de, para)).map((para) => `${de}>${para}`),
    );
    expect(validas).toEqual([
      'enviado>em_preparo',
      'enviado>cancelado',
      'em_preparo>pronto',
      'em_preparo>cancelado',
      'pronto>entregue',
      'pronto>cancelado',
    ]);
  });

  it('entregue e cancelado não saem do lugar', () => {
    for (const para of todas) {
      expect(podeTransitar('entregue', para)).toBe(false);
      expect(podeTransitar('cancelado', para)).toBe(false);
    }
  });

  it('o cliente só cancela enquanto enviado', () => {
    expect(todas.filter(clientePodeCancelar)).toEqual(['enviado']);
  });
});

describe('carrinho', () => {
  it('limpa espaços da observação e aceita o limite', () => {
    const resultado = validarCarrinho([{ pratoId: 'a', quantidade: 99, observacao: '  sem   cebola ' }]);
    expect(resultado.ok && resultado.valor).toEqual([
      { pratoId: 'a', quantidade: 99, observacao: 'sem cebola' },
    ]);
  });

  it.each([
    [[]],
    [[{ pratoId: 'a', quantidade: 0, observacao: '' }]],
    [[{ pratoId: 'a', quantidade: 100, observacao: '' }]],
    [[{ pratoId: 'a', quantidade: 1.5, observacao: '' }]],
    [[{ pratoId: 'a', quantidade: 1, observacao: 'x'.repeat(141) }]],
    [Array.from({ length: 31 }, () => ({ pratoId: 'a', quantidade: 1, observacao: '' }))],
  ])('recusa carrinho fora dos limites (%#)', (linhas) => {
    const resultado = validarCarrinho(linhas);
    expect(resultado.ok ? null : resultado.erro.codigo).toBe(CODIGOS.PEDIDO_CRIAR_CARRINHO_INVALIDO);
  });

  it('preço e total vêm do cardápio atual', () => {
    const resultado = montarPedido(
      [
        { pratoId: 'a', quantidade: 2, observacao: '' },
        { pratoId: 'b', quantidade: 1, observacao: 'bem passado' },
      ],
      pratos,
    );
    expect(resultado.ok && resultado.valor).toEqual({
      totalCentavos: 7950,
      itens: [
        { pratoId: 'a', quantidade: 2, observacao: '', nome: 'Prato a', precoCentavos: 3200 },
        { pratoId: 'b', quantidade: 1, observacao: 'bem passado', nome: 'Prato b', precoCentavos: 1550 },
      ],
    });
  });

  it('esgotado ou removido recusa e diz quais', () => {
    const resultado = montarPedido(
      [
        { pratoId: 'a', quantidade: 1, observacao: '' },
        { pratoId: 'esgotado', quantidade: 1, observacao: '' },
        { pratoId: 'removido', quantidade: 1, observacao: '' },
      ],
      pratos,
    );
    expect(resultado.ok ? null : resultado.erro).toMatchObject({
      codigo: CODIGOS.PEDIDO_CRIAR_ITEM_INDISPONIVEL,
      detalhes: { pratoIds: ['esgotado', 'removido'] },
    });
  });

  it('o conteúdo canônico muda com qualquer item, quantidade ou observação', () => {
    const base = [{ pratoId: 'a', quantidade: 1, observacao: '' }];
    const variantes = [
      base,
      [{ pratoId: 'b', quantidade: 1, observacao: '' }],
      [{ pratoId: 'a', quantidade: 2, observacao: '' }],
      [{ pratoId: 'a', quantidade: 1, observacao: 'x' }],
    ];
    expect(new Set(variantes.map(conteudoCanonico)).size).toBe(4);
    expect(conteudoCanonico(base)).toBe(conteudoCanonico([{ ...base[0] } as (typeof base)[0]]));
  });
});
