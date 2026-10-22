import eslintReact from '@eslint-react/eslint-plugin';
import js from '@eslint/js';
import type { ESLint } from 'eslint';
import moduloBoundaries from 'eslint-plugin-boundaries';
import { defineConfig, globalIgnores } from 'eslint/config';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';
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
  { type: 'banco', pattern: 'pacotes/infraestrutura/src/banco/**', partialMatch: false },
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
  permitir('infraestrutura', ['banco', 'aplicacao', 'dominio', 'config'], true),
  permitir('banco', ['aplicacao', 'dominio', 'config'], true),
  {
    from: { element: { type: 'contratos' } },
    allow: { to: { module: { origin: 'external', source: 'zod' } } },
  },
  permitir('observabilidade', ['dominio', 'aplicacao', 'config'], true),
  permitir(['ui', 'config'], [], true),
  permitir('app-servidor', ['aplicacao', 'contratos', 'observabilidade', 'config', 'composicao'], true),
  permitir(
    'composicao',
    ['app-servidor', 'aplicacao', 'contratos', 'observabilidade', 'config', 'infraestrutura'],
    true,
  ),
  permitir('app-web', ['contratos', 'ui', 'config'], true),
  {
    from: { element: { type: 'app-web' } },
    allow: {
      to: { element: { type: 'observabilidade' } },
      dependency: { source: '@cardapio/observabilidade/web' },
    },
  },
  permitir('ferramentas', ['config', 'infraestrutura'], true),
  {
    from: {
      element: {
        type: [
          'dominio',
          'aplicacao',
          'infraestrutura',
          'banco',
          'contratos',
          'ui',
          'app-servidor',
          'composicao',
          'app-web',
          'ferramentas',
        ],
      },
    },
    disallow: { to: { module: { source: ['@sentry/*', 'pino'] } } },
    message: 'Sentry e pino só entram pelo pacote observabilidade (docs/adr/0005-observabilidade.md).',
  },
  {
    from: { element: { type: '!banco' } },
    disallow: { to: { module: { source: ['pg', 'pg-*', 'drizzle-orm', 'drizzle-orm/*'] } } },
    message:
      'O driver do Postgres e o Drizzle só entram por pacotes/infraestrutura/src/banco (docs/adr/0006-banco-e-isolamento.md).',
  },
  {
    from: { element: { type: 'banco' }, file: { categories: 'teste' } },
    allow: { to: { element: { type: 'observabilidade' } } },
  },
  {
    from: { file: { categories: 'teste' } },
    allow: { to: { module: { origin: ['external', 'core'], source: ['vitest', 'node:*'] } } },
  },
];

export default defineConfig(
  globalIgnores(['**/node_modules/', '**/dist/', '**/coverage/', '**/storybook-static/', 'pnpm-lock.yaml']),
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
    files: ['**/*.tsx'],
    extends: [jsxA11y.configs.recommended, eslintReact.configs['recommended-type-checked']],
    rules: {
      // Região de rolagem rotulada precisa ser focável para quem usa teclado: docs/adr/0007-design-system.md#lint-de-acessibilidade
      'jsx-a11y-x/no-noninteractive-tabindex': [
        'error',
        { tags: [], roles: ['tabpanel', 'region'], allowExpressionValues: true },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='style']",
          message:
            'Estilo inline é proibido; use CSS Modules e tokens. O tema entra por aplicarTemaRestaurante (docs/adr/0007-design-system.md).',
        },
        {
          selector:
            "JSXOpeningElement:has(JSXAttribute[name.name='role'][value.value='region']):has(JSXAttribute[name.name='tabIndex']):not(:has(JSXAttribute[name.name=/^aria-label(ledby)?$/]))",
          message:
            'Região rolável focável precisa de aria-label ou aria-labelledby (docs/adr/0007-design-system.md#lint-de-acessibilidade).',
        },
      ],
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
