import type { TextosDoCardapio } from '@cardapio/dominio';

export interface PersonalizacaoPublicada {
  readonly corMarca: string;
  readonly corSobreMarca: string;
  readonly corMarcaTexto: string;
  readonly logoUrl: string | null;
  readonly capaUrl: string | null;
  readonly frase: string;
  readonly linkAvaliacaoGoogle: string | null;
  readonly linkInstagram: string | null;
  readonly textos: TextosDoCardapio;
}

export interface PersonalizacaoGuardada extends PersonalizacaoPublicada {
  readonly versao: number;
}

export interface RepositorioDePersonalizacao {
  buscar(restauranteId: string): Promise<PersonalizacaoGuardada | null>;
  publicar(restauranteId: string, personalizacao: PersonalizacaoPublicada): Promise<number>;
}
