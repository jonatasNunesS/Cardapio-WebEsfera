import { Resultado, validarPrato, type DadosDoPrato, type ErroDeNegocio } from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import { paraResultado, semPermissao } from '../desfechos.ts';
import type { ItemVersionado, PratoGuardado } from '../portas/repositorio-do-cardapio.ts';
import type { DependenciasDoCardapio } from '../dependencias.ts';
import { paraGravar } from '../prato-para-gravar.ts';

export async function editarPrato(
  dependencias: DependenciasDoCardapio,
  acesso: AcessoAoRestaurante,
  item: ItemVersionado,
  dados: DadosDoPrato,
): Promise<Resultado<PratoGuardado, ErroDeNegocio>> {
  const proibido = semPermissao(acesso);
  if (proibido !== undefined) {
    return Resultado.falha(proibido);
  }
  const prato = validarPrato(dados);
  if (!prato.ok) {
    return prato;
  }
  return paraResultado(
    await dependencias.cardapio.editarPrato(acesso.restauranteId, item, paraGravar(prato.valor)),
  );
}
