import { Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import type { DependenciasDaMidia } from '../dependencias.ts';
import { MIDIA_NAO_ENCONTRADA, SITUACAO_INVALIDA, semPermissaoNaMidia } from '../desfechos.ts';

export async function tentarProcessarMidiaDeNovo(
  dependencias: DependenciasDaMidia,
  acesso: AcessoAoRestaurante,
  midiaId: string,
): Promise<Resultado<null, ErroDeNegocio>> {
  const proibido = semPermissaoNaMidia(acesso);
  if (proibido !== undefined) {
    return Resultado.falha(proibido);
  }
  const midia = await dependencias.midias.obter(acesso.restauranteId, midiaId);
  if (midia === null || midia.descartada) {
    return Resultado.falha(MIDIA_NAO_ENCONTRADA);
  }
  if (midia.situacao !== 'falhou' || midia.originalApagado) {
    return Resultado.falha(SITUACAO_INVALIDA);
  }
  const tentativa = await dependencias.midias.solicitarProcessamento(acesso.restauranteId, midiaId, 'falhou');
  return tentativa === null ? Resultado.falha(SITUACAO_INVALIDA) : Resultado.ok(null);
}
