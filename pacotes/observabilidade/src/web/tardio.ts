import type { OpcoesSentryWeb } from './sentry-web.ts';

type Reportar = (erro: unknown, extra?: Readonly<Record<string, unknown>>) => unknown;

export interface SentryTardio {
  reportar(erro: unknown, extra?: Readonly<Record<string, unknown>>): void;
}

export type CarregarSentry = () => Promise<{
  iniciarSentryWeb(opcoes: OpcoesSentryWeb): boolean;
  reportarErroWeb: Reportar;
}>;

export type Agendar = (tarefa: () => void) => void;

const carregarDePadrao: CarregarSentry = () => import('./sentry-web.ts');

export const depoisDaPrimeiraPintura: Agendar = (tarefa) => {
  requestAnimationFrame(() => {
    setTimeout(tarefa, 0);
  });
};

export function iniciarSentryDepois(
  opcoes: OpcoesSentryWeb,
  agendar: Agendar = depoisDaPrimeiraPintura,
  carregar: CarregarSentry = carregarDePadrao,
): SentryTardio {
  const pendentes: Parameters<Reportar>[] = [];
  let reportar: Reportar | undefined;
  agendar(() => {
    void carregar().then(
      (sentry) => {
        sentry.iniciarSentryWeb({ ...opcoes, medirDesempenho: true });
        reportar = sentry.reportarErroWeb;
        for (const argumentos of pendentes.splice(0)) {
          sentry.reportarErroWeb(...argumentos);
        }
      },
      () => {
        pendentes.length = 0;
      },
    );
  });
  return {
    reportar(erro, extra) {
      if (reportar === undefined) {
        pendentes.push([erro, extra]);
      } else {
        reportar(erro, extra);
      }
    },
  };
}
