import { Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import type { DependenciasDosPedidos } from '../dependencias.ts';
import { PEDIDO_NAO_ENCONTRADO, SESSAO_EXPIRADA } from '../falhas.ts';
import type { PedidoGuardado, SessaoDoCliente } from '../portas/repositorio-de-pedidos.ts';

export async function obterPedido(
  dependencias: DependenciasDosPedidos,
  sessao: SessaoDoCliente,
  pedidoId: string,
): Promise<Resultado<PedidoGuardado, ErroDeNegocio>> {
  const pedido = await dependencias.pedidos.obter(sessao, pedidoId, dependencias.relogio.agora());
  if (pedido === 'sessao-expirada') {
    return Resultado.falha(SESSAO_EXPIRADA);
  }
  return pedido === null ? Resultado.falha(PEDIDO_NAO_ENCONTRADO) : Resultado.ok(pedido);
}
