import { CODIGOS, criarErroDeNegocio, Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import { paraCartao } from '../cartao.ts';
import type { DependenciasDasMesas } from '../dependencias.ts';
import { listarMesas } from './listar-mesas.ts';

export async function obterCartaoDaMesa(
  dependencias: DependenciasDasMesas,
  acesso: AcessoAoRestaurante,
  mesaId: string,
): Promise<Resultado<{ readonly numero: number; readonly png: Uint8Array }, ErroDeNegocio>> {
  const lista = await listarMesas(dependencias, acesso);
  if (!lista.ok) {
    return lista;
  }
  const mesa = lista.valor.mesas.find((item) => item.id === mesaId);
  if (mesa === undefined) {
    return Resultado.falha(
      criarErroDeNegocio(CODIGOS.MESA_EDITAR_NAO_ENCONTRADA, 'Esta mesa não existe mais.'),
    );
  }
  return Resultado.ok({
    numero: mesa.numero,
    png: await dependencias.cartoes.cartao(paraCartao(lista.valor, mesa)),
  });
}
