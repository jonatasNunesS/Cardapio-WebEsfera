import { prefixoDaMidia } from '@cardapio/dominio';
import type { DependenciasDaMidia } from '../dependencias.ts';
import type { Destino } from '../derivados-gerados.ts';

export async function descartarMidia(
  dependencias: DependenciasDaMidia,
  destino: Destino,
): Promise<number | null> {
  const midia = await dependencias.midias.obter(destino.restauranteId, destino.midiaId);
  if (!midia?.descartada) {
    return null;
  }
  const prefixo = prefixoDaMidia(destino.restauranteId, destino.midiaId);
  const originais = await dependencias.armazenamento.apagarPrefixo('originais', prefixo);
  const publicos = await dependencias.armazenamento.apagarPrefixo('publica', prefixo);
  return originais + publicos;
}
