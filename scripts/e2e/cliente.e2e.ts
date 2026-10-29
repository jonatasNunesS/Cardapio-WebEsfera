import { expect, test, type Page } from '@playwright/test';
import { demonstrar, semViolacoesDeAcessibilidade } from './acessibilidade.ts';
import { semearRestaurante } from './cliente-apoio.ts';
import { URL_DO_CARDAPIO } from './playwright.config.ts';

const PRATOS = [
  { nome: 'Costela na brasa', precoCentavos: 8900, destaque: true, descricao: '12 horas no fogo de chão.' },
  { nome: 'Risoto de abóbora assada', precoCentavos: 6400, descricao: 'Com queijo canastra e sálvia.' },
  { nome: 'Burrata com tomates', precoCentavos: 5800, disponivel: false },
  { nome: 'Abóbora que saiu do cardápio', precoCentavos: 1000, removido: true },
];

async function abrirMesa(pagina: Page, caminho: string) {
  await pagina.goto(`${URL_DO_CARDAPIO}${caminho}`);
}

async function passarDaAbertura(pagina: Page) {
  await expect(pagina.getByRole('heading', { level: 1, name: 'Você está na Mesa 12' })).toBeVisible();
  await pagina.getByRole('button', { name: 'Ver cardápio' }).click();
  await expect(pagina.getByRole('link', { name: 'Buscar prato ou ingrediente' })).toBeVisible();
}

test('cliente abre a mesa: abertura uma vez por sessão, cardápio, prato e tema do restaurante', async ({
  page: pagina,
}) => {
  const restaurante = await semearRestaurante({ nome: 'Brasa', pratos: PRATOS, corMarca: '#1F6E43' });
  await abrirMesa(pagina, restaurante.caminho);

  await expect(pagina.getByRole('heading', { level: 1, name: 'Você está na Mesa 12' })).toBeVisible();
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '01-abertura', 'm09');
  await pagina.getByRole('button', { name: 'Ver cardápio' }).click();

  await expect(pagina.getByRole('heading', { level: 2, name: 'Costela na brasa' })).toBeVisible();
  await expect(pagina.getByText('Esgotado hoje')).toBeVisible();
  await expect(pagina.getByText('Abóbora que saiu do cardápio')).toHaveCount(0);
  expect(
    await pagina.evaluate<string>(
      "getComputedStyle(document.documentElement).getPropertyValue('--cor-marca').trim()",
    ),
  ).toBe('#1F6E43');
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '02-cardapio', 'm09');

  await pagina.getByRole('link', { name: 'Risoto de abóbora assada' }).click();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Risoto de abóbora assada' })).toBeVisible();
  await expect(pagina.getByText('Com queijo canastra e sálvia.')).toBeVisible();
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '03-prato', 'm09');

  await pagina.reload();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Risoto de abóbora assada' })).toBeVisible();
  await pagina.getByRole('link', { name: 'Voltar ao cardápio' }).click();
  await expect(pagina.getByRole('link', { name: 'Buscar prato ou ingrediente' })).toBeVisible();
  await expect(pagina.getByRole('heading', { name: 'Você está na Mesa 12' })).toHaveCount(0);
});

test('busca sem acento acha com acento; vazio tem saída; esgotado marcado; removido não aparece', async ({
  page: pagina,
}) => {
  const restaurante = await semearRestaurante({ nome: 'Busca', pratos: PRATOS });
  await abrirMesa(pagina, restaurante.caminho);
  await passarDaAbertura(pagina);
  await pagina.getByRole('link', { name: 'Buscar prato ou ingrediente' }).click();

  const campo = pagina.getByLabel('Buscar prato ou ingrediente');
  await campo.fill('abobora');
  const resultados = pagina.getByRole('list', { name: 'Resultados da busca' });
  await expect(resultados.getByRole('heading', { name: 'Risoto de abóbora assada' })).toBeVisible();
  await expect(resultados.getByText('Abóbora que saiu do cardápio')).toHaveCount(0);
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '04-busca', 'm09');

  await campo.fill('burrata');
  await expect(resultados.getByText('Esgotado hoje')).toBeVisible();

  await campo.fill('lagosta');
  await expect(pagina.getByText('Nada encontrado para “lagosta”')).toBeVisible();
  await semViolacoesDeAcessibilidade(pagina);
  await pagina.getByRole('link', { name: 'Ver todas as categorias' }).click();
  await expect(pagina.getByRole('heading', { level: 2, name: 'Principais' })).toBeVisible();
});

test('restaurante fechado: cardápio visível, aviso com o horário, nada de pedir', async ({
  page: pagina,
}) => {
  const restaurante = await semearRestaurante({ nome: 'Fechado', pratos: PRATOS, fechado: true });
  await abrirMesa(pagina, restaurante.caminho);
  await passarDaAbertura(pagina);

  await expect(pagina.getByText(/fechados agora/u)).toBeVisible();
  await expect(pagina.getByText(/Abre .* às 18:00\./u)).toBeVisible();
  await expect(pagina.getByRole('heading', { level: 2, name: 'Costela na brasa' })).toBeVisible();
  await expect(pagina.getByRole('button', { name: /pedir|adicionar/iu })).toHaveCount(0);
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '05-fechado', 'm09');
});

