import type { RestaurantesParaCobranca } from './portas/eventos-de-pagamento.ts';

export const PAGINA_DE_RESTAURANTES = 200;

export async function percorrerRestaurantes(
  restaurantes: RestaurantesParaCobranca,
  visitar: (restauranteId: string) => Promise<void>,
): Promise<number> {
  let apos: string | null = null;
  let total = 0;
  for (;;) {
    const pagina = await restaurantes.listar(apos, PAGINA_DE_RESTAURANTES);
    for (const restauranteId of pagina) {
      await visitar(restauranteId);
    }
    total += pagina.length;
    if (pagina.length < PAGINA_DE_RESTAURANTES) {
      return total;
    }
    apos = pagina.at(-1) ?? null;
  }
}
