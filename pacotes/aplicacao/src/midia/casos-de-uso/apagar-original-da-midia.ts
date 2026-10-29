import type { DependenciasDaMidia } from '../dependencias.ts';
import type { Destino } from '../derivados-gerados.ts';

export async function apagarOriginalDaMidia(
  dependencias: DependenciasDaMidia,
  destino: Destino,
): Promise<boolean> {
  const midia = await dependencias.midias.obter(destino.restauranteId, destino.midiaId);
  if (midia === null || midia.originalApagado || midia.situacao !== 'pronta') {
    return false;
  }
  await dependencias.armazenamento.apagar('originais', midia.caminhoOriginal);
  await dependencias.midias.marcarOriginalApagado(destino.restauranteId, destino.midiaId);
  return true;
}
