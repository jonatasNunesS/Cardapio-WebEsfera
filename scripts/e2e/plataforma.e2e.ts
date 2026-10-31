import { createHash, randomBytes } from 'node:crypto';
import { expect, test, type BrowserContext } from '@playwright/test';
import { consultarComUrl } from '../../pacotes/infraestrutura/src/testes.ts';
import { demonstrar, semViolacoesDeAcessibilidade } from './acessibilidade.ts';
import { semearRestaurante } from './cliente-apoio.ts';
import { URL_DO_ADMIN, URL_DO_CARDAPIO, URL_DO_PAINEL } from './playwright.config.ts';

test.use({ serviceWorkers: 'block' });

const HASH = '$argon2id$v=19$m=19456,t=2,p=1$ZmFicmljYQ$ZmFicmljYQ';

function urlDoBanco(): string {
  const url = new URL(
    process.env.URL_BANCO_TESTE_ADMIN ?? 'postgres://cardapio:cardapio_local@127.0.0.1:5432/postgres',
  );
  url.pathname = `/${process.env.BANCO_E2E ?? 'cardapio'}`;
  return url.toString();
}

async function entrarComoAdmin(contexto: BrowserContext) {
  const [admin] = await consultarComUrl<{ id: string }>(
    urlDoBanco(),
    `INSERT INTO administradores (nome, email, hash_senha, papel, segredo_totp_cifrado, troca_de_senha_obrigatoria)
     VALUES ('Ops E2E', $1, $2, 'suporte', 'cifrado', false) RETURNING id`,
    [`ops-plataforma-${String(Date.now())}@webesfera.com.br`, HASH],
  );
  const token = randomBytes(32).toString('base64url');
  await consultarComUrl(
    urlDoBanco(),
    `INSERT INTO sessoes (hash_id, publico, administrador_id, nivel, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, 'admin', $2, 'completa', now(), now(), now() + interval '1 hour')`,
    [createHash('sha256').update(token).digest('hex'), admin?.id],
  );
  await contexto.addCookies([
    {
      name: '__Host-sessao_admin',
      value: token,
      domain: 'admin.localhost',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

test('admin cria restaurante com convite; o dono cria a senha e entra no painel', async ({
  page: pagina,
  context: contexto,
  browser: navegador,
}) => {
  await entrarComoAdmin(contexto);
  const sufixo = String(Date.now()).slice(-6);
  const email = `dono-convite-${sufixo}@brasa.com.br`;

  await pagina.goto(`${URL_DO_ADMIN}/restaurantes`);
  await expect(pagina.getByRole('heading', { level: 1, name: 'Restaurantes' })).toBeVisible();
  await expect(pagina.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
  await semViolacoesDeAcessibilidade(pagina);

  await pagina.getByLabel('Nome do restaurante').fill(`Brasa Convite ${sufixo}`);
  await pagina.getByLabel('Endereço (slug)').fill(`brasa-convite-${sufixo}`);
  await pagina.getByLabel('E-mail do dono').fill(email);
  await pagina.getByRole('button', { name: 'Criar e gerar convite' }).click();
  const link = (await pagina.getByText(/\/convite#token=/).textContent()) ?? '';
  await expect(pagina.getByRole('link', { name: `Brasa Convite ${sufixo}` })).toBeVisible();
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '04-admin-restaurante-criado', 'intermediario');

  const dono = await (await navegador.newContext()).newPage();
  await dono.goto(link.replace(/^https?:\/\/[^/]+/, URL_DO_PAINEL));
  await expect(
    dono.getByRole('heading', { level: 1, name: 'Boas-vindas ao Cardápio WebEsfera' }),
  ).toBeVisible();
  await semViolacoesDeAcessibilidade(dono);
  await dono.getByLabel('Sua senha').fill('cavalo-bateria-grampo-azul');
  await dono.getByRole('button', { name: 'Criar senha e entrar' }).click();
  await expect(dono.getByRole('heading', { level: 1, name: 'Entrar' })).toBeVisible();
  await dono.getByLabel('E-mail').fill(email);
  await dono.getByLabel('Senha').fill('cavalo-bateria-grampo-azul');
  await dono.getByRole('button', { name: 'Entrar' }).click();
  await expect(dono.getByText(`Brasa Convite ${sufixo}`)).toBeVisible();
});

test('admin suspende: o cliente vê o cardápio mas o pedido é recusado; reativar volta a aceitar', async ({
  page: cliente,
  browser: navegador,
}) => {
  const restaurante = await semearRestaurante({
    nome: 'Brasa Suspensa',
    pratos: [{ nome: 'Moqueca da casa', precoCentavos: 7900 }],
  });
  const contextoDoAdmin = await navegador.newContext();
  await entrarComoAdmin(contextoDoAdmin);
  const admin = await contextoDoAdmin.newPage();

  await admin.goto(`${URL_DO_ADMIN}/restaurantes/${restaurante.slug}`);
  await admin.getByLabel('Motivo da suspensão').fill('Teste do piloto');
  await admin.getByRole('button', { name: 'Suspender restaurante' }).click();
  await expect(admin.getByText('Situação: Suspenso')).toBeVisible();
  await semViolacoesDeAcessibilidade(admin);
  await demonstrar(admin, '05-admin-restaurante-suspenso', 'intermediario');

  await cliente.goto(`${URL_DO_CARDAPIO}${restaurante.caminho}`);
  await cliente.getByRole('button', { name: 'Ver cardápio' }).click();
  await cliente.getByRole('link', { name: 'Moqueca da casa' }).first().click();
  await cliente.getByRole('button', { name: 'Adicionar ao pedido' }).click();
  await cliente.getByRole('link', { name: 'Voltar ao cardápio' }).click();
  await cliente.getByRole('link', { name: /Ver pedido/ }).click();
  await cliente.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(cliente.getByText(/não está recebendo pedidos/)).toBeVisible();

  await admin.getByLabel('Motivo da reativação').fill('Pagamento confirmado');
  await admin.getByRole('button', { name: 'Reativar restaurante' }).click();
  await expect(admin.getByText('Situação: Teste')).toBeVisible();
  await cliente.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(cliente.getByRole('heading', { level: 1, name: 'Pedido 1' })).toBeVisible();
});
