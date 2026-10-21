import { describe } from 'vitest';
import { pluginCardapio } from '../plugin.ts';
import { criarTestador } from './testador.ts';

const FONTE_LISTA_OFICIAL = 'https://www.unicode.org/reports/tr51/#Emoji_Properties_and_Data_Files';
const CARINHA = String.fromCodePoint(0x1f600);
const FOGUETE = String.fromCodePoint(0x1f680);
const MARCA_DE_CHECK = String.fromCodePoint(0x2705);

const regra = pluginCardapio.rules?.['sem-emoji'];
if (regra === undefined) {
  throw new Error('Regra sem-emoji não registrada no plugin');
}

describe(`sem-emoji (propriedades Emoji_Presentation e Extended_Pictographic: ${FONTE_LISTA_OFICIAL})`, () => {
  criarTestador().run('sem-emoji', regra, {
    valid: [
      "const titulo = 'Cardápio de São João: pão, maçã e açaí';",
      'const modelo = `Mesa ${numero}: atenção à observação`;',
      '// Comentário com acentuação: ação, coração, ônibus',
      'const elemento = <p>Pedido enviado à cozinha</p>;',
      "const direitos = 'Copyright © WebEsfera';",
    ],
    invalid: [
      { code: `const titulo = 'Pedido pronto ${CARINHA}';`, errors: [{ messageId: 'emoji' }] },
      { code: `const modelo = \`Mesa \${numero} ${FOGUETE}\`;`, errors: [{ messageId: 'emoji' }] },
      { code: `const elemento = <p>Pronto ${MARCA_DE_CHECK}</p>;`, errors: [{ messageId: 'emoji' }] },
      { code: `// Atenção ${CARINHA}\nconst valor = 1;`, errors: [{ messageId: 'emoji' }] },
      { code: `/* bloco ${FOGUETE} */\nconst valor = 1;`, errors: [{ messageId: 'emoji' }] },
    ],
  });
});
