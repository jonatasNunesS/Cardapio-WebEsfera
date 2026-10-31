export const ROTAS_DO_TEMPO_REAL = {
  painel: '/api/v1/tempo-real',
  mesa: '/api/v1/mesa/tempo-real',
} as const;

export const EVENTO_SSE_PRONTO = 'pronto';

export const EVENTOS_DA_MESA_NO_TEMPO_REAL = [
  'PedidoSituacaoAlterada',
  'ChamadoSituacaoAlterada',
  'SessaoMesaEncerrada',
  'SessaoMesaExpirada',
] as const;

export const INTERVALO_DO_BATIMENTO_SSE_MS = 25_000;
export const INTERVALO_DO_POLLING_DA_MESA_MS = 10_000;
