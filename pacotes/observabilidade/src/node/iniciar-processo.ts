import { readFileSync } from 'node:fs';
import { carregarAmbiente, montarRelease } from '@cardapio/config';
import { z } from 'zod';
import { esquemaAmbienteObservabilidade } from './ambiente.ts';
import { iniciarSentryNode } from './sentry.ts';

const esquemaPacote = z.object({ version: z.string() });

export function iniciarObservabilidadeDoProcesso(app: string, urlDoPacote: URL): boolean {
  const ambiente = carregarAmbiente(esquemaAmbienteObservabilidade);
  const pacote = esquemaPacote.parse(JSON.parse(readFileSync(urlDoPacote, 'utf8')));
  return iniciarSentryNode({
    app,
    dsn: ambiente.SENTRY_DSN_BACKEND,
    release: montarRelease(app, pacote.version, ambiente.COMMIT_SHA),
    ambiente: ambiente.APP_ENV,
    amostragemTraces: ambiente.SENTRY_AMOSTRAGEM_TRACES,
  });
}
