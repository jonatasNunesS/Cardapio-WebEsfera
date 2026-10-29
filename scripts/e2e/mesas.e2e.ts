import { expect, test, type Page } from '@playwright/test';
import { demonstrar, semViolacoesDeAcessibilidade } from './acessibilidade.ts';
import { donoComMesas } from './mesas-apoio.ts';

const linhaDa = (pagina: Page, numero: number) =>
  pagina.getByRole('row').filter({ hasText: `/mesa/${String(numero)}?c=` });

test('dono cria mesas, vê o QR, desativa, renumera e gera novo código com confirmação', async ({
  page: pagina,
}) => {
  await donoComMesas(pagina, [1, 2]);
  await expect(pagina.getByText('2 de 30 mesas ativas no seu plano.')).toBeVisible();
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '01-mesas-no-painel', 'm08');

  const tipoDe = async (nome: string) => {
    const href = (await pagina.getByRole('link', { name: nome }).getAttribute('href')) ?? '';
    return pagina.evaluate(async (url) => (await fetch(url)).headers.get('content-type'), href);
  };
  expect(await tipoDe('Ver QR da mesa 1')).toBe('image/png');
  expect(await tipoDe('Baixar todos os QR Codes (ZIP)')).toBe('application/zip');

  await linhaDa(pagina, 2).getByRole('button', { name: 'Desativar mesa 2' }).click();
  await expect(linhaDa(pagina, 2).getByRole('cell', { name: 'Desativada' })).toBeVisible();
  await expect(pagina.getByText('1 de 30 mesas ativas no seu plano.')).toBeVisible();

  await pagina.getByLabel('Novo número da mesa 1').fill('10');
  await linhaDa(pagina, 1).getByRole('button', { name: 'Renumerar' }).click();
  await expect(linhaDa(pagina, 10)).toBeVisible();

  const antes = await linhaDa(pagina, 10).locator('code').textContent();
  await linhaDa(pagina, 10).getByRole('button', { name: 'Gerar novo código da mesa 10' }).click();
  await expect(pagina.getByText('O QR impresso desta mesa deixa de funcionar na hora.')).toBeVisible();
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '02-confirmar-novo-codigo', 'm08');
  await pagina.getByRole('button', { name: 'Confirmar novo código' }).click();
  await expect(linhaDa(pagina, 10).locator('code')).not.toHaveText(antes ?? '');
  expect(await linhaDa(pagina, 10).locator('code').textContent()).toContain('/mesa/10?c=');
});
