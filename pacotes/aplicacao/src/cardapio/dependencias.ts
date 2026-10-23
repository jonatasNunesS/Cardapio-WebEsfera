import type { RepositorioDoCardapio } from './portas/repositorio-do-cardapio.ts';

export interface DependenciasDoCardapio {
  readonly cardapio: RepositorioDoCardapio;
}
