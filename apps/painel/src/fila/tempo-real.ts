import { EVENTOS } from '@cardapio/contratos';
import { EVENTO_SSE_PRONTO, ROTAS_DO_TEMPO_REAL } from '@cardapio/contratos/publico';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { CHAVE_DA_FILA } from './api-da-fila.ts';

export type EstadoDaConexao = 'conectando' | 'ao-vivo' | 'reconectando';

const ESPERA_MINIMA_MS = 1000;
const ESPERA_MAXIMA_MS = 30_000;
const TIPOS = Object.keys(EVENTOS);

export function esperaDaTentativa(tentativa: number): number {
  return Math.min(ESPERA_MAXIMA_MS, ESPERA_MINIMA_MS * 2 ** tentativa);
}

export function useTempoRealDoPainel(aoAvisar: (tipo: string) => void): EstadoDaConexao {
  const consultas = useQueryClient();
  const [estado, setEstado] = useState<EstadoDaConexao>('conectando');
  const aviso = useRef(aoAvisar);
  aviso.current = aoAvisar;

  useEffect(() => {
    let fonte: EventSource | null = null;
    let tentativa = 0;
    let espera: ReturnType<typeof setTimeout> | undefined;
    const reconsultar = () => consultas.invalidateQueries({ queryKey: CHAVE_DA_FILA });
    const conectar = () => {
      fonte = new EventSource(ROTAS_DO_TEMPO_REAL.painel);
      fonte.addEventListener(EVENTO_SSE_PRONTO, () => {
        tentativa = 0;
        setEstado('ao-vivo');
        void reconsultar();
      });
      for (const tipo of TIPOS) {
        fonte.addEventListener(tipo, () => {
          aviso.current(tipo);
          void reconsultar();
        });
      }
      fonte.onerror = () => {
        fonte?.close();
        setEstado('reconectando');
        espera = setTimeout(conectar, esperaDaTentativa(tentativa));
        tentativa += 1;
      };
    };
    conectar();
    return () => {
      clearTimeout(espera);
      fonte?.close();
    };
  }, [consultas]);
  return estado;
}
