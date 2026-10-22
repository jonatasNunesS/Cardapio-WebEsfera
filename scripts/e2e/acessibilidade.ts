import { createRequire } from 'node:module';
import { expect, type Page } from '@playwright/test';

const CAMINHO_DO_AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

interface Violacao {
  readonly id: string;
  readonly nodes: readonly { readonly target: readonly string[] }[];
}

interface JanelaComAxe {
  readonly axe: { run: () => Promise<{ violations: Violacao[] }> };
}

export async function semViolacoesDeAcessibilidade(pagina: Page): Promise<void> {
  await pagina.addScriptTag({ path: CAMINHO_DO_AXE });
  const violacoes = await pagina.evaluate(
    async () => (await (globalThis as unknown as JanelaComAxe).axe.run()).violations,
  );
  expect(
    violacoes.map((violacao) => `${violacao.id}: ${JSON.stringify(violacao.nodes.map((no) => no.target))}`),
  ).toEqual([]);
}

export async function demonstrar(pagina: Page, nome: string): Promise<void> {
  if (process.env.CAPTURAR_DEMONSTRACOES === '1') {
    await pagina.screenshot({ path: `docs/demonstracoes/m04/${nome}.png`, fullPage: true });
  }
}
