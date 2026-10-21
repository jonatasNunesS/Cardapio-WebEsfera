import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const ignorados = ['**/node_modules/**', '**/dist/**'];

const caminhoDoChromium = process.env.CAMINHO_CHROMIUM;

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
          include: ['pacotes/**/*.banco.test.ts'],
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
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: 'pacotes/ui/.storybook',
            storybookScript: 'pnpm storybook --ci',
          }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(
              caminhoDoChromium === undefined ? {} : { launchOptions: { executablePath: caminhoDoChromium } },
            ),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
