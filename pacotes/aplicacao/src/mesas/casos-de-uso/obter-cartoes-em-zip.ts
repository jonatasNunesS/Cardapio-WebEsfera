import { Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import { paraCartao } from '../cartao.ts';
import type { DependenciasDasMesas } from '../dependencias.ts';
import { listarMesas } from './listar-mesas.ts';

export async function obterCartoesEmZip(
  dependencias: DependenciasDasMesas,
  acesso: AcessoAoRestaurante,
): Promise<Resultado<{ readonly slug: string; readonly zip: AsyncIterable<Uint8Array> }, ErroDeNegocio>> {
  const lista = await listarMesas(dependencias, acesso);
  if (!lista.ok) {
    return lista;
  }
  const ativas = lista.valor.mesas.filter((mesa) => mesa.ativa);
  return Resultado.ok({
    slug: lista.valor.slug,
    zip: dependencias.cartoes.zip(ativas.map((mesa) => paraCartao(lista.valor, mesa))),
  });
}
