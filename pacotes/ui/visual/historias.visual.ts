import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { superficiesDaHistoria, type Superficie } from '../src/storybook/superficies.ts';

interface EntradaDoIndice {
  readonly id: string;
  readonly type: 'story' | 'docs';
  readonly tags?: readonly string[];
}

const INDICE = JSON.parse(
  readFileSync(new URL('../storybook-static/index.json', import.meta.url), 'utf8'),
) as {
  entries: Record<string, EntradaDoIndice>;
};

export const TELA_DA_SUPERFICIE: Readonly<Record<Superficie, { width: number; height: number }>> = {
  cardapio: { width: 360, height: 800 },
  painel: { width: 1280, height: 800 },
  tv: { width: 1920, height: 1080 },
};

const HISTORIAS = Object.values(INDICE.entries).filter((entrada) => entrada.type === 'story');

async function esperarHistoria(pagina: Page): Promise<void> {
  await pagina.waitForFunction(() => {
    const previa = (window as Window & { __STORYBOOK_PREVIEW__?: { currentRender?: { phase?: string } } })
      .__STORYBOOK_PREVIEW__;
    const fase = previa?.currentRender?.phase;
    return fase === 'completed' || fase === 'finished';
  });
  await pagina.evaluate(() => document.fonts.ready);
}

test('toda história diz onde aparece', () => {
  const semSuperficie = HISTORIAS.filter(
    (historia) => superficiesDaHistoria(historia.tags ?? []).length === 0,
  );
  expect(semSuperficie.map((historia) => historia.id)).toEqual([]);
});

for (const superficie of Object.keys(TELA_DA_SUPERFICIE) as Superficie[]) {
  const tela = TELA_DA_SUPERFICIE[superficie];
  test.describe(`${superficie} a ${String(tela.width)} px`, () => {
    test.use({ viewport: tela });

    for (const { id } of HISTORIAS.filter((historia) => (historia.tags ?? []).includes(superficie))) {
      test(id, async ({ page }) => {
        await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=tema:${superficie}`);
        await esperarHistoria(page);
        await expect(page).toHaveScreenshot(`${id}--${superficie}--${String(tela.width)}.png`);
      });
    }
  });
}
