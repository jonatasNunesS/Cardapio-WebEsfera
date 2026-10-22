import type { SituacaoDoRestaurante } from '@cardapio/dominio';
import type { PersonalizacaoPublicada } from '../../personalizacao/portas/repositorio-de-personalizacao.ts';

export interface RestauranteNovo {
  readonly nome: string;
  readonly candidatosDeSlug: readonly string[];
  readonly testeTerminaEm: Date;
  readonly donoId: string;
  readonly personalizacao: PersonalizacaoPublicada;
}

export interface RestauranteCriado {
  readonly restauranteId: string;
  readonly slug: string;
}

export interface ResumoDoRestaurante {
  readonly nome: string;
  readonly slug: string;
  readonly situacao: SituacaoDoRestaurante;
  readonly testeTerminaEm: Date | null;
}

export interface RepositorioDeRestaurantes {
  criar(novo: RestauranteNovo): Promise<RestauranteCriado | null>;
  buscar(restauranteId: string): Promise<ResumoDoRestaurante | null>;
}
