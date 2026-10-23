import { Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import { paraResultado, semPermissao } from '../desfechos.ts';
import type { ItemVersionado } from '../portas/repositorio-do-cardapio.ts';
import type { DependenciasDoCardapio } from '../dependencias.ts';

export async function removerPrato(
  dependencias: DependenciasDoCardapio,
  acesso: AcessoAoRestaurante,
  item: ItemVersionado,
): Promise<Resultado<null, ErroDeNegocio>> {
  const proibido = semPermissao(acesso);
  if (proibido !== undefined) {
    return Resultado.falha(proibido);
  }
  return paraResultado(await dependencias.cardapio.removerPrato(acesso.restauranteId, item));
}
