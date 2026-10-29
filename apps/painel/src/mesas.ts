import { ROTAS_DAS_MESAS_NO_PAINEL, type RespostaMesasDoPainel } from '@cardapio/contratos';
import type { Metodo, RespostaDaApi } from '@cardapio/contratos/cliente';
import { useToasts } from '@cardapio/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from './api.ts';

export const CHAVE_DAS_MESAS = ['mesas'] as const;

export function useMesas() {
  return useQuery<RespostaDaApi<RespostaMesasDoPainel>>({
    queryKey: CHAVE_DAS_MESAS,
    queryFn: () => api.pedir<RespostaMesasDoPainel>('GET', ROTAS_DAS_MESAS_NO_PAINEL.mesas),
  });
}

export function useAcaoNasMesas() {
  const consultas = useQueryClient();
  const toasts = useToasts();
  return useCallback(
    async (metodo: Metodo, rota: string, corpo: unknown, sucesso: string) => {
      const resposta = await api.pedir(metodo, rota, corpo);
      toasts.mostrar(
        resposta.ok ? { tipo: 'sucesso', texto: sucesso } : { tipo: 'erro', texto: resposta.problema.detail },
      );
      await consultas.invalidateQueries({ queryKey: CHAVE_DAS_MESAS });
      return resposta.ok;
    },
    [consultas, toasts],
  );
}
