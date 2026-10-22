import { ESLint } from 'eslint';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url));

const FIXTURE_IMPORTA_INFRAESTRUTURA =
  "import * as infraestrutura from '@cardapio/infraestrutura';\nexport { infraestrutura };\n";

const eslint = new ESLint({ cwd: RAIZ, overrideConfig: [tseslint.configs.disableTypeChecked] });

async function violacoesDeFronteira(caminhoRelativo: string, codigo: string): Promise<string[]> {
  const [resultado] = await eslint.lintText(codigo, { filePath: path.join(RAIZ, caminhoRelativo) });
  return (resultado?.messages ?? [])
    .filter((mensagem) => mensagem.ruleId === 'boundaries/dependencies' || mensagem.fatal === true)
    .map((mensagem) => mensagem.message);
}

const LIMITE_PARA_CARREGAR_A_CONFIGURACAO_MS = 30_000;

describe('fronteiras entre camadas', () => {
  beforeAll(async () => {
    await eslint.calculateConfigForFile(path.join(RAIZ, 'pacotes/dominio/src/index.ts'));
  }, LIMITE_PARA_CARREGAR_A_CONFIGURACAO_MS);

  it('recusa dominio importando infraestrutura', async () => {
    const violacoes = await violacoesDeFronteira(
      'pacotes/dominio/src/fixture-fronteira.ts',
      FIXTURE_IMPORTA_INFRAESTRUTURA,
    );
    expect(violacoes).toHaveLength(1);
  });

  it('aceita a composicao da API importando infraestrutura', async () => {
    const violacoes = await violacoesDeFronteira(
      'apps/api/src/composicao/fixture-fronteira.ts',
      FIXTURE_IMPORTA_INFRAESTRUTURA,
    );
    expect(violacoes).toEqual([]);
  });

  it('recusa uma rota da API importando infraestrutura', async () => {
    const violacoes = await violacoesDeFronteira(
      'apps/api/src/rotas/fixture-fronteira.ts',
      FIXTURE_IMPORTA_INFRAESTRUTURA,
    );
    expect(violacoes).toHaveLength(1);
  });

  it('aceita app React importando a entrada web da observabilidade', async () => {
    const violacoes = await violacoesDeFronteira(
      'apps/cardapio/src/fixture-fronteira.tsx',
      "export { iniciarSentryWeb } from '@cardapio/observabilidade/web';\n",
    );
    expect(violacoes).toEqual([]);
  });

  it.each(['@cardapio/observabilidade/node', '@cardapio/observabilidade', '@cardapio/observabilidade/teste'])(
    'recusa app React importando %s',
    async (modulo) => {
      const violacoes = await violacoesDeFronteira(
        'apps/painel/src/fixture-fronteira.tsx',
        `export * from '${modulo}';\n`,
      );
      expect(violacoes).toHaveLength(1);
    },
  );

  it('aceita observabilidade importando aplicacao, como adaptador da porta RelatorDeErros', async () => {
    const violacoes = await violacoesDeFronteira(
      'pacotes/observabilidade/src/node/fixture-fronteira.ts',
      "export type { RelatorDeErros } from '@cardapio/aplicacao';\n",
    );
    expect(violacoes).toEqual([]);
  });

  it('recusa aplicacao importando observabilidade', async () => {
    const violacoes = await violacoesDeFronteira(
      'pacotes/aplicacao/src/fixture-fronteira.ts',
      "export * from '@cardapio/observabilidade/node';\n",
    );
    expect(violacoes).toHaveLength(1);
  });

  it.each([
    ['apps/api/src/rotas/fixture-fronteira.ts', '@sentry/node'],
    ['apps/worker/src/composicao/fixture-fronteira.ts', 'pino'],
    ['apps/admin/src/fixture-fronteira.tsx', '@sentry/react'],
  ])('recusa %s importando %s direto', async (arquivo, modulo) => {
    const violacoes = await violacoesDeFronteira(arquivo, `export * from '${modulo}';\n`);
    expect(violacoes).toHaveLength(1);
  });

  it.each([
    ['pacotes/infraestrutura/src/banco/fixture-fronteira.ts', 'pg'],
    ['pacotes/infraestrutura/src/banco/mesas/fixture-fronteira.ts', 'drizzle-orm/pg-core'],
  ])('aceita %s importando %s', async (arquivo, modulo) => {
    const violacoes = await violacoesDeFronteira(arquivo, `export * from '${modulo}';\n`);
    expect(violacoes).toEqual([]);
  });

  it.each([
    ['pacotes/infraestrutura/src/redis/fixture-fronteira.ts', 'pg'],
    ['pacotes/infraestrutura/src/fixture-fronteira.ts', 'drizzle-orm'],
    ['apps/api/src/composicao/fixture-fronteira.ts', 'pg'],
    ['apps/worker/src/composicao/fixture-fronteira.ts', 'drizzle-orm/node-postgres'],
    ['scripts/fixture-fronteira.ts', 'pg'],
  ])('recusa %s importando %s direto', async (arquivo, modulo) => {
    const violacoes = await violacoesDeFronteira(arquivo, `export * from '${modulo}';\n`);
    expect(violacoes).toHaveLength(1);
  });

  it('aceita teste do banco importando a observabilidade', async () => {
    const violacoes = await violacoesDeFronteira(
      'pacotes/infraestrutura/src/banco/testes/fixture-fronteira.test.ts',
      "export * from '@cardapio/observabilidade/teste';\n",
    );
    expect(violacoes).toEqual([]);
  });

  it('recusa codigo do banco importando a observabilidade', async () => {
    const violacoes = await violacoesDeFronteira(
      'pacotes/infraestrutura/src/banco/fixture-fronteira.ts',
      "export * from '@cardapio/observabilidade/node';\n",
    );
    expect(violacoes).toHaveLength(1);
  });
});
