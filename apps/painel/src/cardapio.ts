import { ROTAS_DO_CARDAPIO_NO_PAINEL, type RespostaCardapioDoPainel } from '@cardapio/contratos';
import type { Metodo, RespostaDaApi } from '@cardapio/contratos/cliente';
import { useToasts } from '@cardapio/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from './api.ts';

export const CHAVE_DO_CARDAPIO = ['cardapio'] as const;

export function useCardapio() {
  return useQuery<RespostaDaApi<RespostaCardapioDoPainel>>({
    queryKey: CHAVE_DO_CARDAPIO,
    queryFn: () => api.pedir<RespostaCardapioDoPainel>('GET', ROTAS_DO_CARDAPIO_NO_PAINEL.cardapio),
  });
}

export function useAtualizarCardapio() {
  const consultas = useQueryClient();
  return useCallback(() => consultas.invalidateQueries({ queryKey: CHAVE_DO_CARDAPIO }), [consultas]);
}

export function useAcaoNoCardapio() {
  const atualizar = useAtualizarCardapio();
  const toasts = useToasts();
  return useCallback(
    async (metodo: Metodo, rota: string, corpo: unknown, sucesso?: string) => {
      const resposta = await api.pedir(metodo, rota, corpo);
      if (!resposta.ok) {
        toasts.mostrar({ tipo: 'erro', texto: resposta.problema.detail });
      } else if (sucesso !== undefined) {
        toasts.mostrar({ tipo: 'sucesso', texto: sucesso });
      }
      await atualizar();
      return resposta.ok;
    },
    [atualizar, toasts],
  );
}
