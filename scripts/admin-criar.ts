import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import {
  criarAdministradorPorUrl,
  criarCofreArgon2,
  type NovoAdministrador,
  type PapelDeAdministrador,
} from '../pacotes/infraestrutura/src/index.ts';
import { urlDeMigracao } from './banco-migrar.ts';

const PAPEIS: readonly PapelDeAdministrador[] = ['suporte', 'financeiro', 'dono_plataforma'];

export interface PedidoDeAdministrador {
  readonly email: string;
  readonly nome: string;
  readonly papel: PapelDeAdministrador;
}

export function lerArgumentos(argumentos: readonly string[]): PedidoDeAdministrador {
  const { values } = parseArgs({
    args: [...argumentos],
    options: { email: { type: 'string' }, nome: { type: 'string' }, papel: { type: 'string' } },
    strict: true,
  });
  const email = values.email?.trim().toLowerCase() ?? '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(
      'Uso: pnpm admin:criar --email pessoa@webesfera.com.br [--nome "Nome"] [--papel dono_plataforma]',
    );
  }
  const papel = PAPEIS.find((item) => item === (values.papel ?? 'dono_plataforma'));
  if (papel === undefined) {
    throw new Error(`--papel precisa ser um de: ${PAPEIS.join(', ')}`);
  }
  const nome = values.nome?.trim() ?? '';
  return { email, nome: nome === '' ? (email.split('@')[0] ?? email) : nome, papel };
}

export function gerarSenhaTemporaria(): string {
  return randomBytes(15).toString('base64url');
}

async function executar(): Promise<void> {
  const pedido = lerArgumentos(process.argv.slice(2));
  const senha = gerarSenhaTemporaria();
  const novo: NovoAdministrador = { ...pedido, hashSenha: await criarCofreArgon2().resumir(senha) };
  const situacao = await criarAdministradorPorUrl(urlDeMigracao(process.env), novo);
  if (situacao === 'ja_existe') {
    console.log(`Já existe um administrador com o e-mail ${pedido.email}. Nada foi alterado.`);
    return;
  }
  console.log(`Administrador criado: ${pedido.email} (${pedido.papel}).`);
  console.log(`Senha temporária (aparece só agora): ${senha}`);
  console.log('No primeiro acesso, o admin troca a senha e cadastra o segundo fator (TOTP).');
}

if (import.meta.main) {
  await executar();
}
