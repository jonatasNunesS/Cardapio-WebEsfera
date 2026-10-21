import path from 'node:path';
import { migrarPorUrl } from '../pacotes/infraestrutura/src/index.ts';

export const PASTA_MIGRACOES = path.resolve(import.meta.dirname, '..', 'banco', 'migracoes');

export function urlDeMigracao(ambiente: NodeJS.ProcessEnv): string {
  const url = ambiente.URL_BANCO_MIGRACAO;
  if (url === undefined || url === '') {
    throw new Error('Defina URL_BANCO_MIGRACAO com o usuário cardapio_migracao (veja .env.exemplo).');
  }
  return url;
}

async function executar(): Promise<void> {
  const relatorio = await migrarPorUrl(urlDeMigracao(process.env), PASTA_MIGRACOES);
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
