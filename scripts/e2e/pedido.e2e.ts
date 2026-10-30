import { expect, test, type Page } from '@playwright/test';
import { demonstrar, semViolacoesDeAcessibilidade } from './acessibilidade.ts';
import { esgotarPrato, semearRestaurante } from './cliente-apoio.ts';
import { URL_DO_CARDAPIO } from './playwright.config.ts';

test.use({ serviceWorkers: 'block' });

const PRATOS = [
  { nome: 'Costela na brasa', precoCentavos: 8900 },
  { nome: 'Pão de fermentação natural', precoCentavos: 2400 },
];

async function abrirCardapio(pagina: Page, caminho: string) {
  await pagina.goto(`${URL_DO_CARDAPIO}${caminho}`);
  await pagina.getByRole('button', { name: 'Ver cardápio' }).click();
  await expect(pagina.getByRole('link', { name: 'Buscar prato ou ingrediente' })).toBeVisible();
}

async function adicionar(pagina: Page, nome: string) {
  await pagina.getByRole('link', { name: nome }).first().click();
  await pagina.getByRole('button', { name: 'Adicionar ao pedido' }).click();
  await expect(pagina.getByText(`${nome} no pedido`)).toBeVisible();
  await pagina.getByRole('link', { name: 'Voltar ao cardápio' }).click();
}

test('cliente monta o pedido com observação, envia, acompanha e cancela', async ({ page: pagina }) => {
  const restaurante = await semearRestaurante({ nome: 'Brasa Pedido', pratos: PRATOS });
  await abrirCardapio(pagina, restaurante.caminho);
  await adicionar(pagina, 'Costela na brasa');
  await adicionar(pagina, 'Pão de fermentação natural');

  await pagina.getByRole('link', { name: /Ver pedido: 2 itens/ }).click();
  const folha = pagina.getByRole('dialog', { name: 'Seu pedido' });
  await expect(folha).toBeVisible();
  await folha.getByRole('button', { name: 'Aumentar Costela na brasa' }).click();
  await folha.getByLabel('Observação para Costela na brasa').fill('sem cebola');
  await expect(folha.getByText('R$ 202,00')).toBeVisible();
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '01-carrinho', 'm11');

  await folha.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Pedido 1' })).toBeVisible();
  await expect(pagina.getByText('2x Costela na brasa, 1x Pão de fermentação natural')).toBeVisible();
  await expect(pagina.getByText('Enviado para a equipe (agora)')).toBeVisible();
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '02-pedido-enviado', 'm11');

  await pagina.reload();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Pedido 1' })).toBeVisible();
  await pagina.getByRole('button', { name: 'Cancelar pedido' }).click();
  await expect(pagina.getByText('Pedido cancelado.')).toBeVisible();
  await expect(pagina.getByRole('button', { name: 'Cancelar pedido' })).toHaveCount(0);
});

test('a resposta se perde na rede: o reenvio com a mesma chave não duplica o pedido', async ({
  page: pagina,
}) => {
  const restaurante = await semearRestaurante({ nome: 'Brasa Rede', pratos: PRATOS });
  await abrirCardapio(pagina, restaurante.caminho);
  await adicionar(pagina, 'Costela na brasa');
  await pagina.getByRole('link', { name: /Ver pedido/ }).click();

  const chaves: string[] = [];
  await pagina.route('**/api/v1/mesa/pedidos', async (rota) => {
    chaves.push(rota.request().headers()['idempotency-key'] ?? '');
    if (chaves.length === 1) {
      const url = new URL(rota.request().url());
      url.hostname = '127.0.0.1';
      await rota.fetch({
        url: url.toString(),
        headers: { ...rota.request().headers(), host: 'cardapio.localhost' },
      });
      await rota.abort('internetdisconnected');
      return;
    }
    await rota.continue();
  });
  await pagina.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(pagina.getByText('Seu carrinho está guardado neste aparelho.')).toBeVisible();
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '03-sem-conexao', 'm11');

  await pagina.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Pedido 1' })).toBeVisible();
  expect(chaves).toHaveLength(2);
  expect(chaves[1]).toBe(chaves[0]);

  await pagina.unroute('**/api/v1/mesa/pedidos');
  await pagina.getByRole('link', { name: 'Voltar ao cardápio' }).click();
  await adicionar(pagina, 'Pão de fermentação natural');
  await pagina.getByRole('link', { name: /Ver pedido/ }).click();
  await pagina.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Pedido 2' })).toBeVisible();
});

test('prato esgotado entre montar e enviar: recusa clara e o carrinho fica', async ({ page: pagina }) => {
  const restaurante = await semearRestaurante({ nome: 'Brasa Esgotado', pratos: PRATOS });
  await abrirCardapio(pagina, restaurante.caminho);
  await adicionar(pagina, 'Costela na brasa');
  await adicionar(pagina, 'Pão de fermentação natural');
  await esgotarPrato(restaurante.painel, 'Pão de fermentação natural');

  await pagina.getByRole('link', { name: /Ver pedido/ }).click();
  await pagina.getByRole('button', { name: 'Enviar pedido' }).click();
  const folha = pagina.getByRole('dialog', { name: 'Seu pedido' });
  await expect(folha.getByText('Este item acabou. Tire-o do pedido para enviar.')).toBeVisible();
  await expect(folha.getByText('Costela na brasa', { exact: true })).toBeVisible();
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '04-item-esgotado', 'm11');

  await folha.getByRole('button', { name: 'Diminuir Pão de fermentação natural' }).click();
  await folha.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Pedido 1' })).toBeVisible();
});
