import { limiteDeMesasPelaAssinatura } from '@cardapio/dominio';
import type { RepositorioDeAssinaturas } from '../portas/repositorio-de-assinaturas.ts';

export async function obterLimiteDeMesas(
  dependencias: { readonly assinaturas: RepositorioDeAssinaturas },
  restauranteId: string,
): Promise<number> {
  const atual = await dependencias.assinaturas.assinaturaAtual(restauranteId);
  return limiteDeMesasPelaAssinatura(
    atual === null ? null : { situacao: atual.situacao, limiteMesas: atual.plano.limiteMesas },
  );
}
