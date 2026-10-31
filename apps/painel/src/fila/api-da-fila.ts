import { ROTAS_DA_EQUIPE, type RespostaFila } from '@cardapio/contratos';
import type { RespostaDaApi } from '@cardapio/contratos/cliente';
import { useToasts } from '@cardapio/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '../api.ts';

export const CHAVE_DA_FILA = ['fila'] as const;

export function useFila() {
  return useQuery<RespostaDaApi<RespostaFila>>({
    queryKey: CHAVE_DA_FILA,
    queryFn: () => api.pedir<RespostaFila>('GET', ROTAS_DA_EQUIPE.fila),
  });
}

export type AcaoNaFila = (rota: string, corpo: unknown, sucesso: string) => Promise<RespostaDaApi<unknown>>;

export function useAcaoNaFila(): AcaoNaFila {
  const consultas = useQueryClient();
  const toasts = useToasts();
  return useCallback(
    async (rota, corpo, sucesso) => {
      const resposta = await api.pedir('POST', rota, corpo);
      if (resposta.ok) {
        toasts.mostrar({ tipo: 'sucesso', texto: sucesso });
      } else if (
        resposta.status !== 409 ||
        resposta.problema.codigo !== 'EQUIPE_ENCERRAR_PENDENCIAS_ABERTAS'
      ) {
        toasts.mostrar({ tipo: 'erro', texto: resposta.problema.detail });
      }
      await consultas.invalidateQueries({ queryKey: CHAVE_DA_FILA });
      return resposta;
    },
    [consultas, toasts],
  );
}
