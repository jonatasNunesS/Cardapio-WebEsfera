import {
  ROTAS_DA_PLATAFORMA,
  type RespostaRestaurantesDaPlataforma,
  type RespostaVisaoGeral,
} from '@cardapio/contratos';
import type { RespostaDaApi } from '@cardapio/contratos/cliente';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.ts';

export const CHAVE_DOS_RESTAURANTES = ['plataforma', 'restaurantes'] as const;
export const CHAVE_DA_VISAO_GERAL = ['plataforma', 'visao-geral'] as const;

export function useRestaurantes() {
  return useQuery<RespostaDaApi<RespostaRestaurantesDaPlataforma>>({
    queryKey: CHAVE_DOS_RESTAURANTES,
    queryFn: () => api.pedir('GET', ROTAS_DA_PLATAFORMA.restaurantes),
  });
}

export function useVisaoGeral() {
  return useQuery<RespostaDaApi<RespostaVisaoGeral>>({
    queryKey: CHAVE_DA_VISAO_GERAL,
    queryFn: () => api.pedir('GET', ROTAS_DA_PLATAFORMA.visaoGeral),
  });
}

export const NOMES_DAS_SITUACOES: Readonly<Record<string, string>> = {
  teste: 'Teste',
  ativo: 'Ativo',
  carencia: 'Carência',
  inadimplente: 'Inadimplente',
  suspenso: 'Suspenso',
  cancelado: 'Cancelado',
};
