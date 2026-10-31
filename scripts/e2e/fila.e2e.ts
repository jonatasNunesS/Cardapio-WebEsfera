import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { demonstrar, semViolacoesDeAcessibilidade } from './acessibilidade.ts';
import { semearRestaurante } from './cliente-apoio.ts';
import { URL_DO_CARDAPIO, URL_DO_PAINEL } from './playwright.config.ts';

test.use({ serviceWorkers: 'block' });

const PRATOS = [{ nome: 'Moqueca da casa', precoCentavos: 7900 }];

async function abrirFila(contexto: BrowserContext, cookies: ReadonlyMap<string, string>) {
  await contexto.addCookies(
    [...cookies].map(([name, value]) => ({
      name,
      value,
      domain: new URL(URL_DO_PAINEL).hostname,
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax' as const,
    })),
  );
  const painel = await contexto.newPage();
  await painel.goto(`${URL_DO_PAINEL}/fila`);
  await expect(painel.getByRole('heading', { level: 1, name: 'Fila' })).toBeVisible();
  await expect(painel.getByText('Ao vivo', { exact: true })).toBeVisible();
  return painel;
}

async function pedirMoqueca(cliente: Page, caminho: string) {
  await cliente.goto(`${URL_DO_CARDAPIO}${caminho}`);
  await cliente.getByRole('button', { name: 'Ver cardápio' }).click();
  await cliente.getByRole('link', { name: 'Moqueca da casa' }).first().click();
  await cliente.getByRole('button', { name: 'Adicionar ao pedido' }).click();
  await cliente.getByRole('link', { name: 'Voltar ao cardápio' }).click();
  await cliente.getByRole('link', { name: /Ver pedido/ }).click();
  await cliente.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(cliente.getByRole('heading', { level: 1, name: 'Pedido 1' })).toBeVisible();
}

test('pedido e chamado chegam ao vivo na fila; o cliente vê cada mudança sem recarregar; encerrar leva ao obrigado', async ({
  page: cliente,
  context: contexto,
}) => {
  const restaurante = await semearRestaurante({ nome: 'Fila ao Vivo', pratos: PRATOS });
  const painel = await abrirFila(contexto, restaurante.painel.cookiesDaSessao);
  await semViolacoesDeAcessibilidade(painel);

  await pedirMoqueca(cliente, restaurante.caminho);
  const enviados = painel.getByRole('region', { name: 'Pedidos: Enviados' });
  await expect(enviados.getByText('Mesa 12 · Pedido 1')).toBeVisible();
  await expect(painel.getByRole('status').filter({ hasText: 'Novo pedido na fila.' })).toBeVisible();
  await semViolacoesDeAcessibilidade(painel);
  await demonstrar(painel, '01-fila-novo-pedido', 'intermediario');

  await painel.getByRole('button', { name: 'Começar preparo do pedido 1' }).click();
  await expect(cliente.getByText('Em preparo (agora)')).toBeVisible();
  await painel.getByRole('button', { name: 'Marcar pronto do pedido 1' }).click();
  await expect(cliente.getByText('Pronto, a caminho da mesa (agora)')).toBeVisible();

  await cliente.getByRole('link', { name: 'Voltar ao cardápio' }).click();
  await cliente.getByRole('link', { name: 'Chamar garçom ou pedir a conta' }).click();
  await cliente.getByRole('button', { name: 'Chamar garçom' }).click();
  await expect(cliente.getByText('Garçom avisado.')).toBeVisible();
  await painel.getByRole('button', { name: 'Assumir mesa 12' }).click();
  await expect(cliente.getByText('Alguém da equipe está vindo até a mesa.')).toBeVisible();
  await semViolacoesDeAcessibilidade(painel);
  await demonstrar(painel, '02-fila-chamado-assumido', 'intermediario');

  await painel.getByRole('button', { name: 'Encerrar mesa 12' }).click();
  await expect(painel.getByText(/tem 1 pedido\(s\) e 1 chamado\(s\) em aberto/)).toBeVisible();
  await semViolacoesDeAcessibilidade(painel);
  await painel.getByRole('button', { name: 'Encerrar mesmo assim' }).click();
  await expect(cliente.getByRole('heading', { level: 1, name: /Obrigado/ })).toBeVisible();
  await demonstrar(cliente, '03-cliente-obrigado', 'intermediario');
});

test('com o SSE bloqueado, o polling de 10 s mostra a mudança sem recarregar', async ({ page: cliente }) => {
  await cliente.route('**/api/v1/mesa/tempo-real', (rota) => rota.abort());
  const restaurante = await semearRestaurante({ nome: 'Fila sem SSE', pratos: PRATOS });
  await pedirMoqueca(cliente, restaurante.caminho);
  const { pedidos } = (await restaurante.painel.exigir('GET', '/api/v1/fila')) as {
    pedidos: { id: string }[];
  };

  await restaurante.painel.exigir('POST', `/api/v1/fila/pedidos/${pedidos[0]?.id ?? ''}/avanco`, {
    situacaoEsperada: 'enviado',
  });
  await expect(cliente.getByText('Em preparo (agora)')).toBeVisible({ timeout: 15_000 });
});
