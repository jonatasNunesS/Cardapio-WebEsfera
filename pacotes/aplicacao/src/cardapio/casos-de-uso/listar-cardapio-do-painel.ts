import { Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import { semPermissao } from '../desfechos.ts';
import type { CardapioDoPainel } from '../portas/repositorio-do-cardapio.ts';
import type { DependenciasDoCardapio } from '../dependencias.ts';

export async function listarCardapioDoPainel(
  dependencias: DependenciasDoCardapio,
  acesso: AcessoAoRestaurante,
): Promise<Resultado<CardapioDoPainel, ErroDeNegocio>> {
  const proibido = semPermissao(acesso);
  if (proibido !== undefined) {
    return Resultado.falha(proibido);
  }
  return Resultado.ok(await dependencias.cardapio.listar(acesso.restauranteId));
}
