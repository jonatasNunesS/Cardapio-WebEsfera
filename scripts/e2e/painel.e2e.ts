import { expect, test } from '@playwright/test';
import { demonstrar, semViolacoesDeAcessibilidade } from './acessibilidade.ts';
import { URL_DO_PAINEL } from './playwright.config.ts';

test('dono cria a conta, o restaurante e publica a cor sugerida depois da reprovada', async ({
  page: pagina,
}) => {
  const email = `dono-${process.env.SUFIXO_E2E ?? '0'}@brasa.com.br`;

  await pagina.goto(`${URL_DO_PAINEL}/criar-conta`);
  await expect(pagina.getByRole('heading', { level: 1, name: 'Criar conta' })).toBeVisible();
  await pagina.getByLabel('Seu nome').fill('Ana Souza');
  await pagina.getByLabel('E-mail').fill(email);
  await pagina.getByLabel('Senha').fill('1234567890');
  await pagina.getByRole('button', { name: 'Criar conta' }).click();

  const senha = pagina.getByLabel('Senha');
  await expect(senha).toHaveAttribute('aria-invalid', 'true');
  await expect(senha).toHaveAccessibleDescription(/vazamentos conhecidos/);
  await expect(senha).toBeFocused();
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '01-criar-conta-senha-vazada');

  await senha.fill('cavalo-bateria-grampo');
  await pagina.getByRole('button', { name: 'Criar conta' }).click();

  await expect(pagina.getByRole('heading', { level: 1, name: 'Criar o restaurante' })).toBeVisible();
  await semViolacoesDeAcessibilidade(pagina);
  await pagina.getByLabel('Nome do restaurante').fill(`Brasa & Trigo ${process.env.SUFIXO_E2E ?? ''}`);
  await demonstrar(pagina, '02-criar-restaurante');
  await pagina.getByRole('button', { name: 'Criar restaurante' }).click();

  await expect(pagina.getByRole('heading', { level: 1, name: 'Personalização' })).toBeVisible();
  const cor = pagina.getByLabel('Cor em hexadecimal');
  await cor.fill('#E0B000');
  await pagina.getByRole('button', { name: 'Publicar' }).click();

  await expect(cor).toHaveAttribute('aria-invalid', 'true');
  await expect(cor).toHaveAccessibleDescription(/ilegível no cardápio/);
  await expect(pagina.getByText('Sugestão: #A88400')).toBeVisible();
  await expect(
    pagina.getByText(/Texto do botão 8,51:1 \(mínimo 4,5\) e destaque contra o fundo 1,84:1/),
  ).toBeVisible();
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '03-cor-reprovada-com-sugestao');

  await pagina.getByRole('button', { name: 'Usar este tom' }).click();
  await expect(cor).toHaveValue('#A88400');
  await pagina.getByRole('button', { name: 'Publicar' }).click();

  await expect(pagina.getByText('Personalização publicada.')).toBeVisible();
  await expect(cor).not.toHaveAttribute('aria-invalid');
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '04-cor-sugerida-publicada');

  const cookies = await pagina.context().cookies();
  const sessao = cookies.find((cookie) => cookie.name === '__Host-sessao_painel');
  expect(sessao).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
});

test('entrar com senha errada mostra a mesma mensagem que um e-mail inexistente', async ({
  page: pagina,
}) => {
  await pagina.goto(`${URL_DO_PAINEL}/entrar`);
  await pagina.getByLabel('E-mail').fill(`ninguem-${process.env.SUFIXO_E2E ?? '0'}@x.com`);
  await pagina.getByLabel('Senha').fill('qualquer-senha-1');
  await pagina.getByRole('button', { name: 'Entrar' }).click();

  await expect(pagina.getByRole('alert')).toHaveText('E-mail ou senha incorretos.');
  await semViolacoesDeAcessibilidade(pagina);
});
