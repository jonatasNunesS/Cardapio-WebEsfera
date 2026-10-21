import { defineConfig } from 'vitest/config';

const ignorados = ['**/node_modules/**', '**/dist/**'];

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
        },
      },
    ],
  },
});
