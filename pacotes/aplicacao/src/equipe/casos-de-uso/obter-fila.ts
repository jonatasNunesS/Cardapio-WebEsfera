import { Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import type { DependenciasDaEquipe } from '../dependencias.ts';
import { semPermissaoNaFila } from '../desfechos.ts';
import type { FilaDaEquipe } from '../portas/repositorio-da-equipe.ts';

export async function obterFila(
  dependencias: DependenciasDaEquipe,
  acesso: AcessoAoRestaurante,
): Promise<Resultado<FilaDaEquipe, ErroDeNegocio>> {
  const proibido = semPermissaoNaFila(acesso);
  if (proibido !== undefined) {
    return Resultado.falha(proibido);
  }
  return Resultado.ok(await dependencias.equipe.fila(acesso, dependencias.relogio.agora()));
}
