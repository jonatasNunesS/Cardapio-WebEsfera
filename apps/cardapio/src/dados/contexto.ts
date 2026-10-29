import type { RespostaCardapioPublico } from '@cardapio/contratos';
import { useOutletContext } from 'react-router';
import type { MesaLembrada } from './lembranca.ts';

export interface MesaPronta {
  readonly mesa: MesaLembrada;
  readonly cardapio: RespostaCardapioPublico;
  readonly codigo: string;
  readonly online: boolean;
}

export function useMesaPronta(): MesaPronta {
  return useOutletContext<MesaPronta>();
}

export function caminhoDaMesa(mesa: MesaLembrada, codigo: string, trecho = ''): string {
  return `/${mesa.slug}/mesa/${String(mesa.numero)}${trecho}?c=${encodeURIComponent(codigo)}`;
}

export function useCaminho(): (trecho?: string) => string {
  const { mesa, codigo } = useMesaPronta();
  return (trecho = '') => caminhoDaMesa(mesa, codigo, trecho);
}
