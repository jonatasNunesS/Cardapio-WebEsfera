import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const INSTANTANEOS = path.join(RAIZ, 'pacotes', 'ui', 'visual', 'instantaneos');
const RESULTADOS = path.join(RAIZ, 'pacotes', 'ui', 'visual', 'resultados');

export function imagemDoPlaywright(raiz: string): string {
  const pacote = JSON.parse(readFileSync(path.join(raiz, 'package.json'), 'utf8')) as {
    devDependencies: Record<string, string>;
  };
  const versao = pacote.devDependencies['@playwright/test'];
  if (versao === undefined) {
    throw new Error('@playwright/test precisa estar nas devDependencies da raiz.');
  }
  return `mcr.microsoft.com/playwright:v${versao}-noble`;
}

export function roteiroNoConteiner(atualizar: boolean): string {
  return [
    'set -eu',
    'mkdir -p /repo',
    'tar -C /origem --exclude=node_modules --exclude=storybook-static --exclude=.git --exclude=resultados -cf - . | tar -C /repo -xf -',
    'cd /repo',
    'npm install --global --silent pnpm@12.14.0',
    'pnpm install --frozen-lockfile --config.engine-strict=false',
    'pnpm storybook:build',
    `pnpm --filter @cardapio/ui ${atualizar ? 'visual:atualizar' : 'visual'} || status=$?`,
    'cp -r pacotes/ui/visual/instantaneos/. /instantaneos/ 2>/dev/null || true',
    'cp -r pacotes/ui/visual/resultados/. /resultados/ 2>/dev/null || true',
    'exit ${status:-0}',
  ].join('\n');
}

function argumentosDoProxy(): string[] {
  const proxy = process.env.HTTPS_PROXY;
  const ca = process.env.CAMINHO_CA_EXTRA;
  return [
    ...(proxy === undefined
      ? []
      : [
          '--network',
          'host',
          '-e',
          `HTTPS_PROXY=${proxy}`,
          '-e',
          `HTTP_PROXY=${proxy}`,
          '-e',
          'NO_PROXY=127.0.0.1,localhost',
        ]),
    ...(ca === undefined ? [] : ['-v', `${ca}:/ca-extra.crt:ro`, '-e', 'NODE_EXTRA_CA_CERTS=/ca-extra.crt']),
  ];
}

function executar(): void {
  const atualizar = process.argv.includes('--atualizar');
  mkdirSync(INSTANTANEOS, { recursive: true });
  rmSync(RESULTADOS, { recursive: true, force: true });
  mkdirSync(RESULTADOS, { recursive: true });
  execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '--ipc=host',
      '-v',
      `${RAIZ}:/origem:ro`,
      '-v',
      `${INSTANTANEOS}:/instantaneos`,
      '-v',
      `${RESULTADOS}:/resultados`,
      '-e',
      'CI=1',
      ...argumentosDoProxy(),
      imagemDoPlaywright(RAIZ),
      'bash',
      '-c',
      roteiroNoConteiner(atualizar),
    ],
    { stdio: 'inherit' },
  );
}

if (import.meta.main) {
  executar();
}
