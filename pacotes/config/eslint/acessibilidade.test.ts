import eslintReact from '@eslint-react/eslint-plugin';
import { ESLint } from 'eslint';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url));
const ARQUIVO = path.join(RAIZ, 'pacotes/ui/src/fixture-acessibilidade.tsx');

const eslint = new ESLint({
  cwd: RAIZ,
  overrideConfig: [tseslint.configs.disableTypeChecked, eslintReact.configs['disable-type-checked']],
});

async function regrasVioladas(codigo: string): Promise<string[]> {
  const [resultado] = await eslint.lintText(codigo, { filePath: ARQUIVO });
  return (resultado?.messages ?? []).map((mensagem) => mensagem.ruleId ?? 'fatal');
}

describe('lint de acessibilidade e de React', () => {
  it('recusa div com onClick', async () => {
    const regras = await regrasVioladas(
      'export function Item(props: { aoEscolher: () => void }) {\n  return <div onClick={props.aoEscolher}>Costela</div>;\n}\n',
    );
    expect(regras).toEqual(
      expect.arrayContaining([
        'jsx-a11y-x/click-events-have-key-events',
        'jsx-a11y-x/no-static-element-interactions',
      ]),
    );
  });

  it('recusa imagem sem texto alternativo', async () => {
    expect(
      await regrasVioladas('export function Capa() {\n  return <img src="/capa.webp" />;\n}\n'),
    ).toContain('jsx-a11y-x/alt-text');
  });

  it('recusa lista sem key', async () => {
    const regras = await regrasVioladas(
      'export function Lista(props: { nomes: string[] }) {\n  return <ul>{props.nomes.map((nome) => <li>{nome}</li>)}</ul>;\n}\n',
    );
    expect(regras.some((regra) => regra.startsWith('@eslint-react/'))).toBe(true);
  });

  it('recusa estilo inline', async () => {
    expect(
      await regrasVioladas(
        "export function Faixa() {\n  return <p style={{ color: 'red' }}>Fechado</p>;\n}\n",
      ),
    ).toContain('no-restricted-syntax');
  });

  it('recusa região rolável focável sem rótulo', async () => {
    expect(
      await regrasVioladas(
        'export function Rolagem() {\n  return (\n    <div role="region" tabIndex={0}>\n      <table />\n    </div>\n  );\n}\n',
      ),
    ).toContain('no-restricted-syntax');
  });

  it.each(['aria-label="Restaurantes"', 'aria-labelledby="legenda"'])(
    'aceita região rolável focável com %s',
    async (rotulo) => {
      expect(
        await regrasVioladas(
          `export function Rolagem() {\n  return (\n    <div role="region" ${rotulo} tabIndex={0}>\n      <table />\n    </div>\n  );\n}\n`,
        ),
      ).toEqual([]);
    },
  );

  it('recusa tabIndex em elemento não interativo sem role="region"', async () => {
    expect(
      await regrasVioladas(
        'export function Caixa() {\n  return <div aria-label="Caixa" tabIndex={0} />;\n}\n',
      ),
    ).toContain('jsx-a11y-x/no-noninteractive-tabindex');
  });

  it('aceita botao nativo', async () => {
    expect(
      await regrasVioladas(
        'export function Item(props: { aoEscolher: () => void }) {\n  return (\n    <button type="button" onClick={props.aoEscolher}>\n      Costela\n    </button>\n  );\n}\n',
      ),
    ).toEqual([]);
  });
});
