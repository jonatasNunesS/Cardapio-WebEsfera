import { chromium, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { semearRestaurante } from './cliente-apoio.ts';
import { URL_DO_CARDAPIO } from './playwright.config.ts';

const executar = promisify(execFile);

test('desempenho do cardápio no 4G simulado: LCP e JavaScript dentro do orçamento @desempenho', async () => {
  test.setTimeout(300_000);
  const restaurante = await semearRestaurante({
    nome: 'Desempenho',
    corMarca: '#1F6E43',
    pratos: [
      {
        nome: 'Costela na brasa',
        precoCentavos: 8900,
        destaque: true,
        descricao: '12 horas no fogo de chão.',
      },
      { nome: 'Risoto de abóbora assada', precoCentavos: 6400, descricao: 'Com queijo canastra e sálvia.' },
      { nome: 'Pão de fermentação natural', precoCentavos: 2400 },
    ],
  });
  const { stdout, stderr } = await executar(
    'pnpm',
    ['exec', 'lhci', 'autorun', `--collect.url=${URL_DO_CARDAPIO}${restaurante.caminho}`],
    {
      env: { ...process.env, CHROME_PATH: process.env.CAMINHO_CHROMIUM ?? chromium.executablePath() },
      maxBuffer: 20 * 1024 * 1024,
    },
  ).catch((erro: unknown) => {
    const { stdout: saida = '', stderr: erros = '' } = erro as { stdout?: string; stderr?: string };
    throw new Error(`Lighthouse CI fora do orçamento:\n${saida}\n${erros}`);
  });
  process.stdout.write(`${stdout}\n${stderr}\n`);
});
