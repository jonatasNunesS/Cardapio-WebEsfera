import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { montarRelease } from '../pacotes/config/src/release.ts';

const APPS_SERVIDOR = ['api', 'worker'];

export function comandosDeEnvio(app: string, release: string, projeto: string): string[][] {
  return [
    ['releases', 'new', release, '--project', projeto],
    ['sourcemaps', 'upload', '--release', release, '--project', projeto, path.join('apps', app, 'dist')],
    ['releases', 'finalize', release, '--project', projeto],
  ];
}

function versaoDoApp(raiz: string, app: string): string {
  const pacote = JSON.parse(readFileSync(path.join(raiz, 'apps', app, 'package.json'), 'utf8')) as {
    version: string;
  };
  return pacote.version;
}

function executar(): void {
  const {
    SENTRY_AUTH_TOKEN: token,
    SENTRY_ORG: org,
    SENTRY_PROJETO_BACKEND: projeto,
    COMMIT_SHA: commit,
  } = process.env;
  if (
    token === undefined ||
    token === '' ||
    org === undefined ||
    org === '' ||
    projeto === undefined ||
    projeto === ''
  ) {
    console.log(
      '::warning::Source maps não enviados: faltam SENTRY_AUTH_TOKEN, SENTRY_ORG ou SENTRY_PROJETO_BACKEND nos segredos do GitHub.',
    );
    return;
  }
  const raiz = process.cwd();
  for (const app of APPS_SERVIDOR) {
    const release = montarRelease(app, versaoDoApp(raiz, app), commit);
    for (const argumentos of comandosDeEnvio(app, release, projeto)) {
      execFileSync('pnpm', ['exec', 'sentry-cli', ...argumentos], { cwd: raiz, stdio: 'inherit' });
    }
  }
}

if (import.meta.main) {
  executar();
}
