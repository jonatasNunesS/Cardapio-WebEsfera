import {
  CODIGOS,
  ErroEstadoInconsistente,
  type SessaoDeMesaAberta,
  type SessoesDeMesa,
} from '@cardapio/aplicacao';
import { sql } from 'drizzle-orm';
import type { AcessoAoBanco, Transacao } from '../banco.ts';

interface LinhaDeSessao extends Record<string, unknown> {
  readonly id: string;
  readonly expira_em: Date | string;
}

function paraSessao(linha: LinhaDeSessao): SessaoDeMesaAberta {
  return { sessaoId: linha.id, expiraEm: new Date(linha.expira_em) };
}

async function sessaoAberta(transacao: Transacao, mesaId: string) {
  const { rows } = await transacao.execute<LinhaDeSessao>(
    sql`SELECT id, expira_em FROM sessoes_mesa WHERE mesa_id = ${mesaId} AND fechada_em IS NULL FOR UPDATE`,
  );
  return rows[0];
}

export function criarSessoesDeMesa(banco: AcessoAoBanco): SessoesDeMesa {
  return {
    abrirOuReusar: (restauranteId, mesaId, agora, expiraEm) =>
      banco.comRestaurante(restauranteId, async (transacao) => {
        await transacao.execute(sql`SELECT 1 FROM mesas WHERE id = ${mesaId} FOR UPDATE`);
        const aberta = await sessaoAberta(transacao, mesaId);
        if (aberta !== undefined && new Date(aberta.expira_em) > agora) {
          return paraSessao(aberta);
        }
        if (aberta !== undefined) {
          await transacao.execute(
            sql`UPDATE sessoes_mesa SET fechada_em = ${agora.toISOString()}::timestamptz WHERE id = ${aberta.id}`,
          );
        }
        const { rows } = await transacao.execute<LinhaDeSessao>(sql`
          INSERT INTO sessoes_mesa (restaurante_id, mesa_id, aberta_em, expira_em)
          VALUES (app.restaurante_atual(), ${mesaId}, ${agora.toISOString()}::timestamptz,
                  ${expiraEm.toISOString()}::timestamptz)
          RETURNING id, expira_em`);
        const [criada] = rows;
        if (criada === undefined) {
          throw new ErroEstadoInconsistente(
            CODIGOS.BANCO_CONSULTA_FALHOU,
            'A sessão de mesa não voltou do INSERT',
            {
              modulo: 'mesas',
              casoDeUso: 'abrirSessaoDeMesa',
              restauranteId,
            },
          );
        }
        return paraSessao(criada);
      }),
  };
}
