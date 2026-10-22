import { ROTAS_DO_PAINEL, type RespostaSessaoDoPainel } from '@cardapio/contratos';
import { criarClienteDaApi, type RespostaDaApi } from '@cardapio/contratos/cliente';
import { useQuery } from '@tanstack/react-query';

export const api = criarClienteDaApi(ROTAS_DO_PAINEL.csrf);

export const CHAVE_DA_SESSAO = ['sessao'] as const;

export function useSessao() {
  return useQuery<RespostaDaApi<RespostaSessaoDoPainel>>({
    queryKey: CHAVE_DA_SESSAO,
    queryFn: () => api.pedir<RespostaSessaoDoPainel>('GET', ROTAS_DO_PAINEL.sessao),
  });
}
