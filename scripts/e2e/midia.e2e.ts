import { expect, test, type Page } from '@playwright/test';
import { rm } from 'node:fs/promises';
import { criarAmostras, type Amostras } from '../../pacotes/infraestrutura/src/testes.ts';
import { demonstrar, semViolacoesDeAcessibilidade } from './acessibilidade.ts';
import { URL_DO_PAINEL } from './playwright.config.ts';

const ESPERA_DO_PROCESSAMENTO_MS = 90_000;

let amostras: Amostras;

test.beforeAll(async () => {
  amostras = await criarAmostras();
});

test.afterAll(async () => {
  await rm(amostras.pasta, { recursive: true, force: true });
});

async function donoComPrato(pagina: Page): Promise<void> {
  const sufixo = `${process.env.SUFIXO_E2E ?? '0'}-${String(Date.now())}`;
  await pagina.goto(`${URL_DO_PAINEL}/criar-conta`);
  await pagina.getByLabel('Seu nome').fill('Rita Souza');
  await pagina.getByLabel('E-mail').fill(`midia-${sufixo}@brasa.com.br`);
  await pagina.getByLabel('Senha').fill('cavalo-bateria-grampo');
  await pagina.getByRole('button', { name: 'Criar conta' }).click();
  await pagina.getByLabel('Nome do restaurante').fill(`Brasa ${sufixo}`);
  await pagina.getByRole('button', { name: 'Criar restaurante' }).click();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Personalização' })).toBeVisible();
  await pagina.getByRole('link', { name: 'Cardápio' }).click();
  await pagina.getByLabel('Nova categoria').fill('Principais');
  await pagina.getByRole('button', { name: 'Adicionar categoria' }).click();
  await pagina.getByRole('link', { name: 'Novo prato em Principais' }).click();
  await pagina.getByLabel('Nome do prato').fill('Costela na brasa');
  await pagina.getByLabel('Preço em reais').fill('89,90');
  await pagina.getByRole('button', { name: 'Salvar prato' }).click();
  await pagina.getByRole('link', { name: 'Editar Costela na brasa' }).click();
  await expect(pagina.getByRole('heading', { level: 2, name: 'Foto ou vídeo' })).toBeVisible();
}

test('dono envia vídeo, vê processando e pronto; arquivo ruim falha com tentar de novo; troca e remove', async ({
  page: pagina,
}) => {
  test.setTimeout(240_000);
  await donoComPrato(pagina);
  await expect(pagina.getByText('Sem foto nem vídeo ainda.')).toBeVisible();
  await semViolacoesDeAcessibilidade(pagina);

  await pagina.getByLabel('Enviar foto ou vídeo').setInputFiles(amostras.videoLongo);
  await expect(pagina.getByText('Arquivo enviado.')).toBeVisible();
  await expect(pagina.getByText('Estamos preparando o vídeo.')).toBeVisible();
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '01-processando', 'm07');
  await expect(pagina.getByLabel('Vídeo de Costela na brasa')).toBeVisible({
    timeout: ESPERA_DO_PROCESSAMENTO_MS,
  });
  await expect(pagina.getByText('Estamos preparando o vídeo.')).toBeHidden();
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '02-video-pronto', 'm07');

  await pagina.getByLabel('Trocar foto ou vídeo').setInputFiles(amostras.soAudio);
  await expect(pagina.getByRole('button', { name: 'Tentar de novo' })).toBeVisible({
    timeout: ESPERA_DO_PROCESSAMENTO_MS,
  });
  await expect(pagina.getByText('O arquivo não tem imagem de vídeo (só áudio).')).toBeVisible();
  await expect(pagina.getByLabel('Vídeo de Costela na brasa')).toBeVisible();
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '03-falhou-tentar-de-novo', 'm07');
  await pagina.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(pagina.getByText('Processando de novo.')).toBeVisible();
  await expect(pagina.getByRole('button', { name: 'Tentar de novo' })).toBeVisible({
    timeout: ESPERA_DO_PROCESSAMENTO_MS,
  });

  await pagina.getByLabel('Trocar foto ou vídeo').setInputFiles(amostras.foto);
  await expect(pagina.getByRole('img', { name: 'Foto de Costela na brasa' })).toBeVisible({
    timeout: ESPERA_DO_PROCESSAMENTO_MS,
  });
  await expect(pagina.getByLabel('Vídeo de Costela na brasa')).toBeHidden();
  await expect(pagina.getByRole('button', { name: 'Tentar de novo' })).toBeHidden();
  await semViolacoesDeAcessibilidade(pagina);
  await demonstrar(pagina, '04-trocada-por-foto', 'm07');

  await pagina.getByRole('button', { name: 'Remover mídia' }).click();
  await expect(pagina.getByText('Sem foto nem vídeo ainda.')).toBeVisible();
});
