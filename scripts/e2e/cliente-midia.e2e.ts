import { expect, test, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { semViolacoesDeAcessibilidade } from './acessibilidade.ts';
import { semearRestaurante } from './cliente-apoio.ts';
import { URL_DO_CARDAPIO } from './playwright.config.ts';

const executar = promisify(execFile);
const FFMPEG = process.env.CAMINHO_FFMPEG ?? 'ffmpeg';
const PREFIXO_DA_MIDIA = `${URL_DO_CARDAPIO}/midia-de-teste`;

interface Arquivos {
  readonly pasta: string;
  readonly webm: Buffer;
  readonly capa: Buffer;
}

let arquivos: Arquivos;

test.use({ serviceWorkers: 'block' });

test.beforeAll(async () => {
  const pasta = await mkdtemp(path.join(tmpdir(), 'cliente-midia-'));
  const webm = path.join(pasta, 'prato.webm');
  const capa = path.join(pasta, 'capa.png');
  const fonte = ['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15'];
  await executar(FFMPEG, ['-v', 'error', '-y', ...fonte, '-t', '2', '-c:v', 'libvpx', '-an', webm]);
  await executar(FFMPEG, ['-v', 'error', '-y', ...fonte, '-frames:v', '1', capa]);
  arquivos = { pasta, webm: await readFile(webm), capa: await readFile(capa) };
});

test.afterAll(async () => {
  await rm(arquivos.pasta, { recursive: true, force: true });
});

const DESTAQUES = ['Costela na brasa', 'Picanha na brasa', 'Cordeiro na brasa'];

interface CardapioComMidia {
  personalizacao: { corMarca: string } | null;
  secoes: { pratos: { nome: string; midia: unknown }[] }[];
}

async function servirMidia(pagina: Page, ajustar: (cardapio: CardapioComMidia) => void = () => undefined) {
  await pagina.route(`${PREFIXO_DA_MIDIA}/**`, (rota) =>
    rota.fulfill({
      status: 200,
      contentType: rota.request().url().endsWith('.webm') ? 'video/webm' : 'image/png',
      body: rota.request().url().endsWith('.webm') ? arquivos.webm : arquivos.capa,
    }),
  );
  await pagina.route(/\/api\/v1\/cardapios\/[a-z0-9-]+$/u, async (rota) => {
    const pedido = rota.request();
    const resposta = await rota.fetch({
      url: pedido.url().replace('cardapio.localhost', '127.0.0.1'),
      headers: { ...(await pedido.allHeaders()), host: new URL(pedido.url()).host },
    });
    const cardapio = (await resposta.json()) as CardapioComMidia;
    for (const prato of cardapio.secoes.flatMap((secao) => secao.pratos)) {
      const nome = prato.nome.split(' ')[0]?.toLowerCase() ?? 'prato';
      prato.midia = {
        tipo: 'video',
        imagem: {
          largura: 320,
          altura: 240,
          src: `${PREFIXO_DA_MIDIA}/${nome}.png`,
          avif: `${PREFIXO_DA_MIDIA}/${nome}.png`,
          webp: `${PREFIXO_DA_MIDIA}/${nome}.png`,
        },
        video: {
          capa: `${PREFIXO_DA_MIDIA}/${nome}.png`,
          mp4: `${PREFIXO_DA_MIDIA}/${nome}.mp4`,
          webm: `${PREFIXO_DA_MIDIA}/${nome}.webm`,
          duracaoMs: 2000,
        },
      };
    }
    ajustar(cardapio);
    await rota.fulfill({ response: resposta, json: cardapio });
  });
}

async function abrirCardapio(pagina: Page, caminho: string) {
  await pagina.goto(`${URL_DO_CARDAPIO}${caminho}`);
  await pagina.getByRole('button', { name: 'Ver cardápio' }).click();
  await expect(pagina.getByRole('heading', { name: 'Costela na brasa' }).first()).toBeVisible();
}

const videosTocando = (pagina: Page) =>
  pagina
    .locator('video')
    .evaluateAll((videos) => videos.filter((video) => !(video as { paused: boolean }).paused).length);

test('vídeo: só os visíveis tocam, no máximo dois; fora da tela fica parado', async ({ page: pagina }) => {
  const restaurante = await semearRestaurante({
    nome: 'Video',
    pratos: DESTAQUES.map((nome) => ({ nome, precoCentavos: 9000, destaque: true })),
  });
  await pagina.setViewportSize({ width: 390, height: 700 });
  await servirMidia(pagina);
  await abrirCardapio(pagina, restaurante.caminho);

  await expect.poll(() => videosTocando(pagina)).toBeGreaterThan(0);
  expect(await videosTocando(pagina)).toBeLessThanOrEqual(2);
  const ultimo = pagina.getByLabel('Cordeiro na brasa em vídeo');
  expect(await ultimo.evaluate((video) => (video as { paused: boolean }).paused)).toBe(true);
  await semViolacoesDeAcessibilidade(pagina);
});

test('vídeo com movimento reduzido: só a capa, nada toca sozinho', async ({ browser: navegador }) => {
  const restaurante = await semearRestaurante({
    nome: 'Reduzido',
    pratos: DESTAQUES.map((nome) => ({ nome, precoCentavos: 9000, destaque: true })),
  });
  const contexto = await navegador.newContext({ reducedMotion: 'reduce', serviceWorkers: 'block' });
  const pagina = await contexto.newPage();
  await servirMidia(pagina);
  await abrirCardapio(pagina, restaurante.caminho);

  await pagina.waitForTimeout(1000);
  expect(await videosTocando(pagina)).toBe(0);
  await expect(pagina.getByLabel('Costela na brasa em vídeo')).toHaveAttribute('poster', /costela\.png$/u);
  await contexto.close();
});

test('tema: cor inválida vinda do cardápio cai no tema padrão', async ({ browser: navegador }) => {
  const restaurante = await semearRestaurante({
    nome: 'Tema',
    corMarca: '#1F6E43',
    pratos: [{ nome: 'Costela na brasa', precoCentavos: 9000 }],
  });
  const contexto = await navegador.newContext({ serviceWorkers: 'block' });
  const pagina = await contexto.newPage();
  const corDaMarca = () =>
    pagina.evaluate<string>(
      "getComputedStyle(document.documentElement).getPropertyValue('--cor-marca').trim()",
    );
  await pagina.goto(`${URL_DO_CARDAPIO}/qualquer`);
  const padrao = await corDaMarca();
  await servirMidia(pagina, (cardapio) => {
    if (cardapio.personalizacao !== null) {
      cardapio.personalizacao.corMarca = 'vermelho';
    }
  });
  await abrirCardapio(pagina, restaurante.caminho);

  expect(await corDaMarca()).toBe(padrao);
  expect(
    await pagina.evaluate<string>("document.documentElement.style.getPropertyValue('--cor-marca')"),
  ).toBe('');
  await contexto.close();
});
