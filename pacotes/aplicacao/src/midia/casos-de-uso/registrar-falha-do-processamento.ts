import type { DependenciasDaMidia } from '../dependencias.ts';
import type { PedidoDeProcessamento } from './processar-midia.ts';

export async function registrarFalhaDoProcessamento(
  dependencias: Pick<DependenciasDaMidia, 'midias'>,
  pedido: PedidoDeProcessamento,
): Promise<boolean> {
  return dependencias.midias.falhar(
    pedido.restauranteId,
    pedido.midiaId,
    pedido.tentativa,
    'erro_no_processamento',
  );
}
