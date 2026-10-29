import * as Sentry from '@sentry/react';
import { limparValor } from '../limpeza.ts';
import { opcoesComunsDoSentry, temDsn, type OpcoesSentryBase } from '../opcoes-sentry.ts';

export interface OpcoesSentryWeb extends OpcoesSentryBase {
  readonly transporte?: Sentry.BrowserOptions['transport'];
  readonly medirDesempenho?: boolean | undefined;
}

export function iniciarSentryWeb(opcoes: OpcoesSentryWeb): boolean {
  if (!temDsn(opcoes)) {
    return false;
  }
  Sentry.init({
    ...opcoesComunsDoSentry(opcoes),
    ...(opcoes.transporte === undefined ? {} : { transport: opcoes.transporte }),
    ...(opcoes.medirDesempenho === true ? { integrations: [Sentry.browserTracingIntegration()] } : {}),
  });
  return true;
}

export function reportarErroWeb(erro: unknown, extra?: Readonly<Record<string, unknown>>): string {
  return Sentry.withScope((escopo) => {
    if (extra !== undefined) {
      escopo.setExtras(limparValor(extra) as Record<string, unknown>);
    }
    return Sentry.captureException(erro);
  });
}
