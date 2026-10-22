import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const ignorados = ['**/node_modules/**', '**/dist/**'];

const caminhoDoChromium = process.env.CAMINHO_CHROMIUM;

const TEMAS_DA_PREVIA = ['cardapio', 'painel', 'tv'] as const;

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: ['{apps,pacotes,scripts}/**/*.test.ts'],
          exclude: [...ignorados, '**/*.banco.test.ts'],
          environment: 'node',
          css: { include: [/tokens\.css/] },
        },
      },
      {
        extends: true,
        test: {
          name: 'banco',
          include: ['{apps,pacotes}/**/*.banco.test.ts'],
          exclude: ignorados,
          environment: 'node',
          globalSetup: ['pacotes/infraestrutura/src/banco/testes/preparar-banco-de-teste.ts'],
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'navegador',
          include: ['{apps,pacotes}/**/*.test.tsx'],
          exclude: ignorados,
          environment: 'jsdom',
          setupFiles: ['pacotes/config/vitest/limpar-dom.ts'],
        },
      },
      ...TEMAS_DA_PREVIA.map((tema) => ({
        extends: true,
        plugins: [
          storybookTest({
            configDir: 'pacotes/ui/.storybook',
            storybookScript: 'pnpm storybook --ci',
          }),
        ],
        test: {
          name: `storybook-${tema}`,
          env: { TEMA_DA_PREVIA: tema },
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(
              caminhoDoChromium === undefined ? {} : { launchOptions: { executablePath: caminhoDoChromium } },
            ),
            instances: [{ browser: 'chromium' as const }],
          },
        },
      })),
    ],
  },
});
