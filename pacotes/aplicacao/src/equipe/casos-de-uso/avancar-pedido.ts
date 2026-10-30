import { proximaSituacaoDoPedido, Resultado, type ErroDeNegocio, type SituacaoDoPedido } from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import type { DependenciasDaEquipe } from '../dependencias.ts';
import { paraResultado, semPermissaoNaFila, transicaoInvalida } from '../desfechos.ts';

export async function avancarPedido(
  dependencias: DependenciasDaEquipe,
  acesso: AcessoAoRestaurante,
  pedidoId: string,
  situacaoEsperada: SituacaoDoPedido,
): Promise<Resultado<null, ErroDeNegocio>> {
  const proibido = semPermissaoNaFila(acesso);
  if (proibido !== undefined) {
    return Resultado.falha(proibido);
  }
  const para = proximaSituacaoDoPedido(situacaoEsperada);
  if (para === null) {
    return Resultado.falha(transicaoInvalida(situacaoEsperada));
  }
  return paraResultado(
    await dependencias.equipe.mudarPedido(
      acesso,
      { id: pedidoId, de: situacaoEsperada, para, motivo: null },
      dependencias.relogio.agora(),
    ),
  );
}
