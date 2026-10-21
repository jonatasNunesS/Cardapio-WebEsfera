import * as Sentry from '@sentry/react';
import { limparValor } from '../limpeza.ts';
import { opcoesComunsDoSentry, temDsn, type OpcoesSentryBase } from '../opcoes-sentry.ts';

export interface OpcoesSentryWeb extends OpcoesSentryBase {
  readonly transporte?: Sentry.BrowserOptions['transport'];
}

export function iniciarSentryWeb(opcoes: OpcoesSentryWeb): boolean {
  if (!temDsn(opcoes)) {
    return false;
  }
  Sentry.init({
    ...opcoesComunsDoSentry(opcoes),
    ...(opcoes.transporte === undefined ? {} : { transport: opcoes.transporte }),
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
