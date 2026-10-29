import { Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import type { DependenciasDaMidia } from '../dependencias.ts';
import { PRATO_NAO_ENCONTRADO, semPermissaoNaMidia } from '../desfechos.ts';

export async function removerMidiaDoPrato(
  dependencias: Pick<DependenciasDaMidia, 'midias'>,
  acesso: AcessoAoRestaurante,
  pratoId: string,
): Promise<Resultado<null, ErroDeNegocio>> {
  const proibido = semPermissaoNaMidia(acesso);
  if (proibido !== undefined) {
    return Resultado.falha(proibido);
  }
  const removida = await dependencias.midias.removerDoPrato(acesso.restauranteId, pratoId);
  return removida ? Resultado.ok(null) : Resultado.falha(PRATO_NAO_ENCONTRADO);
}
