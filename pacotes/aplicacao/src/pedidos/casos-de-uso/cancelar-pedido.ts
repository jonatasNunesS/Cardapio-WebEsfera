import {
  clientePodeCancelar,
  CODIGOS,
  criarErroDeNegocio,
  Resultado,
  type ErroDeNegocio,
} from '@cardapio/dominio';
import type { DependenciasDosPedidos } from '../dependencias.ts';
import { PEDIDO_NAO_ENCONTRADO, SESSAO_EXPIRADA } from '../falhas.ts';
import type { SessaoDoCliente } from '../portas/repositorio-de-pedidos.ts';

export async function cancelarPedido(
  dependencias: DependenciasDosPedidos,
  sessao: SessaoDoCliente,
  pedidoId: string,
): Promise<Resultado<null, ErroDeNegocio>> {
  const desfecho = await dependencias.pedidos.cancelar(
    sessao,
    pedidoId,
    dependencias.relogio.agora(),
    clientePodeCancelar,
  );
  switch (desfecho) {
    case 'cancelado':
      return Resultado.ok(null);
    case 'nao-encontrado':
      return Resultado.falha(PEDIDO_NAO_ENCONTRADO);
    case 'sessao-expirada':
      return Resultado.falha(SESSAO_EXPIRADA);
    case 'fora-de-hora':
      return Resultado.falha(
        criarErroDeNegocio(
          CODIGOS.PEDIDO_CANCELAR_FORA_DE_HORA,
          'A cozinha já começou o pedido. Para cancelar, fale com um atendente.',
        ),
      );
  }
}
