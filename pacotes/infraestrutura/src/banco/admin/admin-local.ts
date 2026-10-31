import { Client } from 'pg';

export interface AdminLocal {
  readonly email: string;
  readonly hashSenha: string;
  readonly segredoTotpCifrado: string;
}

// Só a semente local usa: grava o admin já com o segundo fator, sem o primeiro acesso.
export async function gravarAdminLocalPorUrl(url: string, admin: AdminLocal): Promise<void> {
  const cliente = new Client({ connectionString: url, application_name: 'cardapio-semear-local' });
  await cliente.connect();
  try {
    await cliente.query('SET ROLE cardapio_dono');
    await cliente.query(
      `INSERT INTO public.administradores
         (nome, email, hash_senha, papel, troca_de_senha_obrigatoria, segredo_totp_cifrado, ativo)
       VALUES ('Admin local', $1, $2, 'dono_plataforma', false, $3, true)
       ON CONFLICT (email) DO UPDATE SET hash_senha = EXCLUDED.hash_senha,
         segredo_totp_cifrado = EXCLUDED.segredo_totp_cifrado, troca_de_senha_obrigatoria = false,
         ativo = true, ultimo_passo_totp = 0`,
      [admin.email, admin.hashSenha, admin.segredoTotpCifrado],
    );
  } finally {
    await cliente.end();
  }
}
