import { readFileSync } from 'node:fs';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, type UserConfig } from 'vite';
import { z } from 'zod';
import { montarRelease } from '../src/release.ts';
import { bloquearModulosDeNode } from './bloquear-modulos-de-node.ts';

const vazioComoAusente = (valor: unknown) => (valor === '' ? undefined : valor);

const esquemaAmbienteBuild = z.object({
  APP_ENV: z.enum(['local', 'preview', 'homologacao', 'producao']).default('local'),
  COMMIT_SHA: z.preprocess(vazioComoAusente, z.string().optional()),
  SENTRY_DSN_FRONTEND: z.preprocess(vazioComoAusente, z.url().optional()),
  SENTRY_AMOSTRAGEM_TRACES: z.preprocess(vazioComoAusente, z.coerce.number().min(0).max(1).optional()),
  SENTRY_AUTH_TOKEN: z.preprocess(vazioComoAusente, z.string().optional()),
  SENTRY_ORG: z.preprocess(vazioComoAusente, z.string().optional()),
  SENTRY_PROJETO_FRONTEND: z.preprocess(vazioComoAusente, z.string().optional()),
  URL_API_LOCAL: z.preprocess(vazioComoAusente, z.url().default('http://127.0.0.1:3000')),
  HTTPS_LOCAL_CERTIFICADO: z.preprocess(vazioComoAusente, z.string().optional()),
  HTTPS_LOCAL_CHAVE: z.preprocess(vazioComoAusente, z.string().optional()),
});

const esquemaPacote = z.object({ version: z.string() });

type AmbienteBuild = z.output<typeof esquemaAmbienteBuild>;

function pluginsDeEnvioDeMapas(ambiente: AmbienteBuild, release: string) {
  const { SENTRY_AUTH_TOKEN: token, SENTRY_ORG: org, SENTRY_PROJETO_FRONTEND: projeto } = ambiente;
  if (token === undefined) {
    return [];
  }
  if (org === undefined || projeto === undefined) {
    throw new Error(
      'Com SENTRY_AUTH_TOKEN, as variáveis SENTRY_ORG e SENTRY_PROJETO_FRONTEND são obrigatórias.',
    );
  }
  return sentryVitePlugin({
    org,
    project: projeto,
    authToken: token,
    release: { name: release },
    sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
    telemetry: false,
  });
}

export interface OpcoesDoServidorLocal {
  readonly porta: number;
}

// Com certificado local (mkcert), o servidor de desenvolvimento abre para a rede em HTTPS, para testar no celular.
export function httpsDaRedeLocal(
  ambiente: Pick<AmbienteBuild, 'APP_ENV' | 'HTTPS_LOCAL_CERTIFICADO' | 'HTTPS_LOCAL_CHAVE'>,
) {
  const { HTTPS_LOCAL_CERTIFICADO: certificado, HTTPS_LOCAL_CHAVE: chave } = ambiente;
  if (certificado === undefined && chave === undefined) {
    return {};
  }
  if (ambiente.APP_ENV !== 'local' || certificado === undefined || chave === undefined) {
    throw new Error('HTTPS_LOCAL_CERTIFICADO e HTTPS_LOCAL_CHAVE vão juntos, e só com APP_ENV=local.');
  }
  return { host: '0.0.0.0', https: { cert: readFileSync(certificado), key: readFileSync(chave) } };
}

// Cada app chama /api no próprio host; o proxy mantém o Host para a API conferir o app: docs/adr/0003-dominios-e-ambientes.md
function servidorLocal(ambiente: AmbienteBuild, opcoes: OpcoesDoServidorLocal) {
  return {
    host: '127.0.0.1',
    port: opcoes.porta,
    strictPort: true,
    proxy: { '/api': { target: ambiente.URL_API_LOCAL, changeOrigin: false } },
    ...httpsDaRedeLocal(ambiente),
  };
}

export function criarConfiguracaoVite(
  app: string,
  urlDoPacote: URL,
  servidor?: OpcoesDoServidorLocal,
): UserConfig {
  const ambiente = esquemaAmbienteBuild.parse(process.env);
  const { version } = esquemaPacote.parse(JSON.parse(readFileSync(urlDoPacote, 'utf8')));
  const release = montarRelease(app, version, ambiente.COMMIT_SHA);
  return defineConfig({
    plugins: [react(), bloquearModulosDeNode(), ...pluginsDeEnvioDeMapas(ambiente, release)],
    define: {
      __OBSERVABILIDADE_WEB__: JSON.stringify({
        dsn: ambiente.SENTRY_DSN_FRONTEND,
        release,
        ambiente: ambiente.APP_ENV,
        amostragemTraces: ambiente.SENTRY_AMOSTRAGEM_TRACES,
      }),
    },
    build: { sourcemap: 'hidden' },
    ...(servidor === undefined ? {} : { server: servidorLocal(ambiente, servidor) }),
  });
}
