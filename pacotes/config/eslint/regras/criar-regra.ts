import { ESLintUtils } from '@typescript-eslint/utils';

export const criarRegra = ESLintUtils.RuleCreator(
  (nome) =>
    `https://github.com/jonatasNunesS/Cardapio-WebEsfera/blob/main/docs/adr/0001-monorepo-e-ferramentas.md#regra-${nome}`,
);
