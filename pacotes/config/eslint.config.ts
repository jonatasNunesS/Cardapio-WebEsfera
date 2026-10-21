import js from '@eslint/js';
import type { ESLint } from 'eslint';
import moduloBoundaries from 'eslint-plugin-boundaries';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import { pluginCardapio } from './eslint/plugin.ts';

// O .d.ts do plugin descreve o export ESM, mas em runtime o default é o próprio plugin: docs/adr/0001-monorepo-e-ferramentas.md#regras-do-plugin-cardapio
const boundaries = moduloBoundaries as unknown as ESLint.Plugin;

const ORIGENS_EXTERNAS = { module: { origin: ['external', 'core'] } };

const elementos = [
  { type: 'composicao', pattern: 'apps/{api,worker}/src/composicao/**', partialMatch: false },
  { type: 'app-servidor', pattern: 'apps/{api,worker}/**', partialMatch: false },
  { type: 'app-web', pattern: 'apps/{cardapio,painel,admin}/**', partialMatch: false },
  { type: 'dominio', pattern: 'pacotes/dominio/**', partialMatch: false },
  { type: 'aplicacao', pattern: 'pacotes/aplicacao/**', partialMatch: false },
  { type: 'infraestrutura', pattern: 'pacotes/infraestrutura/**', partialMatch: false },
  { type: 'contratos', pattern: 'pacotes/contratos/**', partialMatch: false },
  { type: 'ui', pattern: 'pacotes/ui/**', partialMatch: false },
  { type: 'observabilidade', pattern: 'pacotes/observabilidade/**', partialMatch: false },
  { type: 'config', pattern: 'pacotes/config/**', partialMatch: false },
  { type: 'ferramentas', pattern: 'scripts/**', partialMatch: false },
] as const;

function permitir(origem: string | readonly string[], destinos: readonly string[], externos: boolean) {
  const alvos: object[] = destinos.length > 0 ? [{ element: { type: [...destinos] } }] : [];
  return {
    from: { element: { type: typeof origem === 'string' ? origem : [...origem] } },
    allow: { to: externos ? [...alvos, ORIGENS_EXTERNAS] : alvos },
  };
}

const politicasDeFronteira = [
  permitir('aplicacao', ['dominio'], false),
  permitir('infraestrutura', ['aplicacao', 'dominio', 'config'], true),
  {
    from: { element: { type: 'contratos' } },
    allow: { to: { module: { origin: 'external', source: 'zod' } } },
  },
  permitir('observabilidade', ['dominio', 'config'], true),
  permitir(['ui', 'config'], [], true),
  permitir('app-servidor', ['aplicacao', 'contratos', 'observabilidade', 'config', 'composicao'], true),
  permitir(
    'composicao',
    ['app-servidor', 'aplicacao', 'contratos', 'observabilidade', 'config', 'infraestrutura'],
    true,
  ),
  permitir('app-web', ['contratos', 'ui', 'config'], true),
  permitir('ferramentas', ['config'], true),
  {
    from: { file: { categories: 'teste' } },
    allow: { to: { module: { origin: ['external', 'core'], source: ['vitest', 'node:*'] } } },
  },
];

export default defineConfig(
  globalIgnores(['**/node_modules/', '**/dist/', '**/coverage/', 'pnpm-lock.yaml']),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    plugins: { cardapio: pluginCardapio },
    rules: {
      'cardapio/sem-emoji': 'error',
      'cardapio/sem-catch-vazio': ['error', { funcoesDeReporte: ['reportarErro'] }],
      'no-console': 'error',
    },
  },
  {
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    plugins: { boundaries },
    settings: {
      'boundaries/elements': elementos,
      'boundaries/files': [{ category: 'teste', pattern: '**/*.test.{ts,tsx}' }],
      'boundaries/legacy-templates': false,
      'import/resolver': {
        typescript: {
          project: ['tsconfig.json', 'apps/*/tsconfig.json', 'pacotes/*/tsconfig.json'],
          noWarnOnMultipleProjects: true,
        },
      },
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          checkAllOrigins: true,
          message:
            'Importação proibida pelas fronteiras entre camadas (docs/adr/0002-fronteiras-entre-camadas.md).',
          policies: politicasDeFronteira,
        },
      ],
    },
  },
);
