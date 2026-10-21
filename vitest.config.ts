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
          exclude: ignorados,
          environment: 'node',
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
