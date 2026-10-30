import { resumirConta, Resultado, type ErroDeNegocio, type ResumoDaConta } from '@cardapio/dominio';
import { SESSAO_EXPIRADA } from '../../pedidos/falhas.ts';
import type { SessaoDoCliente } from '../../pedidos/portas/repositorio-de-pedidos.ts';
import type { DependenciasDoAtendimento } from '../dependencias.ts';
import type { ItemDaConta } from '../portas/repositorio-de-atendimento.ts';

export interface ContaDaMesa extends ResumoDaConta {
  readonly itens: readonly ItemDaConta[];
}

export async function obterResumoDaConta(
  dependencias: DependenciasDoAtendimento,
  sessao: SessaoDoCliente,
): Promise<Resultado<ContaDaMesa, ErroDeNegocio>> {
  const pedidos = await dependencias.atendimento.pedidosDaSessao(sessao, dependencias.relogio.agora());
  if (pedidos === 'sessao-expirada') {
    return Resultado.falha(SESSAO_EXPIRADA);
  }
  const itens = pedidos.filter((pedido) => pedido.situacao !== 'cancelado').flatMap((pedido) => pedido.itens);
  return Resultado.ok({ ...resumirConta(pedidos), itens });
}
