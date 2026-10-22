import { defineConfig } from '@playwright/test';

const PORTA = 6007;

export default defineConfig({
  testDir: '.',
  testMatch: '*.visual.ts',
  snapshotPathTemplate: '{testDir}/instantaneos/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  reporter:
    process.env.CI === undefined
      ? 'list'
      : [['list'], ['html', { open: 'never', outputFolder: 'relatorio' }]],
  outputDir: 'resultados',
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      maxDiffPixelRatio: 0.002,
      threshold: 0.2,
    },
  },
  use: {
    baseURL: `http://127.0.0.1:${String(PORTA)}`,
    browserName: 'chromium',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  webServer: {
    command: `pnpm exec vite preview --outDir storybook-static --host 127.0.0.1 --port ${String(PORTA)} --strictPort`,
    cwd: '..',
    url: `http://127.0.0.1:${String(PORTA)}/index.json`,
    reuseExistingServer: process.env.CI === undefined,
  },
});
