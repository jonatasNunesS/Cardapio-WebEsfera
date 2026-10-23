import { Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import { paraResultado, semPermissao } from '../desfechos.ts';
import type { PratoGuardado, SituacaoDoPrato } from '../portas/repositorio-do-cardapio.ts';
import type { DependenciasDoCardapio } from '../dependencias.ts';

export async function alterarSituacaoDoPrato(
  dependencias: DependenciasDoCardapio,
  acesso: AcessoAoRestaurante,
  situacao: SituacaoDoPrato,
): Promise<Resultado<PratoGuardado, ErroDeNegocio>> {
  const proibido = semPermissao(acesso);
  if (proibido !== undefined) {
    return Resultado.falha(proibido);
  }
  return paraResultado(await dependencias.cardapio.alterarSituacaoDoPrato(acesso.restauranteId, situacao));
}
