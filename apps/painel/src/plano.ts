import {
  CABECALHO_IDEMPOTENCIA,
  ROTAS_DA_COBRANCA,
  type RespostaCheckout,
  type RespostaPlanoECobranca,
} from '@cardapio/contratos';
import type { RespostaDaApi } from '@cardapio/contratos/cliente';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from './api.ts';

export const CHAVE_DO_PLANO = ['plano'] as const;

export function usePlano() {
  return useQuery<RespostaDaApi<RespostaPlanoECobranca>>({
    queryKey: CHAVE_DO_PLANO,
    queryFn: () => api.pedir<RespostaPlanoECobranca>('GET', ROTAS_DA_COBRANCA.plano),
  });
}

export interface PedidoDeAssinatura {
  readonly codigoDoPlano: string;
  readonly emailDoPagador: string;
  readonly chaveDeIdempotencia: string;
}

export function useAssinar() {
  const consultas = useQueryClient();
  return useCallback(
    async (pedido: PedidoDeAssinatura) => {
      const resposta = await api.pedir<RespostaCheckout>(
        'POST',
        ROTAS_DA_COBRANCA.assinatura,
        { codigoDoPlano: pedido.codigoDoPlano, emailDoPagador: pedido.emailDoPagador },
        { [CABECALHO_IDEMPOTENCIA]: pedido.chaveDeIdempotencia },
      );
      await consultas.invalidateQueries({ queryKey: CHAVE_DO_PLANO });
      return resposta;
    },
    [consultas],
  );
}
