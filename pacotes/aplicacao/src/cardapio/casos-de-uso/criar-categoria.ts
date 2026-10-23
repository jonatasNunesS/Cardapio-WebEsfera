import { Resultado, validarCategoria, type DadosDaCategoria, type ErroDeNegocio } from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import { paraResultado, semPermissao } from '../desfechos.ts';
import type { CategoriaGuardada } from '../portas/repositorio-do-cardapio.ts';
import type { DependenciasDoCardapio } from '../dependencias.ts';

export async function criarCategoria(
  dependencias: DependenciasDoCardapio,
  acesso: AcessoAoRestaurante,
  dados: DadosDaCategoria,
): Promise<Resultado<CategoriaGuardada, ErroDeNegocio>> {
  const proibido = semPermissao(acesso);
  if (proibido !== undefined) {
    return Resultado.falha(proibido);
  }
  const categoria = validarCategoria(dados);
  if (!categoria.ok) {
    return categoria;
  }
  return paraResultado(
    await dependencias.cardapio.criarCategoria(acesso.restauranteId, categoria.valor.nome),
  );
}
