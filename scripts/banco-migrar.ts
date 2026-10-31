import path from 'node:path';
import { migrarPorUrl, TRILHA_INTERMEDIARIA } from '../pacotes/infraestrutura/src/index.ts';
import type { RelatorioDeMigracao } from '../pacotes/infraestrutura/src/index.ts';

export const PASTA_MIGRACOES = path.resolve(import.meta.dirname, '..', 'banco', 'migracoes');
// INTERMEDIARIO: trilha de migrações à parte: docs/adr/0017-intermediario-essencial.md
export const PASTA_MIGRACOES_INTERMEDIARIO = path.resolve(
  import.meta.dirname,
  '..',
  'banco',
  'migracoes-intermediario',
);

export function urlDeMigracao(ambiente: NodeJS.ProcessEnv): string {
  const url = ambiente.URL_BANCO_MIGRACAO;
  if (url === undefined || url === '') {
    throw new Error('Defina URL_BANCO_MIGRACAO com o usuário cardapio_migracao (veja .env.exemplo).');
  }
  return url;
}

async function executar(): Promise<void> {
  const url = urlDeMigracao(process.env);
  relatar(await migrarPorUrl(url, PASTA_MIGRACOES));
  relatar(await migrarPorUrl(url, PASTA_MIGRACOES_INTERMEDIARIO, TRILHA_INTERMEDIARIA));
}

function relatar(relatorio: RelatorioDeMigracao): void {
  console.log(`Migrações já aplicadas: ${String(relatorio.jaAplicadas)}.`);
  for (const nome of relatorio.aplicadas) {
    console.log(`Aplicada: ${nome}`);
  }
  if (relatorio.aplicadas.length === 0) {
    console.log('Nada a aplicar.');
  }
}

if (import.meta.main) {
  await executar();
}
