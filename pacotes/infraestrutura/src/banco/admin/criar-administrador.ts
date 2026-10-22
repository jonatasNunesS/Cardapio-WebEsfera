import { Client } from 'pg';

export type PapelDeAdministrador = 'suporte' | 'financeiro' | 'dono_plataforma';

export interface NovoAdministrador {
  readonly nome: string;
  readonly email: string;
  readonly papel: PapelDeAdministrador;
  readonly hashSenha: string;
}

export async function criarAdministradorPorUrl(
  url: string,
  novo: NovoAdministrador,
): Promise<'criado' | 'ja_existe'> {
  const cliente = new Client({ connectionString: url, application_name: 'cardapio-admin-criar' });
  await cliente.connect();
  try {
    await cliente.query('SET ROLE cardapio_dono');
    const { rowCount } = await cliente.query(
      `INSERT INTO public.administradores (nome, email, hash_senha, papel, troca_de_senha_obrigatoria)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (email) DO NOTHING`,
      [novo.nome, novo.email, novo.hashSenha, novo.papel],
    );
    return rowCount === 1 ? 'criado' : 'ja_existe';
  } finally {
    await cliente.end();
  }
}
