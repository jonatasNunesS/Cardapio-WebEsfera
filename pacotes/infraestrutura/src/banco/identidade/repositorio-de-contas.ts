import type { PapelNoRestaurante, RepositorioDeContas } from '@cardapio/aplicacao';
import { sql } from 'drizzle-orm';
import type { AcessoAoBanco } from '../banco.ts';

interface LinhaDeCredenciais extends Record<string, unknown> {
  readonly usuario_id: string;
  readonly hash_senha: string;
}

interface LinhaDeVinculo extends Record<string, unknown> {
  readonly restaurante_id: string;
  readonly papel: PapelNoRestaurante;
}

export function criarRepositorioDeContas(banco: AcessoAoBanco): RepositorioDeContas {
  return {
    criarUsuario: (nome, email, hashSenha) =>
      banco.semRestaurante('CriarConta', async (transacao) => {
        const resultado = await transacao.execute<{ id: string | null }>(
          sql`SELECT app.criar_usuario(${nome}, ${email}, ${hashSenha}) AS id`,
        );
        return resultado.rows[0]?.id ?? null;
      }),
    buscarCredenciais: (email) =>
      banco.semRestaurante('Entrar', async (transacao) => {
        const resultado = await transacao.execute<LinhaDeCredenciais>(
          sql`SELECT * FROM app.buscar_credenciais(${email})`,
        );
        const linha = resultado.rows[0];
        return linha === undefined ? null : { usuarioId: linha.usuario_id, hashSenha: linha.hash_senha };
      }),
    listarVinculos: (usuarioId) =>
      banco.semRestaurante('Entrar', async (transacao) => {
        const resultado = await transacao.execute<LinhaDeVinculo>(
          sql`SELECT * FROM app.listar_vinculos(${usuarioId})`,
        );
        return resultado.rows.map((linha) => ({ restauranteId: linha.restaurante_id, papel: linha.papel }));
      }),
    criarTokenDeRedefinicao: (pedido) =>
      banco.semRestaurante('RedefinirSenha', async (transacao) => {
        const resultado = await transacao.execute<{ existe: boolean }>(
          sql`SELECT app.criar_token_redefinicao(${pedido.email}, ${pedido.hashToken}, ${pedido.agora}, ${pedido.expiraEm}) AS existe`,
        );
        return resultado.rows[0]?.existe === true;
      }),
    redefinirSenha: (hashToken, hashSenha, agora) =>
      banco.semRestaurante('RedefinirSenha', async (transacao) => {
        const resultado = await transacao.execute<{ redefinida: boolean }>(
          sql`SELECT app.redefinir_senha(${hashToken}, ${hashSenha}, ${agora}) AS redefinida`,
        );
        return resultado.rows[0]?.redefinida === true;
      }),
  };
}
