import {
  criarAdministradorPorUrl,
  criarCofreArgon2,
  criarRedis,
} from '../../pacotes/infraestrutura/src/index.ts';
import { URL_DO_REDIS_E2E } from './playwright.config.ts';

export const SENHA_TEMPORARIA_DO_ADMIN = 'temporaria-e2e-123';

export async function zerarLimitesDeTaxa(): Promise<void> {
  const redis = criarRedis(URL_DO_REDIS_E2E, { reportar: () => '', registrarPasso: () => undefined });
  const chaves = await redis.keys('limite:api:*');
  if (chaves.length > 0) {
    await redis.del(...chaves);
  }
  redis.disconnect();
}

export default async function preparar(): Promise<void> {
  await zerarLimitesDeTaxa();
  const sufixo = String(Date.now());
  const email = `ops-${sufixo}@webesfera.com.br`;
  const url =
    process.env.URL_BANCO_MIGRACAO_E2E ??
    `postgres://cardapio_migracao:${process.env.SENHA_BANCO_MIGRACAO ?? 'migracao_local'}@127.0.0.1:5432/cardapio`;
  await criarAdministradorPorUrl(url, {
    nome: 'Ops E2E',
    email,
    papel: 'dono_plataforma',
    hashSenha: await criarCofreArgon2().resumir(SENHA_TEMPORARIA_DO_ADMIN),
  });
  process.env.EMAIL_DO_ADMIN_E2E = email;
  process.env.SUFIXO_E2E = sufixo;
}
