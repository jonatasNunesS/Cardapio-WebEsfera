import { expect, type Page } from '@playwright/test';
import { URL_DO_PAINEL } from './playwright.config.ts';

export async function donoComMesas(pagina: Page, numeros: readonly number[]): Promise<string> {
  const sufixo = `${process.env.SUFIXO_E2E ?? '0'}-${String(Date.now())}`;
  await pagina.goto(`${URL_DO_PAINEL}/criar-conta`);
  await pagina.getByLabel('Seu nome').fill('Carla Dias');
  await pagina.getByLabel('E-mail').fill(`mesas-${sufixo}@brasa.com.br`);
  await pagina.getByLabel('Senha').fill('cavalo-bateria-grampo');
  await pagina.getByRole('button', { name: 'Criar conta' }).click();
  await pagina.getByLabel('Nome do restaurante').fill(`Brasa ${sufixo}`);
  await pagina.getByRole('button', { name: 'Criar restaurante' }).click();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Personalização' })).toBeVisible();
  await pagina.getByRole('link', { name: 'Mesas e QR Codes' }).click();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Mesas e QR Codes' })).toBeVisible();
  for (const numero of numeros) {
    await pagina.getByLabel('Número da mesa', { exact: true }).fill(String(numero));
    await pagina.getByRole('button', { name: 'Adicionar mesa' }).click();
    await expect(pagina.getByRole('row').filter({ hasText: `/mesa/${String(numero)}?c=` })).toBeVisible();
  }
  const link = (await pagina.locator('code').first().textContent()) ?? '';
  return new URL(link).pathname.split('/')[1] ?? '';
}
