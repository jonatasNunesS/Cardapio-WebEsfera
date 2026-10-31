import {
  EVENTO_SSE_PRONTO,
  EVENTOS_DA_MESA_NO_TEMPO_REAL,
  INTERVALO_DO_POLLING_DA_MESA_MS,
  ROTAS_DO_TEMPO_REAL,
} from '@cardapio/contratos/publico';
import { useEffect, useRef } from 'react';

export interface AvisosDaMesa {
  readonly aoMudar: () => void;
  readonly aoEncerrar: () => void;
}

// SSE só avisa e o cliente reconsulta; sem SSE, o polling de 10 s cobre: docs/adr/0017-intermediario-essencial.md
export function useAvisosDaMesa(avisos: AvisosDaMesa): void {
  const atual = useRef(avisos);
  atual.current = avisos;
  useEffect(() => {
    let polling: ReturnType<typeof setInterval> | undefined;
    const ligarPolling = () => {
      polling ??= setInterval(() => {
        atual.current.aoMudar();
      }, INTERVALO_DO_POLLING_DA_MESA_MS);
    };
    const desligarPolling = () => {
      clearInterval(polling);
      polling = undefined;
    };
    ligarPolling();
    const fonte = typeof EventSource === 'function' ? new EventSource(ROTAS_DO_TEMPO_REAL.mesa) : null;
    fonte?.addEventListener(EVENTO_SSE_PRONTO, () => {
      desligarPolling();
      atual.current.aoMudar();
    });
    for (const tipo of EVENTOS_DA_MESA_NO_TEMPO_REAL) {
      fonte?.addEventListener(tipo, () => {
        if (tipo === 'SessaoMesaEncerrada') {
          atual.current.aoEncerrar();
        }
        atual.current.aoMudar();
      });
    }
    if (fonte !== null) {
      fonte.onerror = ligarPolling;
    }
    return () => {
      desligarPolling();
      fonte?.close();
    };
  }, []);
}
