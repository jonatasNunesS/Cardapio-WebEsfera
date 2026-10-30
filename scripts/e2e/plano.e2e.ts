import { expect, test, type Page } from '@playwright/test';
import { demonstrar, semViolacoesDeAcessibilidade } from './acessibilidade.ts';
import { donoComMesas } from './mesas-apoio.ts';
import { URL_DO_MERCADO_PAGO_FALSO } from './playwright.config.ts';

async function noMercadoPagoFalso(acao: string, assinaturaId: string, consulta = ''): Promise<void> {
  const resposta = await fetch(`${URL_DO_MERCADO_PAGO_FALSO}/__falso/${acao}/${assinaturaId}${consulta}`, {
    method: 'POST',
  });
  expect(resposta.status).toBe(200);
}

async function esperarTexto(pagina: Page, texto: string): Promise<void> {
  await expect(async () => {
    await pagina.reload();
    await expect(pagina.getByText(texto)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
}

test('dono assina pelo Mercado Pago falso, a cobrança paga ativa o restaurante e o limite vira o do plano', async ({
  page: pagina,
}) => {
  await donoComMesas(pagina, [1]);
  await pagina.getByRole('button', { name: 'Fechar notificação' }).click();
  await pagina.getByRole('link', { name: 'Plano e cobrança' }).click();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Plano e cobrança' })).toBeVisible();
  await expect(pagina.getByText('Período de teste')).toBeVisible();
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '01-plano-em-teste', 'm10');

  await pagina.getByLabel(/^Básico/).check();
  await pagina.getByLabel('E-mail da sua conta do Mercado Pago').fill('pagador@brasa.com.br');
  await pagina.getByRole('button', { name: 'Assinar pelo Mercado Pago' }).click();
  const pagar = pagina.getByRole('link', { name: 'Pagar no Mercado Pago' });
  await expect(pagar).toBeVisible();
  const link = new URL((await pagar.getAttribute('href')) ?? '');
  expect(link.hostname).toBe('www.mercadopago.com.br');
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '02-assinatura-pendente', 'm10');

  const assinaturaId = link.searchParams.get('preapproval_id') ?? '';
  await noMercadoPagoFalso('cobrar', assinaturaId, '?pagamento=rejected');
  await esperarTexto(pagina, 'Em nova tentativa');
  await expect(pagina.getByText('Período de teste')).toBeVisible();

  await noMercadoPagoFalso('autorizar', assinaturaId);
  await noMercadoPagoFalso('cobrar', assinaturaId, '?pagamento=approved');
  await esperarTexto(pagina, 'Assinatura em dia');
  await expect(pagina.getByRole('cell', { name: 'Paga', exact: true })).toBeVisible();
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '03-assinatura-em-dia', 'm10');

  await pagina.getByRole('link', { name: 'Mesas e QR Codes' }).click();
  await expect(pagina.getByText('1 de 10 mesas ativas no seu plano.')).toBeVisible();
});
