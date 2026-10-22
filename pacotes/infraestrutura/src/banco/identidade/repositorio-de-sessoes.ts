import type { PapelNoRestaurante, RepositorioDeSessoes, SessaoGuardada } from '@cardapio/aplicacao';
import type { NivelDaSessao, Publico } from '@cardapio/dominio';
import { sql } from 'drizzle-orm';
import type { AcessoAoBanco } from '../banco.ts';

interface LinhaDeSessao extends Record<string, unknown> {
  readonly sessao_id: string;
  readonly publico: Publico;
  readonly titular_id: string;
  readonly nivel: NivelDaSessao;
  readonly restaurante_id: string | null;
  readonly papel: PapelNoRestaurante | null;
  readonly criada_em: string;
  readonly ultimo_uso_em: string;
  readonly expira_em: string;
}

function paraSessao(linha: LinhaDeSessao): SessaoGuardada {
  return {
    sessaoId: linha.sessao_id,
    publico: linha.publico,
    titularId: linha.titular_id,
    nivel: linha.nivel,
    restauranteId: linha.restaurante_id,
    papel: linha.papel,
    criadaEm: new Date(linha.criada_em),
    ultimoUsoEm: new Date(linha.ultimo_uso_em),
    expiraEm: new Date(linha.expira_em),
  };
}

export function criarRepositorioDeSessoes(banco: AcessoAoBanco): RepositorioDeSessoes {
  return {
    criar: (sessao) =>
      banco.semRestaurante('CriarSessao', async (transacao) => {
        const resultado = await transacao.execute<{ criada: boolean }>(
          sql`SELECT app.criar_sessao(${sessao.hashId}, ${sessao.publico}, ${sessao.titularId}, ${sessao.restauranteId}::uuid, ${sessao.nivel}, ${sessao.agora}, ${sessao.expiraEm}) AS criada`,
        );
        return resultado.rows[0]?.criada === true;
      }),
    buscar: (hashId) =>
      banco.semRestaurante('RenovarSessao', async (transacao) => {
        const resultado = await transacao.execute<LinhaDeSessao>(
          sql`SELECT * FROM app.buscar_sessao(${hashId})`,
        );
        const linha = resultado.rows[0];
        return linha === undefined ? null : paraSessao(linha);
      }),
    renovar: (hashId, agora) =>
      banco.semRestaurante('RenovarSessao', async (transacao) => {
        await transacao.execute(sql`SELECT app.renovar_sessao(${hashId}, ${agora})`);
      }),
    revogar: (hashId, agora) =>
      banco.semRestaurante('Sair', async (transacao) => {
        await transacao.execute(sql`SELECT app.revogar_sessao(${hashId}, ${agora})`);
      }),
    definirRestaurante: (hashId, restauranteId) =>
      banco.semRestaurante('CriarRestaurante', async (transacao) => {
        const resultado = await transacao.execute<{ definido: boolean }>(
          sql`SELECT app.definir_restaurante_da_sessao(${hashId}, ${restauranteId}) AS definido`,
        );
        return resultado.rows[0]?.definido === true;
      }),
  };
}
