import { expect, test, type Page } from '@playwright/test';
import { demonstrar, semViolacoesDeAcessibilidade } from './acessibilidade.ts';
import { encerrarSessoesDaMesa, semearRestaurante } from './cliente-apoio.ts';
import { URL_DO_CARDAPIO } from './playwright.config.ts';

test.use({ serviceWorkers: 'block' });

const PRATOS = [
  { nome: 'Costela na brasa', precoCentavos: 8900 },
  { nome: 'Pão de fermentação natural', precoCentavos: 2400 },
];
const GOOGLE = 'https://g.page/r/brasa-e-trigo/review';
const INSTAGRAM = 'https://instagram.com/brasaetrigo';

async function abrirCardapio(pagina: Page, caminho: string) {
  await pagina.goto(`${URL_DO_CARDAPIO}${caminho}`);
  await pagina.getByRole('button', { name: 'Ver cardápio' }).click();
  await expect(pagina.getByRole('link', { name: 'Buscar prato ou ingrediente' })).toBeVisible();
}

async function pedir(pagina: Page) {
  for (const nome of ['Costela na brasa', 'Pão de fermentação natural']) {
    await pagina.getByRole('link', { name: nome }).first().click();
    await pagina.getByRole('button', { name: 'Adicionar ao pedido' }).click();
    await pagina.getByRole('link', { name: 'Voltar ao cardápio' }).click();
  }
  await pagina.getByRole('link', { name: /Ver pedido/ }).click();
  await pagina.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Pedido 1' })).toBeVisible();
  await pagina.getByRole('link', { name: 'Voltar ao cardápio' }).click();
}

test('chamar o garçom duas vezes cria um chamado só; cancelar; pedir a conta; resumo com taxa e divisão', async ({
  page: pagina,
}) => {
  const restaurante = await semearRestaurante({
    nome: 'Brasa Chamado',
    pratos: PRATOS,
    linkAvaliacaoGoogle: GOOGLE,
  });
  await abrirCardapio(pagina, restaurante.caminho);
  await pedir(pagina);

  const chamadas: number[] = [];
  pagina.on('response', (resposta) => {
    if (resposta.url().endsWith('/api/v1/mesa/chamados/garcom')) {
      chamadas.push(resposta.status());
    }
  });
  await pagina.getByRole('link', { name: 'Chamar garçom ou pedir a conta' }).click();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Do que você precisa?' })).toBeVisible();
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '01-do-que-voce-precisa', 'm12');

  await pagina.getByRole('button', { name: 'Chamar garçom' }).click();
  await expect(pagina.getByText('Garçom avisado.')).toBeVisible();
  await pagina.getByRole('button', { name: 'Chamar garçom' }).click();
  await expect.poll(() => chamadas).toEqual([201, 200]);
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '02-garcom-avisado', 'm12');

  await pagina.getByRole('button', { name: 'Cancelar chamado' }).click();
  await expect(pagina.getByText('Chamado cancelado.')).toBeVisible();

  await pagina.getByRole('button', { name: 'Pedir a conta' }).click();
  await expect(pagina.getByText('Conta pedida.')).toBeVisible();

  await pagina.getByRole('link', { name: 'Ver resumo da conta' }).click();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Conta da Mesa 12' })).toBeVisible();
  await expect(pagina.getByText('R$ 124,30').first()).toBeVisible();
  await pagina.getByLabel('Taxa de serviço (10%, opcional)').uncheck();
  await expect(pagina.getByText('R$ 113,00').last()).toBeVisible();
  await pagina.getByLabel('Taxa de serviço (10%, opcional)').check();
  await pagina.getByRole('button', { name: 'Aumentar pessoas na divisão' }).click();
  await pagina.getByRole('button', { name: 'Aumentar pessoas na divisão' }).click();
  await expect(pagina.getByText('3 pessoas: R$ 41,44 por pessoa')).toBeVisible();
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '03-resumo-da-conta', 'm12');
});

test('com a mesa encerrada, aparece o agradecimento; o botão do Google abre em nova aba', async ({
  page: pagina,
}) => {
  const restaurante = await semearRestaurante({
    nome: 'Brasa Fim',
    pratos: PRATOS,
    linkAvaliacaoGoogle: GOOGLE,
    linkInstagram: INSTAGRAM,
  });
  await abrirCardapio(pagina, restaurante.caminho);
  await encerrarSessoesDaMesa(restaurante.slug);

  await expect(pagina.getByRole('heading', { level: 1, name: 'Obrigado pela visita!' })).toBeVisible({
    timeout: 40_000,
  });
  const google = pagina.getByRole('link', { name: 'Avaliar no Google' });
  await expect(google).toHaveAttribute('href', GOOGLE);
  await expect(google).toHaveAttribute('target', '_blank');
  await expect(google).toHaveAttribute('rel', 'noopener');
  await expect(pagina.getByRole('link', { name: 'Seguir no Instagram' })).toHaveAttribute('href', INSTAGRAM);
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '04-agradecimento', 'm12');
});

test('sem link cadastrado, o botão do Google não aparece', async ({ page: pagina }) => {
  const restaurante = await semearRestaurante({ nome: 'Brasa Sem Link', pratos: PRATOS });
  await abrirCardapio(pagina, restaurante.caminho);
  await encerrarSessoesDaMesa(restaurante.slug);

  await expect(pagina.getByRole('heading', { level: 1, name: 'Obrigado pela visita!' })).toBeVisible({
    timeout: 40_000,
  });
  await expect(pagina.getByRole('link', { name: 'Avaliar no Google' })).toHaveCount(0);
  await expect(pagina.getByRole('link', { name: 'Seguir no Instagram' })).toHaveCount(0);
});
