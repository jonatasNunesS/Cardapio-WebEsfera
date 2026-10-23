import { Resultado, validarPrato, type DadosDoPrato, type ErroDeNegocio } from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import { paraResultado, semPermissao } from '../desfechos.ts';
import type { PratoGuardado } from '../portas/repositorio-do-cardapio.ts';
import type { DependenciasDoCardapio } from '../dependencias.ts';
import { paraGravar } from '../prato-para-gravar.ts';

export async function criarPrato(
  dependencias: DependenciasDoCardapio,
  acesso: AcessoAoRestaurante,
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
  return paraResultado(await dependencias.cardapio.criarPrato(acesso.restauranteId, paraGravar(prato.valor)));
}
