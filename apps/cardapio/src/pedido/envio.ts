import {
  CABECALHO_DA_CHAVE_DE_IDEMPOTENCIA,
  rotaCom,
  ROTAS_DO_PEDIDO,
  type RespostaPedido,
} from '@cardapio/contratos/publico';
import type { EstadoDoCarrinho } from './carrinho.ts';

export interface ProblemaDoPedido {
  readonly codigo: string;
  readonly detail: string;
  readonly detalhes?: { readonly pratoIds?: readonly string[] };
}

export type DesfechoDoEnvio =
  | { readonly tipo: 'criado'; readonly pedido: RespostaPedido }
  | { readonly tipo: 'recusado'; readonly problema: ProblemaDoPedido }
  | { readonly tipo: 'sem-conexao' };

async function lerProblema(resposta: Response): Promise<ProblemaDoPedido> {
  return (await resposta.json()) as ProblemaDoPedido;
}

export async function enviarPedido(estado: EstadoDoCarrinho, chave: string): Promise<DesfechoDoEnvio> {
  const resposta = await fetch(ROTAS_DO_PEDIDO.pedidos, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', [CABECALHO_DA_CHAVE_DE_IDEMPOTENCIA]: chave },
    body: JSON.stringify({ itens: estado.linhas }),
  }).catch(() => null);
  if (resposta === null || resposta.status >= 500) {
    return { tipo: 'sem-conexao' };
  }
  return resposta.ok
    ? { tipo: 'criado', pedido: (await resposta.json()) as RespostaPedido }
    : { tipo: 'recusado', problema: await lerProblema(resposta) };
}

export async function consultarPedido(id: string): Promise<RespostaPedido | ProblemaDoPedido | null> {
  const resposta = await fetch(rotaCom(ROTAS_DO_PEDIDO.pedido, { id }), { credentials: 'same-origin' }).catch(
    () => null,
  );
  if (resposta === null || resposta.status >= 500) {
    return null;
  }
  return resposta.ok ? ((await resposta.json()) as RespostaPedido) : lerProblema(resposta);
}

export async function cancelarPedido(id: string): Promise<ProblemaDoPedido | null> {
  const resposta = await fetch(rotaCom(ROTAS_DO_PEDIDO.cancelamento, { id }), {
    method: 'POST',
    credentials: 'same-origin',
  }).catch(() => null);
  if (resposta === null) {
    return { codigo: 'SEM_CONEXAO', detail: 'Sem conexão. Tente de novo.' };
  }
  return resposta.ok ? null : lerProblema(resposta);
}
