import {
  proximaSituacaoDoChamado,
  Resultado,
  type ErroDeNegocio,
  type SituacaoDoChamado,
} from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import type { DependenciasDaEquipe } from '../dependencias.ts';
import { paraResultado, semPermissaoNaFila, transicaoInvalida } from '../desfechos.ts';

export async function avancarChamado(
  dependencias: DependenciasDaEquipe,
  acesso: AcessoAoRestaurante,
  chamadoId: string,
  situacaoEsperada: SituacaoDoChamado,
): Promise<Resultado<null, ErroDeNegocio>> {
  const proibido = semPermissaoNaFila(acesso);
  if (proibido !== undefined) {
    return Resultado.falha(proibido);
  }
  const para = proximaSituacaoDoChamado(situacaoEsperada);
  if (para === null) {
    return Resultado.falha(transicaoInvalida(situacaoEsperada));
  }
  return paraResultado(
    await dependencias.equipe.mudarChamado(
      acesso,
      { id: chamadoId, de: situacaoEsperada, para },
      dependencias.relogio.agora(),
    ),
  );
}
