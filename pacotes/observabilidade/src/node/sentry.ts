import * as Sentry from '@sentry/node';
import { opcoesComunsDoSentry, temDsn, type OpcoesSentryBase } from '../opcoes-sentry.ts';

export interface OpcoesSentryNode extends OpcoesSentryBase {
  readonly transporte?: Sentry.NodeOptions['transport'];
}

export function iniciarSentryNode(opcoes: OpcoesSentryNode): boolean {
  if (!temDsn(opcoes)) {
    return false;
  }
  Sentry.init({
    ...opcoesComunsDoSentry(opcoes),
    // O tratador global da API é o único ponto de captura, para não reportar duas vezes: docs/adr/0005-observabilidade.md
    integrations: [Sentry.fastifyIntegration({ shouldHandleError: () => false })],
    ...(opcoes.transporte === undefined ? {} : { transport: opcoes.transporte }),
  });
  return true;
}

export async function aguardarEnvio(limiteMs = 2000): Promise<boolean> {
  return Sentry.isInitialized() ? Sentry.flush(limiteMs) : true;
}
