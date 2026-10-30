import { ROTAS_DO_ATENDIMENTO, type RespostaSessaoDaMesa } from '@cardapio/contratos/publico';
import { useEffect } from 'react';

export const INTERVALO_DA_SESSAO_MS = 30_000;

export function useAoEncerrar(aoEncerrar: () => void): void {
  useEffect(() => {
    const conferir = () => {
      void fetch(ROTAS_DO_ATENDIMENTO.sessao, { credentials: 'same-origin' })
        .then(async (resposta) => (resposta.ok ? ((await resposta.json()) as RespostaSessaoDaMesa) : null))
        .then(
          (sessao) => {
            if (sessao?.situacao === 'encerrada') {
              aoEncerrar();
            }
          },
          () => undefined,
        );
    };
    const intervalo = setInterval(conferir, INTERVALO_DA_SESSAO_MS);
    conferir();
    return () => {
      clearInterval(intervalo);
    };
  }, [aoEncerrar]);
}