test('QR inválido: código inexistente, mesa desativada e restaurante sem a marca; nada vaza', async ({
  page: pagina,
}) => {
  const restaurante = await semearRestaurante({ nome: 'Invalido', pratos: PRATOS, corMarca: '#1F6E43' });
  await abrirMesa(pagina, `/${restaurante.slug}/mesa/12?c=${'A'.repeat(22)}`);

  await expect(pagina.getByRole('heading', { level: 1, name: 'Este QR Code não está ativo' })).toBeVisible();
  await expect(pagina.getByText(restaurante.slug)).toHaveCount(0);
  await expect(pagina.getByText('Costela na brasa')).toHaveCount(0);
  expect(
    await pagina.evaluate<string>("document.documentElement.style.getPropertyValue('--cor-marca')"),
  ).toBe('');
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '06-qr-invalido', 'm09');

  const { mesas } = (await restaurante.painel.exigir('GET', '/api/v1/mesas')) as { mesas: { id: string }[] };
  await restaurante.painel.exigir('PUT', `/api/v1/mesas/${mesas[0]?.id ?? ''}/situacao`, { ativa: false });
  await abrirMesa(pagina, restaurante.caminho);
  await expect(pagina.getByRole('heading', { level: 1, name: 'Este QR Code não está ativo' })).toBeVisible();

  await pagina.goto(`${URL_DO_CARDAPIO}/qualquer-coisa`);
  await expect(pagina.getByRole('heading', { level: 1, name: 'Este QR Code não está ativo' })).toBeVisible();
});

test('link com slug e número antigos redireciona para o atual e abre normal', async ({ page: pagina }) => {
  const restaurante = await semearRestaurante({ nome: 'Antigo', pratos: PRATOS });
  await abrirMesa(pagina, `/slug-que-nao-existe/mesa/99?c=${restaurante.codigo}`);

  await expect(pagina).toHaveURL(`${URL_DO_CARDAPIO}${restaurante.caminho}`);
  await passarDaAbertura(pagina);
});

test('sessão expirada: tela própria, sem a marca, com o caminho de escanear de novo', async ({
  page: pagina,
}) => {
  const restaurante = await semearRestaurante({ nome: 'Expira', pratos: PRATOS });
  await pagina.clock.install();
  await abrirMesa(pagina, restaurante.caminho);
  await passarDaAbertura(pagina);

  await pagina.clock.runFor('04:00:01');
  await expect(pagina.getByRole('heading', { level: 1, name: 'Sua sessão na mesa terminou' })).toBeVisible();
  await expect(pagina.getByText('Escaneie o QR Code da mesa de novo')).toBeVisible();
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '07-sessao-expirada', 'm09');
});

test('offline: com o cardápio carregado, recarregar sem rede mostra o cardápio guardado e o aviso', async ({
  page: pagina,
  context: contexto,
}) => {
  const restaurante = await semearRestaurante({ nome: 'Offline', pratos: PRATOS });
  await abrirMesa(pagina, restaurante.caminho);
  await passarDaAbertura(pagina);
  await pagina.evaluate<unknown>('navigator.serviceWorker.ready.then(() => true)');
  await expect.poll(() => pagina.evaluate<boolean>('navigator.serviceWorker.controller !== null')).toBe(true);
  await expect
    .poll(() => pagina.evaluate<number>('caches.keys().then((nomes) => nomes.length)'))
    .toBeGreaterThan(1);

  await contexto.setOffline(true);
  await pagina.reload();
  await expect(
    pagina.getByText('Você está sem conexão. Mostrando o cardápio guardado neste aparelho.'),
  ).toBeVisible();
  await expect(pagina.getByRole('heading', { level: 2, name: 'Costela na brasa' })).toBeVisible();
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '08-offline', 'm09');
  await contexto.setOffline(false);
});

test('isolamento: o cache de um restaurante nunca serve outro; trocar de mesa não mistura', async ({
  page: pagina,
  context: contexto,
}) => {
  const a = await semearRestaurante({
    nome: 'Casa A',
    pratos: [{ nome: 'Prato só da A', precoCentavos: 1000 }],
  });
  const b = await semearRestaurante({
    nome: 'Casa B',
    pratos: [{ nome: 'Prato só da B', precoCentavos: 1000 }],
  });
  await abrirMesa(pagina, a.caminho);
  await passarDaAbertura(pagina);
  await expect.poll(() => pagina.evaluate<boolean>('navigator.serviceWorker.controller !== null')).toBe(true);
  await expect
    .poll(() =>
      pagina.evaluate<string[]>('caches.keys()').then((nomes) => nomes.some((nome) => nome.endsWith(a.slug))),
    )
    .toBe(true);

  await contexto.setOffline(true);
  await abrirMesa(pagina, b.caminho);
  await expect(pagina.getByRole('heading', { level: 1, name: 'Sem conexão' })).toBeVisible();
  await expect(pagina.getByText('Prato só da A')).toHaveCount(0);
  await contexto.setOffline(false);

  await abrirMesa(pagina, b.caminho);
  await passarDaAbertura(pagina);
  await expect(pagina.getByText('Prato só da B')).toBeVisible();
  await expect(pagina.getByText('Prato só da A')).toHaveCount(0);
  const chaves = await pagina.evaluate<[string, string[]][]>(`
    caches.keys().then((nomes) =>
      Promise.all(
        nomes.map((nome) =>
          caches
            .open(nome)
            .then((cache) => cache.keys())
            .then((pedidos) => [nome, pedidos.map((pedido) => new URL(pedido.url).pathname)]),
        ),
      ),
    )
  `);
  for (const [nome, caminhos] of chaves) {
    for (const caminho of caminhos.filter((item) => item.startsWith('/api/'))) {
      expect(caminho).toBe(`/api/v1/cardapios/${nome.replace('cardapio-dados-', '')}`);
    }
  }
  expect(chaves.flatMap(([, caminhos]) => caminhos).some((caminho) => caminho.includes('/mesa/'))).toBe(
    false,
  );
});
