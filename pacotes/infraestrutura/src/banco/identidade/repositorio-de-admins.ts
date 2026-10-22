import type { RepositorioDeAdmins } from '@cardapio/aplicacao';
import { sql } from 'drizzle-orm';
import type { AcessoAoBanco } from '../banco.ts';

interface LinhaDeAdmin extends Record<string, unknown> {
  readonly administrador_id: string;
  readonly hash_senha: string;
  readonly troca_de_senha_obrigatoria: boolean;
  readonly segundo_fator_cadastrado: boolean;
}

interface LinhaDeSegundoFator extends Record<string, unknown> {
  readonly segredo_cifrado: string | null;
  readonly segredo_pendente_cifrado: string | null;
  readonly ultimo_passo: string;
}

async function booleano(
  banco: AcessoAoBanco,
  casoDeUso: string,
  consulta: ReturnType<typeof sql>,
): Promise<boolean> {
  return banco.semRestaurante(casoDeUso, async (transacao) => {
    const resultado = await transacao.execute<{ resultado: boolean }>(consulta);
    return resultado.rows[0]?.resultado === true;
  });
}

export function criarRepositorioDeAdmins(banco: AcessoAoBanco): RepositorioDeAdmins {
  return {
    buscar: (email) =>
      banco.semRestaurante('EntrarComoAdmin', async (transacao) => {
        const linha = (await transacao.execute<LinhaDeAdmin>(sql`SELECT * FROM app.buscar_admin(${email})`))
          .rows[0];
        return linha === undefined
          ? null
          : {
              administradorId: linha.administrador_id,
              hashSenha: linha.hash_senha,
              trocaDeSenhaObrigatoria: linha.troca_de_senha_obrigatoria,
              segundoFatorCadastrado: linha.segundo_fator_cadastrado,
            };
      }),
    buscarSegundoFator: (administradorId) =>
      banco.semRestaurante('ConfirmarSegundoFatorAdmin', async (transacao) => {
        const linha = (
          await transacao.execute<LinhaDeSegundoFator>(
            sql`SELECT * FROM app.buscar_segundo_fator_admin(${administradorId})`,
          )
        ).rows[0];
        return linha === undefined
          ? null
          : {
              segredoCifrado: linha.segredo_cifrado,
              segredoPendenteCifrado: linha.segredo_pendente_cifrado,
              ultimoPasso: Number(linha.ultimo_passo),
            };
      }),
    iniciarCadastroDoSegundoFator: (administradorId, segredoPendenteCifrado) =>
      booleano(
        banco,
        'CadastrarSegundoFatorAdmin',
        sql`SELECT app.iniciar_cadastro_segundo_fator(${administradorId}, ${segredoPendenteCifrado}) AS resultado`,
      ),
    concluirCadastroDoSegundoFator: (conclusao) =>
      booleano(
        banco,
        'CadastrarSegundoFatorAdmin',
        sql`SELECT app.concluir_cadastro_segundo_fator(${conclusao.administradorId}, ${conclusao.passo}, ${conclusao.hashSenha}, ${sql.param([...conclusao.hashesDeRecuperacao])}::text[], ${conclusao.agora}) AS resultado`,
      ),
    usarPasso: (administradorId, passo) =>
      booleano(
        banco,
        'ConfirmarSegundoFatorAdmin',
        sql`SELECT app.usar_passo_totp(${administradorId}, ${passo}) AS resultado`,
      ),
    usarCodigoDeRecuperacao: (administradorId, hashCodigo, agora) =>
      booleano(
        banco,
        'ConfirmarSegundoFatorAdmin',
        sql`SELECT app.usar_codigo_recuperacao(${administradorId}, ${hashCodigo}, ${agora}) AS resultado`,
      ),
  };
}
