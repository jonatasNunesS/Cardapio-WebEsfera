import { linkDaMesa, Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import type { DependenciasDasMesas } from '../dependencias.ts';
import { semPermissaoNaMesa } from '../desfechos.ts';
import type { MesaGuardada } from '../portas/repositorio-de-mesas.ts';

export interface MesaComLink extends MesaGuardada {
  readonly link: string;
}

export interface ListaDeMesas {
  readonly slug: string;
  readonly nomeDoRestaurante: string;
  readonly limite: number;
  readonly mesas: readonly MesaComLink[];
}

export async function listarMesas(
  dependencias: DependenciasDasMesas,
  acesso: AcessoAoRestaurante,
): Promise<Resultado<ListaDeMesas, ErroDeNegocio>> {
  const proibido = semPermissaoNaMesa(acesso);
  if (proibido !== undefined) {
    return Resultado.falha(proibido);
  }
  const lista = await dependencias.mesas.listar(acesso.restauranteId);
  return Resultado.ok({
    slug: lista.slug,
    nomeDoRestaurante: lista.nomeDoRestaurante,
    limite: await dependencias.limite.limite(acesso.restauranteId),
    mesas: lista.mesas.map((mesa) => ({
      ...mesa,
      link: linkDaMesa(dependencias.urlDoCardapio, lista.slug, mesa.numero, mesa.codigo),
    })),
  });
}
