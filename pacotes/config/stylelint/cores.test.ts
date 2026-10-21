import path from 'node:path';
import { fileURLToPath } from 'node:url';
import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url));

async function regrasVioladas(arquivo: string, codigo: string): Promise<string[]> {
  const { results } = await stylelint.lint({
    code: codigo,
    codeFilename: path.join(RAIZ, arquivo),
    cwd: RAIZ,
  });
  return (results[0]?.warnings ?? []).map((aviso) => aviso.rule);
}

const COMPONENTE = 'pacotes/ui/src/botao/Botao.module.css';

describe('stylelint', () => {
  it('recusa cor hexadecimal fora de tokens.css', async () => {
    expect(await regrasVioladas(COMPONENTE, '.botao {\n  color: #fff;\n}\n')).toEqual(
      expect.arrayContaining(['color-no-hex', 'scale-unlimited/declaration-strict-value']),
    );
  });

  it.each([
    'background-color: rgb(0 0 0)',
    'border-color: red',
    'fill: hsl(0deg 0% 0%)',
    'outline-color: black',
  ])('recusa %s', async (declaracao) => {
    expect(await regrasVioladas(COMPONENTE, `.botao {\n  ${declaracao};\n}\n`)).toContain(
      'scale-unlimited/declaration-strict-value',
    );
  });

  it('aceita cor por var()', async () => {
    expect(await regrasVioladas(COMPONENTE, '.botao {\n  color: var(--cor-texto);\n}\n')).toEqual([]);
  });

  it('aceita hexadecimal em tokens.css', async () => {
    expect(
      await regrasVioladas('pacotes/ui/src/tokens.css', ':root {\n  --cor-texto: #1f1a17;\n}\n'),
    ).toEqual([]);
  });

  it.each([
    ['!important', '.botao {\n  color: var(--cor-texto) !important;\n}\n', 'declaration-no-important'],
    ['seletor de id', '#principal {\n  color: var(--cor-texto);\n}\n', 'selector-max-id'],
  ])('recusa %s', async (_nome, codigo, regra) => {
    expect(await regrasVioladas(COMPONENTE, codigo)).toContain(regra);
  });
});
