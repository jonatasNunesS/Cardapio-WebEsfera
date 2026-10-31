import { Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import type { DependenciasDaPlataforma } from '../dependencias.ts';
import { RESTAURANTE_NAO_ENCONTRADO } from '../falhas.ts';
import type { AcessoDoAdmin, FinanceiroDoRestaurante } from '../portas/repositorio-da-plataforma.ts';

export async function verFinanceiro(
  dependencias: DependenciasDaPlataforma,
  acesso: AcessoDoAdmin,
  slug: string,
): Promise<Resultado<FinanceiroDoRestaurante, ErroDeNegocio>> {
  const restauranteId = await dependencias.plataforma.resolver(acesso, slug);
  const financeiro = restauranteId === null ? null : await dependencias.plataforma.financeiro(restauranteId);
  return financeiro === null ? Resultado.falha(RESTAURANTE_NAO_ENCONTRADO) : Resultado.ok(financeiro);
}
