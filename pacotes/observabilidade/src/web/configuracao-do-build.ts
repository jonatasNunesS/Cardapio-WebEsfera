import type { AmbienteApp } from '../coleta.ts';

export interface ConfiguracaoObservabilidadeWeb {
  readonly dsn: string | undefined;
  readonly release: string;
  readonly ambiente: AmbienteApp;
  readonly amostragemTraces: number | undefined;
}

declare const __OBSERVABILIDADE_WEB__: ConfiguracaoObservabilidadeWeb;

export function configuracaoDoBuild(): ConfiguracaoObservabilidadeWeb {
  return __OBSERVABILIDADE_WEB__;
}
