import {
  equipePodeCancelarPedido,
  Resultado,
  validarMotivoDeCancelamento,
  type ErroDeNegocio,
  type SituacaoDoPedido,
} from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import type { DependenciasDaEquipe } from '../dependencias.ts';
import { paraResultado, semPermissaoNaFila, transicaoInvalida } from '../desfechos.ts';

export async function cancelarPedidoPelaEquipe(
  dependencias: DependenciasDaEquipe,
  acesso: AcessoAoRestaurante,
  pedidoId: string,
  pedido: { readonly situacaoEsperada: SituacaoDoPedido; readonly motivo: string },
): Promise<Resultado<null, ErroDeNegocio>> {
  const proibido = semPermissaoNaFila(acesso);
  if (proibido !== undefined) {
    return Resultado.falha(proibido);
  }
  const motivo = validarMotivoDeCancelamento(pedido.motivo);
  if (!motivo.ok) {
    return motivo;
  }
  if (!equipePodeCancelarPedido(pedido.situacaoEsperada)) {
    return Resultado.falha(transicaoInvalida(pedido.situacaoEsperada));
  }
  return paraResultado(
    await dependencias.equipe.mudarPedido(
      acesso,
      { id: pedidoId, de: pedido.situacaoEsperada, para: 'cancelado', motivo: motivo.valor },
      dependencias.relogio.agora(),
    ),
  );
}
