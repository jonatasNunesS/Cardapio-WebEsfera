import type { Config } from 'stylelint';

const PROPRIEDADES_DE_COR = [
  'color',
  'background',
  'background-color',
  'border-color',
  'outline-color',
  'fill',
  'stroke',
];

const configuracao: Config = {
  extends: ['stylelint-config-standard'],
  plugins: ['stylelint-declaration-strict-value'],
  rules: {
    'scale-unlimited/declaration-strict-value': [
      PROPRIEDADES_DE_COR,
      {
        ignoreFunctions: false,
        ignoreValues: ['currentcolor', 'transparent', 'inherit', 'none'],
        message: 'Cor só por var() com token de pacotes/ui/src/tokens.css (docs/adr/0007-design-system.md).',
      },
    ],
    'color-no-hex': true,
    'color-named': 'never',
    'declaration-no-important': true,
    'selector-max-id': 0,
    'selector-class-pattern': [
      '^[a-z][a-zA-Z0-9]*$',
      { message: 'Classe em camelCase, para o CSS Module virar propriedade (estilos.botaoPrincipal).' },
    ],
  },
  overrides: [
    {
      files: ['pacotes/ui/src/tokens.css'],
      rules: { 'color-no-hex': null, 'scale-unlimited/declaration-strict-value': null },
    },
  ],
  ignoreFiles: ['**/node_modules/**', '**/dist/**', '**/storybook-static/**', 'docs/**'],
};

export default configuracao;
