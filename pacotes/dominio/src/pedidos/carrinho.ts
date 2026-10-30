import { CODIGOS } from '../compartilhado/codigos.ts';
import { criarErroDeNegocio, type ErroDeNegocio } from '../compartilhado/erro-de-negocio.ts';
import { Resultado } from '../compartilhado/resultado.ts';
import { contarCaracteres } from '../compartilhado/texto.ts';

export const LIMITES_DO_CARRINHO = {
  linhas: 30,
  quantidadeMinima: 1,
  quantidadeMaxima: 99,
  observacao: 140,
} as const;

export interface LinhaDoCarrinho {
  readonly pratoId: string;
  readonly quantidade: number;
  readonly observacao: string;
}

export interface PratoParaPedido {
  readonly id: string;
  readonly nome: string;
  readonly precoCentavos: number;
  readonly disponivel: boolean;
}

export interface ItemMontado extends LinhaDoCarrinho {
  readonly nome: string;
  readonly precoCentavos: number;
}

export interface PedidoMontado {
  readonly itens: readonly ItemMontado[];
  readonly totalCentavos: number;
}

const invalido = (mensagem: string) =>
  Resultado.falha(criarErroDeNegocio(CODIGOS.PEDIDO_CRIAR_CARRINHO_INVALIDO, mensagem));

export function validarCarrinho(
  linhas: readonly LinhaDoCarrinho[],
): Resultado<readonly LinhaDoCarrinho[], ErroDeNegocio> {
  if (linhas.length === 0 || linhas.length > LIMITES_DO_CARRINHO.linhas) {
    return invalido(`O carrinho precisa ter de 1 a ${String(LIMITES_DO_CARRINHO.linhas)} itens.`);
  }
  const limpas = linhas.map((linha) => ({
    ...linha,
    observacao: linha.observacao.trim().replace(/\s+/g, ' '),
  }));
  for (const linha of limpas) {
    const { quantidadeMinima, quantidadeMaxima, observacao } = LIMITES_DO_CARRINHO;
    if (
      !Number.isInteger(linha.quantidade) ||
      linha.quantidade < quantidadeMinima ||
      linha.quantidade > quantidadeMaxima
    ) {
      return invalido(
        `A quantidade de cada item vai de ${String(quantidadeMinima)} a ${String(quantidadeMaxima)}.`,
      );
    }
    if (contarCaracteres(linha.observacao) > observacao) {
      return invalido(`A observação tem até ${String(observacao)} caracteres.`);
    }
  }
  return Resultado.ok(limpas);
}

export function montarPedido(
  linhas: readonly LinhaDoCarrinho[],
  pratos: ReadonlyMap<string, PratoParaPedido>,
): Resultado<PedidoMontado, ErroDeNegocio> {
  const itens: ItemMontado[] = [];
  const indisponiveis = new Set<string>();
  for (const linha of linhas) {
    const prato = pratos.get(linha.pratoId);
    if (prato?.disponivel === true) {
      itens.push({ ...linha, nome: prato.nome, precoCentavos: prato.precoCentavos });
    } else {
      indisponiveis.add(linha.pratoId);
    }
  }
  if (indisponiveis.size > 0) {
    return Resultado.falha(
      criarErroDeNegocio(
        CODIGOS.PEDIDO_CRIAR_ITEM_INDISPONIVEL,
        'Um item do carrinho acabou ou saiu do cardápio. Tire-o e envie de novo.',
        { pratoIds: [...indisponiveis] },
      ),
    );
  }
  const totalCentavos = itens.reduce((soma, item) => soma + item.precoCentavos * item.quantidade, 0);
  return Resultado.ok({ itens, totalCentavos });
}

export function conteudoCanonico(linhas: readonly LinhaDoCarrinho[]): string {
  return JSON.stringify(linhas.map((linha) => [linha.pratoId, linha.quantidade, linha.observacao]));
}
