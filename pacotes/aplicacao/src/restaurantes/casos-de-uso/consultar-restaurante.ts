import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import type {
  RepositorioDeRestaurantes,
  ResumoDoRestaurante,
} from '../portas/repositorio-de-restaurantes.ts';

export async function consultarRestaurante(
  dependencias: { readonly restaurantes: RepositorioDeRestaurantes },
  acesso: AcessoAoRestaurante,
): Promise<ResumoDoRestaurante | null> {
  return dependencias.restaurantes.buscar(acesso.restauranteId);
}
