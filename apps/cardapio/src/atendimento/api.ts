import {
  CABECALHO_DA_CHAVE_DE_IDEMPOTENCIA,
  rotaCom,
  ROTAS_DO_ATENDIMENTO,
  type RespostaChamado,
  type RespostaConta,
  type TipoDeChamadoNaApi,
} from '@cardapio/contratos/publico';

export interface Problema {
  readonly codigo: string;
  readonly detail: string;
}

export type Lido<T> =
  { readonly ok: true; readonly dados: T } | { readonly ok: false; readonly problema: Problema | null };

async function pedir<T>(endereco: string, opcoes: RequestInit = {}): Promise<Lido<T>> {
  const resposta = await fetch(endereco, { credentials: 'same-origin', ...opcoes }).catch(() => null);
  if (resposta === null || resposta.status >= 500) {
    return { ok: false, problema: null };
  }
  if (!resposta.ok) {
    return { ok: false, problema: (await resposta.json()) as Problema };
  }
  return { ok: true, dados: (resposta.status === 204 ? null : await resposta.json()) as T };
}

const ROTA_DO_TIPO = { garcom: ROTAS_DO_ATENDIMENTO.garcom, conta: ROTAS_DO_ATENDIMENTO.conta } as const;

export const abrirChamado = (tipo: TipoDeChamadoNaApi, chave: string) =>
  pedir<RespostaChamado>(ROTA_DO_TIPO[tipo], {
    method: 'POST',
    headers: { [CABECALHO_DA_CHAVE_DE_IDEMPOTENCIA]: chave },
  });

export const lerChamado = (id: string) =>
  pedir<RespostaChamado>(rotaCom(ROTAS_DO_ATENDIMENTO.chamado, { id }));

export const cancelarChamado = (id: string) =>
  pedir<null>(rotaCom(ROTAS_DO_ATENDIMENTO.cancelamento, { id }), { method: 'POST' });

export const lerConta = () => pedir<RespostaConta>(ROTAS_DO_ATENDIMENTO.resumo);
