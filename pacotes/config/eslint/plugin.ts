import type { ESLint, Rule } from 'eslint';
import { semCatchVazio } from './regras/sem-catch-vazio.ts';
import { semEmoji } from './regras/sem-emoji.ts';

// Tipos de regra do typescript-eslint e do ESLint 10 divergem: docs/adr/0001-monorepo-e-ferramentas.md#regras-do-plugin-cardapio
const comoRegraEslint = (regra: object): Rule.RuleModule => regra as Rule.RuleModule;

export const pluginCardapio: ESLint.Plugin = {
  meta: { name: 'cardapio' },
  rules: {
    'sem-emoji': comoRegraEslint(semEmoji),
    'sem-catch-vazio': comoRegraEslint(semCatchVazio),
  },
};
