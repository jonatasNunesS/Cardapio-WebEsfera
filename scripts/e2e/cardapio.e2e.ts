import { expect, test, type Page } from '@playwright/test';
import { demonstrar, semViolacoesDeAcessibilidade } from './acessibilidade.ts';
import { URL_DO_PAINEL } from './playwright.config.ts';

async function donoComRestaurante(pagina: Page): Promise<void> {
  const sufixo = `${process.env.SUFIXO_E2E ?? '0'}-${String(Date.now())}`;
  await pagina.goto(`${URL_DO_PAINEL}/criar-conta`);
  await pagina.getByLabel('Seu nome').fill('Bruno Lima');
  await pagina.getByLabel('E-mail').fill(`cardapio-${sufixo}@brasa.com.br`);
  await pagina.getByLabel('Senha').fill('cavalo-bateria-grampo');
  await pagina.getByRole('button', { name: 'Criar conta' }).click();
  await pagina.getByLabel('Nome do restaurante').fill(`Cantina ${sufixo}`);
  await pagina.getByRole('button', { name: 'Criar restaurante' }).click();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Personalização' })).toBeVisible();
}

async function criarPrato(pagina: Page, categoria: string, nome: string, preco: string): Promise<void> {
  await pagina.getByRole('link', { name: `Novo prato em ${categoria}` }).click();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Novo prato' })).toBeVisible();
  await pagina.getByLabel('Nome do prato').fill(nome);
  await pagina.getByLabel('Descrição').fill('Feito na casa, todos os dias.');
  await pagina.getByLabel('Preço em reais').fill(preco);
  await pagina.getByRole('button', { name: 'Salvar prato' }).click();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Cardápio' })).toBeVisible();
}

const nomesDosPratos = (pagina: Page, categoria: string) =>
  pagina
    .getByRole('list', { name: `Pratos de ${categoria}` })
    .getByRole('heading', { level: 3 })
    .allInnerTexts();

test('dono monta o cardápio: categoria, prato, esgotado, reordenação e conflito de versão', async ({
  page: pagina,
  context: contexto,
}) => {
  await donoComRestaurante(pagina);
  await pagina.getByRole('link', { name: 'Cardápio' }).click();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Cardápio' })).toBeVisible();
  await semViolacoesDeAcessibilidade(pagina);

  await pagina.getByLabel('Nova categoria').fill('Entradas');
  await pagina.getByRole('button', { name: 'Adicionar categoria' }).click();
  await expect(pagina.getByRole('heading', { level: 2, name: 'Entradas' })).toBeVisible();

  await pagina.getByRole('link', { name: 'Novo prato em Entradas' }).click();
  await pagina.getByLabel('Preço em reais').fill('24.00');
  await pagina.getByLabel('Nome do prato').fill('Pão de fermentação');
  await pagina.getByRole('button', { name: 'Salvar prato' }).click();
  await expect(pagina.getByLabel('Preço em reais')).toHaveAttribute('aria-invalid', 'true');
  await semViolacoesDeAcessibilidade(pagina);
  await pagina.getByLabel('Preço em reais').fill('24,00');
  await pagina.getByRole('button', { name: 'Salvar prato' }).click();
  await expect(pagina.getByText('R$ 24,00')).toBeVisible();

  await criarPrato(pagina, 'Entradas', 'Bolinho de arroz', '32,00');
  await criarPrato(pagina, 'Entradas', 'Burrata', '58,00');
  expect(await nomesDosPratos(pagina, 'Entradas')).toEqual([
    'Pão de fermentação',
    'Bolinho de arroz',
    'Burrata',
  ]);

  await pagina.getByLabel('Esgotado: Burrata').check();
  await expect(
    pagina.getByRole('listitem').filter({ hasText: 'Burrata' }).getByText('Esgotado', { exact: true }),
  ).toBeVisible();

  await pagina.getByRole('button', { name: 'Subir Burrata' }).click();
  await expect
    .poll(() => nomesDosPratos(pagina, 'Entradas'))
    .toEqual(['Pão de fermentação', 'Burrata', 'Bolinho de arroz']);
  await pagina.getByRole('button', { name: 'Subir Burrata' }).click();
  await expect
    .poll(() => nomesDosPratos(pagina, 'Entradas'))
    .toEqual(['Burrata', 'Pão de fermentação', 'Bolinho de arroz']);
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '01-cardapio-no-painel', 'm06');

  await pagina.getByRole('link', { name: 'Editar Bolinho de arroz' }).click();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Editar prato' })).toBeVisible();
  const outraAba = await contexto.newPage();
  await outraAba.goto(pagina.url());
  await outraAba.getByLabel('Nome do prato').fill('Bolinho da casa');
  await outraAba.getByRole('button', { name: 'Salvar prato' }).click();
  await expect(outraAba.getByRole('heading', { level: 1, name: 'Cardápio' })).toBeVisible();

  await pagina.getByLabel('Preço em reais').fill('35,00');
  await pagina.getByRole('button', { name: 'Salvar prato' }).click();
  await expect(pagina.getByText('Alguém mudou este prato enquanto você editava.')).toBeVisible();
  await expect(pagina.getByLabel('Nome do prato')).toHaveValue('Bolinho da casa');
  await expect(pagina.getByLabel('Preço em reais')).toHaveValue('32,00');
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '02-conflito-de-versao', 'm06');

  await pagina.getByLabel('Preço em reais').fill('35,00');
  await pagina.getByRole('button', { name: 'Salvar prato' }).click();
  await expect(pagina.getByText('R$ 35,00')).toBeVisible();
});
