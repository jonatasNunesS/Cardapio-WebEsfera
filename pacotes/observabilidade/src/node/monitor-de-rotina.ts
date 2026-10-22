import * as Sentry from '@sentry/node';

export interface ConfiguracaoDoMonitor {
  readonly aCadaMinutos: number;
  readonly margemMinutos: number;
  readonly duracaoMaximaMinutos: number;
}

function paraSentry(configuracao: ConfiguracaoDoMonitor) {
  return {
    schedule: { type: 'interval' as const, value: configuracao.aCadaMinutos, unit: 'minute' as const },
    checkinMargin: configuracao.margemMinutos,
    maxRuntime: configuracao.duracaoMaximaMinutos,
    timezone: 'UTC',
  };
}

export function monitorarRotina<T>(
  slug: string,
  configuracao: ConfiguracaoDoMonitor,
  executar: () => Promise<T>,
): Promise<T> {
  return Sentry.withMonitor(slug, executar, paraSentry(configuracao));
}

export function criarPulsoDeRotina(
  slug: string,
  configuracao: ConfiguracaoDoMonitor,
  agora: () => number = Date.now,
): () => void {
  let ultimo = Number.NEGATIVE_INFINITY;
  return () => {
    if (agora() - ultimo < configuracao.aCadaMinutos * 60_000) {
      return;
    }
    ultimo = agora();
    Sentry.captureCheckIn({ monitorSlug: slug, status: 'ok' }, paraSentry(configuracao));
  };
}
