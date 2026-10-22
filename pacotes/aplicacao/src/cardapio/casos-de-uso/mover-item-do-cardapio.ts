import { planejarMovimento, Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import { paraResultado, semPermissao } from '../desfechos.ts';
import type { ItemVersionado } from '../portas/repositorio-do-cardapio.ts';
import type { DependenciasDoCardapio } from '../dependencias.ts';

export interface PedidoDeMovimento extends ItemVersionado {
  readonly tipo: 'categoria' | 'prato';
  readonly posicao: number;
}

export async function moverItemDoCardapio(
  dependencias: DependenciasDoCardapio,
  acesso: AcessoAoRestaurante,
  pedido: PedidoDeMovimento,
): Promise<Resultado<null, ErroDeNegocio>> {
  const proibido = semPermissao(acesso);
  if (proibido !== undefined) {
    return Resultado.falha(proibido);
  }
  const { posicao, ...movimento } = pedido;
  return paraResultado(
    await dependencias.cardapio.mover(acesso.restauranteId, {
      ...movimento,
      planejar: (itens) => planejarMovimento(itens, pedido.id, posicao),
    }),
  );
}
