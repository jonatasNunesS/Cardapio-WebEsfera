import { expect, test } from '@playwright/test';
import { generate } from 'otplib';
import { demonstrar, semViolacoesDeAcessibilidade } from './acessibilidade.ts';
import { URL_DO_ADMIN } from './playwright.config.ts';
import { SENHA_TEMPORARIA_DO_ADMIN } from './preparar.ts';

const SENHA_DEFINITIVA = 'senha-definitiva-do-admin';

test('admin: primeiro acesso cadastra o TOTP; depois entra com senha e código', async ({ page: pagina }) => {
  const email = process.env.EMAIL_DO_ADMIN_E2E ?? '';
  const agora = () => Math.floor(Date.now() / 1000);

  await pagina.goto(`${URL_DO_ADMIN}/entrar`);
  await pagina.getByLabel('E-mail').fill(email);
  await pagina.getByLabel('Senha').fill(SENHA_TEMPORARIA_DO_ADMIN);
  await semViolacoesDeAcessibilidade(pagina);
  await pagina.getByRole('button', { name: 'Continuar' }).click();

  await expect(pagina.getByRole('heading', { level: 1, name: 'Primeiro acesso' })).toBeVisible();
  await pagina.getByRole('button', { name: 'Gerar a chave do autenticador' }).click();
  const segredo = (await pagina.locator('p', { hasText: /^[A-Z2-7]{32}$/ }).textContent()) ?? '';
  await expect(pagina.getByRole('link', { name: 'Abrir no autenticador' })).toHaveAttribute(
    'href',
    /^otpauth:\/\/totp\//,
  );
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '05-admin-primeiro-acesso');

  await pagina.getByLabel('Código do aplicativo').fill(await generate({ secret: segredo, epoch: agora() }));
  await pagina.getByLabel('Senha definitiva').fill(SENHA_DEFINITIVA);
  await pagina.getByRole('button', { name: 'Ativar o segundo fator' }).click();

  await expect(
    pagina.getByRole('list', { name: 'Códigos de recuperação' }).getByRole('listitem'),
  ).toHaveCount(10);
  await semViolacoesDeAcessibilidade(pagina);
  await pagina.getByRole('button', { name: 'Já guardei os códigos' }).click();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Sessão ativa' })).toBeVisible();

  await pagina.getByRole('button', { name: 'Sair' }).click();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Entrar' })).toBeVisible();
  await pagina.getByLabel('E-mail').fill(email);
  await pagina.getByLabel('Senha').fill(SENHA_DEFINITIVA);
  await pagina.getByRole('button', { name: 'Continuar' }).click();

  await expect(pagina.getByRole('heading', { level: 1, name: 'Confirme que é você' })).toBeVisible();
  const codigo = pagina.getByLabel('Código de verificação');
  await codigo.fill('000000');
  await pagina.getByRole('button', { name: 'Entrar' }).click();
  await expect(pagina.getByRole('alert')).toHaveText('Código inválido.');
  await semViolacoesDeAcessibilidade(pagina);

  await codigo.fill(await generate({ secret: segredo, epoch: agora() + 30 }));
  await demonstrar(pagina, '06-admin-segundo-fator');
  await pagina.getByRole('button', { name: 'Entrar' }).click();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Sessão ativa' })).toBeVisible();

  const cookies = await pagina.context().cookies();
  expect(cookies.find((cookie) => cookie.name === '__Host-sessao_admin')).toMatchObject({
    httpOnly: true,
    secure: true,
    domain: 'admin.localhost',
  });
});
