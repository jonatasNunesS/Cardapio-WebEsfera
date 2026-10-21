import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface EntradaDoIndice {
  readonly id: string;
  readonly type: 'story' | 'docs';
}

const INDICE = JSON.parse(
  readFileSync(new URL('../storybook-static/index.json', import.meta.url), 'utf8'),
) as {
  entries: Record<string, EntradaDoIndice>;
};

const HISTORIAS = Object.values(INDICE.entries)
  .filter((entrada) => entrada.type === 'story')
  .map((entrada) => entrada.id);

const TEMAS = ['cardapio', 'painel', 'tv'] as const;
const LARGURAS = [360, 1280] as const;
const ALTURA = 800;

async function esperarHistoria(pagina: Page): Promise<void> {
  await pagina.waitForFunction(() => {
    const previa = (window as Window & { __STORYBOOK_PREVIEW__?: { currentRender?: { phase?: string } } })
      .__STORYBOOK_PREVIEW__;
    const fase = previa?.currentRender?.phase;
    return fase === 'completed' || fase === 'finished';
  });
  await pagina.evaluate(() => document.fonts.ready);
}

for (const tema of TEMAS) {
  for (const largura of LARGURAS) {
    test.describe(`${tema} a ${String(largura)} px`, () => {
      test.use({ viewport: { width: largura, height: ALTURA } });

      for (const id of HISTORIAS) {
        test(id, async ({ page }) => {
          await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=tema:${tema}`);
          await esperarHistoria(page);
          await expect(page).toHaveScreenshot(`${id}--${tema}--${String(largura)}.png`);
        });
      }
    });
  }
}
