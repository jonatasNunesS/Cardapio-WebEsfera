import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const APPS_WEB = ['cardapio', 'painel', 'admin'];
const PADRAO_MODULO_PROIBIDO = /["'`](node:[a-z_/]+|pino(?:\/[\w-]+)?|@sentry\/node)["'`]/g;

export function encontrarModulosProibidos(codigo: string): string[] {
  return [...new Set([...codigo.matchAll(PADRAO_MODULO_PROIBIDO)].map((ocorrencia) => ocorrencia[1] ?? ''))];
}

function arquivosJs(pasta: string): string[] {
  return readdirSync(pasta, { recursive: true, encoding: 'utf8' })
    .filter((arquivo) => arquivo.endsWith('.js'))
    .map((arquivo) => path.join(pasta, arquivo));
}

export function verificarBundles(raiz: string): string[] {
  return APPS_WEB.flatMap((app) =>
    arquivosJs(path.join(raiz, 'apps', app, 'dist')).flatMap((arquivo) =>
      encontrarModulosProibidos(readFileSync(arquivo, 'utf8')).map(
        (modulo) => `${path.relative(raiz, arquivo)}: ${modulo}`,
      ),
    ),
  );
}

function executar(): void {
  const problemas = verificarBundles(process.cwd());
  if (problemas.length === 0) {
    console.log('verificar-bundle-web: nenhum módulo de Node nos bundles de cardapio, painel e admin.');
    return;
  }
  for (const problema of problemas) {
    console.error(problema);
  }
  console.error(
    'verificar-bundle-web: módulos de Node no bundle do navegador (docs/adr/0005-observabilidade.md).',
  );
  process.exitCode = 1;
}

if (import.meta.main) {
  executar();
}
