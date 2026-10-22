import type { ItemOrdenado } from '@cardapio/dominio';

export interface CategoriaGuardada {
  readonly id: string;
  readonly nome: string;
  readonly ordem: number;
  readonly versao: number;
}

export interface DadosDoPratoParaGravar {
  readonly categoriaId: string;
  readonly nome: string;
  readonly descricao: string;
  readonly precoCentavos: number;
  readonly disponivel: boolean;
  readonly destaque: boolean;
}

export interface PratoGuardado extends DadosDoPratoParaGravar {
  readonly id: string;
  readonly ordem: number;
  readonly versao: number;
}

export type Desfecho<T> =
  | { readonly tipo: 'ok'; readonly valor: T }
  | { readonly tipo: 'conflito' }
  | { readonly tipo: 'nao-encontrado' }
  | { readonly tipo: 'nome-repetido' }
  | { readonly tipo: 'com-pratos' }
  | { readonly tipo: 'categoria-inexistente' };

export interface ItemVersionado {
  readonly id: string;
  readonly versao: number;
}

export interface Movimento extends ItemVersionado {
  readonly tipo: 'categoria' | 'prato';
  readonly planejar: (itens: readonly ItemOrdenado[]) => readonly ItemOrdenado[];
}

export interface SituacaoDoPrato extends ItemVersionado {
  readonly disponivel?: boolean | undefined;
  readonly destaque?: boolean | undefined;
}

export interface CardapioDoPainel {
  readonly categorias: readonly CategoriaGuardada[];
  readonly pratos: readonly PratoGuardado[];
}

export interface RepositorioDoCardapio {
  listar(restauranteId: string): Promise<CardapioDoPainel>;
  criarCategoria(restauranteId: string, nome: string): Promise<Desfecho<CategoriaGuardada>>;
  editarCategoria(
    restauranteId: string,
    item: ItemVersionado,
    nome: string,
  ): Promise<Desfecho<CategoriaGuardada>>;
  removerCategoria(restauranteId: string, item: ItemVersionado): Promise<Desfecho<null>>;
  criarPrato(restauranteId: string, prato: DadosDoPratoParaGravar): Promise<Desfecho<PratoGuardado>>;
  editarPrato(
    restauranteId: string,
    item: ItemVersionado,
    prato: DadosDoPratoParaGravar,
  ): Promise<Desfecho<PratoGuardado>>;
  alterarSituacaoDoPrato(restauranteId: string, situacao: SituacaoDoPrato): Promise<Desfecho<PratoGuardado>>;
  removerPrato(restauranteId: string, item: ItemVersionado): Promise<Desfecho<null>>;
  mover(restauranteId: string, movimento: Movimento): Promise<Desfecho<null>>;
}
