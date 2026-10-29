import { defineConfig } from '@playwright/test';

export const PORTAS = { api: 3100, painel: 5173, admin: 5174, cardapio: 5175 } as const;
export const URL_DO_PAINEL = `http://painel.localhost:${String(PORTAS.painel)}`;
export const URL_DO_ADMIN = `http://admin.localhost:${String(PORTAS.admin)}`;
export const URL_DO_CARDAPIO = `http://cardapio.localhost:${String(PORTAS.cardapio)}`;
export const URL_DO_REDIS_E2E = process.env.URL_REDIS_E2E ?? 'redis://127.0.0.1:6379/15';

const caminhoDoChromium = process.env.CAMINHO_CHROMIUM;
const urlDoBanco = (usuario: string, senha: string) =>
  `postgres://${usuario}:${senha}@127.0.0.1:5432/${process.env.BANCO_E2E ?? 'cardapio'}`;

const ARMAZENAMENTO = {
  URL_ARMAZENAMENTO: 'http://127.0.0.1:3900',
  REGIAO_ARMAZENAMENTO: 'garage',
  CHAVE_ARMAZENAMENTO: process.env.CHAVE_ARMAZENAMENTO ?? 'GKabababababababababababab',
  SEGREDO_ARMAZENAMENTO: process.env.SEGREDO_ARMAZENAMENTO ?? 'cd'.repeat(32),
  BUCKET_ORIGINAIS: 'midia-originais',
  BUCKET_PUBLICO: 'midia-publica',
  URL_PUBLICA_MIDIA: 'http://midia-publica.web.localhost:3902',
};

const AMBIENTE_DO_WORKER = {
  NODE_ENV: 'development',
  APP_ENV: 'local',
  URL_BANCO_WORKER: urlDoBanco('cardapio_worker', process.env.SENHA_BANCO_WORKER ?? 'worker_local'),
  URL_REDIS: URL_DO_REDIS_E2E,
  SENTRY_DSN_BACKEND: '',
  ...ARMAZENAMENTO,
};

const AMBIENTE_DA_API = {
  ...ARMAZENAMENTO,
  NODE_ENV: 'development',
  APP_ENV: 'local',
  PORTA_API: String(PORTAS.api),
  URL_BANCO_API: urlDoBanco('cardapio_api', process.env.SENHA_BANCO_API ?? 'api_local'),
  URL_REDIS: URL_DO_REDIS_E2E,
  DOMINIO_CARDAPIO: 'cardapio.localhost',
  DOMINIO_PAINEL: 'painel.localhost',
  DOMINIO_ADMIN: 'admin.localhost',
  URL_PAINEL: URL_DO_PAINEL,
  CHAVE_CIFRA_TOTP: 'ZTJlLWNoYXZlLWRlLXRlc3RlLTMyLWJ5dGVzLW9rISE=',
  CHAVE_SESSAO_MESA: 'mesa-e2e-mesa-e2e-mesa-e2e-mesa-e2e',
  SENTRY_DSN_BACKEND: '',
};

const AMBIENTE_DO_VITE = { URL_API_LOCAL: `http://127.0.0.1:${String(PORTAS.api)}` };

export default defineConfig({
  testDir: '.',
  testMatch: '*.e2e.ts',
  ...(process.env.DESEMPENHO === '1' ? { grep: /@desempenho/u } : { grepInvert: /@desempenho/u }),
  globalSetup: './preparar.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  timeout: 60_000,
  reporter:
    process.env.CI === undefined
      ? 'list'
      : [['list'], ['html', { open: 'never', outputFolder: 'relatorio' }]],
  outputDir: 'resultados',
  use: {
    browserName: 'chromium',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    ...(caminhoDoChromium === undefined ? {} : { launchOptions: { executablePath: caminhoDoChromium } }),
  },
  webServer: [
    {
      command: 'pnpm --filter @cardapio/api iniciar',
      cwd: '../..',
      env: AMBIENTE_DA_API,
      url: `http://127.0.0.1:${String(PORTAS.api)}/saude/pronto`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @cardapio/worker iniciar',
      cwd: '../..',
      env: AMBIENTE_DO_WORKER,
      wait: { stdout: /worker pronto/ },
      stdout: 'pipe',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @cardapio/painel dev',
      cwd: '../..',
      env: AMBIENTE_DO_VITE,
      url: `http://127.0.0.1:${String(PORTAS.painel)}`,
      reuseExistingServer: false,
    },
    {
      command: 'pnpm --filter @cardapio/admin dev',
      cwd: '../..',
      env: AMBIENTE_DO_VITE,
      url: `http://127.0.0.1:${String(PORTAS.admin)}`,
      reuseExistingServer: false,
    },
    {
      command: 'pnpm --filter @cardapio/cardapio build && pnpm --filter @cardapio/cardapio exec vite preview',
      cwd: '../..',
      env: AMBIENTE_DO_VITE,
      url: `http://127.0.0.1:${String(PORTAS.cardapio)}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
