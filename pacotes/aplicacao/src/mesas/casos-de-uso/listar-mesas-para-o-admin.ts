import { CODIGOS, criarErroDeNegocio, linkDaMesa, Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import type { DependenciasDoAdminDeMesas } from '../dependencias.ts';
import type { MesaParaOAdmin } from '../portas/cartoes-de-qr.ts';

export interface MesasParaOAdmin {
  readonly nomeDoRestaurante: string;
  readonly slug: string;
  readonly mesas: readonly (MesaParaOAdmin & { readonly link: string })[];
}

export async function listarMesasParaOAdmin(
  dependencias: DependenciasDoAdminDeMesas,
  administradorId: string,
  slug: string,
): Promise<Resultado<MesasParaOAdmin, ErroDeNegocio>> {
  const lida = await dependencias.leitura.listar(administradorId, slug);
  if (lida === null) {
    return Resultado.falha(
      criarErroDeNegocio(CODIGOS.CARDAPIO_CONSULTAR_NAO_ENCONTRADO, 'Restaurante não encontrado.'),
    );
  }
  return Resultado.ok({
    ...lida,
    mesas: lida.mesas.map((mesa) => ({
      ...mesa,
      link: linkDaMesa(dependencias.urlDoCardapio, lida.slug, mesa.numero, mesa.codigo),
    })),
  });
}
