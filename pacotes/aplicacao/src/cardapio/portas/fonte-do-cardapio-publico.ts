import type { Horario } from '@cardapio/dominio';
import type { PersonalizacaoPublicada } from '../../personalizacao/portas/repositorio-de-personalizacao.ts';
import type { CategoriaGuardada, PratoGuardado } from './repositorio-do-cardapio.ts';

export type ResolucaoDoCardapio =
  | { readonly situacao: 'inexistente' }
  | {
      readonly situacao: 'valido' | 'redirecionar';
      readonly restauranteId: string;
      readonly slugAtual: string;
      readonly versao: number;
    };

export interface DadosDoCardapioPublico {
  readonly versao: number;
  readonly restaurante: { readonly nome: string; readonly slug: string; readonly fusoHorario: string };
  readonly personalizacao: PersonalizacaoPublicada | null;
  readonly horarios: readonly Horario[];
  readonly categorias: readonly CategoriaGuardada[];
  readonly pratos: readonly PratoGuardado[];
}

export interface PratoPublicado {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string;
  readonly precoCentavos: number;
  readonly disponivel: boolean;
  readonly destaque: boolean;
}

export interface SecaoPublicada {
  readonly id: string;
  readonly nome: string;
  readonly pratos: readonly PratoPublicado[];
}

export interface CardapioPublicado {
  readonly versao: number;
  readonly restaurante: { readonly nome: string; readonly slug: string; readonly fusoHorario: string };
  readonly personalizacao: PersonalizacaoPublicada;
  readonly horarios: readonly Horario[];
  readonly secoes: readonly SecaoPublicada[];
  readonly destaques: readonly string[];
}

export interface PratoEncontrado extends PratoPublicado {
  readonly categoria: string;
}

export interface FonteDoCardapioPublico {
  resolver(slug: string): Promise<ResolucaoDoCardapio>;
  ler(restauranteId: string): Promise<DadosDoCardapioPublico>;
  buscar(restauranteId: string, termos: readonly string[]): Promise<readonly PratoEncontrado[]>;
}

export interface CacheDoCardapio {
  ler(restauranteId: string, versao: number): Promise<CardapioPublicado | null>;
  gravar(restauranteId: string, cardapio: CardapioPublicado): Promise<void>;
}
