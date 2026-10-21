import { ESLint } from 'eslint';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

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

describe('fronteiras entre camadas', () => {
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
});
