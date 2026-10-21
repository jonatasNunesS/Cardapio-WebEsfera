import { amostragemPadrao, COLETA_SEM_DADO_PESSOAL, type AmbienteApp } from './coleta.ts';
import { limparBreadcrumb, limparEvento, limparSpan } from './limpeza.ts';

export interface OpcoesSentryBase {
  readonly app: string;
  readonly dsn: string | undefined;
  readonly release: string;
  readonly ambiente: AmbienteApp;
  readonly amostragemTraces?: number | undefined;
}

export function opcoesComunsDoSentry(opcoes: OpcoesSentryBase & { readonly dsn: string }) {
  return {
    dsn: opcoes.dsn,
    release: opcoes.release,
    environment: opcoes.ambiente,
    tracesSampleRate: opcoes.amostragemTraces ?? amostragemPadrao(opcoes.ambiente),
    dataCollection: { ...COLETA_SEM_DADO_PESSOAL, httpBodies: [] },
    initialScope: { tags: { app: opcoes.app } },
    beforeSend: <E extends object>(evento: E) => limparEvento(evento),
    beforeBreadcrumb: <B extends object>(passo: B) => limparBreadcrumb(passo),
    beforeSendSpan: <S extends object>(span: S) => limparSpan(span),
  };
}

export function temDsn<T extends OpcoesSentryBase>(opcoes: T): opcoes is T & { readonly dsn: string } {
  return opcoes.dsn !== undefined && opcoes.dsn !== '';
}
