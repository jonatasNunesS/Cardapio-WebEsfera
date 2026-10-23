import type { Dinheiro } from './dinheiro.ts';

export interface CategoriaDoCardapio {
  readonly id: string;
  readonly nome: string;
  readonly ordem: number;
}

export interface PratoDoCardapio {
  readonly id: string;
  readonly categoriaId: string;
  readonly nome: string;
  readonly descricao: string;
  readonly preco: Dinheiro;
  readonly disponivel: boolean;
  readonly destaque: boolean;
  readonly ordem: number;
  readonly removido: boolean;
}

export interface SecaoDoCardapio extends CategoriaDoCardapio {
  readonly pratos: readonly PratoDoCardapio[];
}

export interface Cardapio {
  readonly secoes: readonly SecaoDoCardapio[];
  readonly destaques: readonly PratoDoCardapio[];
}

function porOrdem<T extends { readonly ordem: number; readonly id: string }>(a: T, b: T): number {
  return a.ordem - b.ordem || a.id.localeCompare(b.id);
}

export function montarCardapio(
  categorias: readonly CategoriaDoCardapio[],
  pratos: readonly PratoDoCardapio[],
): Cardapio {
  const visiveis = pratos.filter((prato) => !prato.removido);
  const secoes = [...categorias]
    .sort(porOrdem)
    .map((categoria) => ({
      ...categoria,
      pratos: visiveis.filter((prato) => prato.categoriaId === categoria.id).sort(porOrdem),
    }))
    .filter((secao) => secao.pratos.length > 0);
  return { secoes, destaques: secoes.flatMap((secao) => secao.pratos.filter((prato) => prato.destaque)) };
}
