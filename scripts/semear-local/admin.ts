import {
  criarCifraAesGcm,
  criarCofreArgon2,
  gravarAdminLocalPorUrl,
  lerChaveDeCifra,
} from '../../pacotes/infraestrutura/src/index.ts';
import { CONTAS_LOCAIS, SEGREDO_TOTP_LOCAL, type AmbienteDaSemente } from './ambiente.ts';

export async function semearAdmin(ambiente: AmbienteDaSemente): Promise<void> {
  const cifra = criarCifraAesGcm(lerChaveDeCifra(ambiente.chaveDaCifra));
  await gravarAdminLocalPorUrl(ambiente.urlDoBanco, {
    email: CONTAS_LOCAIS.admin.email,
    hashSenha: await criarCofreArgon2().resumir(CONTAS_LOCAIS.admin.senha),
    segredoTotpCifrado: cifra.cifrar(SEGREDO_TOTP_LOCAL),
  });
}
