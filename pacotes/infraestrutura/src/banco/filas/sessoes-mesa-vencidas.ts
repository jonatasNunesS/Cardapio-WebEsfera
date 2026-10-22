import type { SessoesMesaVencidas } from '@cardapio/aplicacao';
import { sql } from 'drizzle-orm';
import type { AcessoAoBanco } from '../banco.ts';

interface LinhaVencida extends Record<string, unknown> {
  readonly restaurante_id: string;
  readonly id: string;
}

export function criarSessoesMesaVencidas(banco: AcessoAoBanco): SessoesMesaVencidas {
  return {
    listar: (agora, limite) =>
      banco.comSistema(async (transacao) => {
        const { rows } = await transacao.execute<LinhaVencida>(sql`
          SELECT restaurante_id, id FROM sessoes_mesa
          WHERE fechada_em IS NULL AND expira_em <= ${agora.toISOString()}::timestamptz
          ORDER BY expira_em, id
          LIMIT ${limite}`);
        return rows.map((linha) => ({ restauranteId: linha.restaurante_id, sessaoMesaId: linha.id }));
      }),
    fechar: (restauranteId, sessoesMesaIds, agora) =>
      banco.comRestaurante(restauranteId, async (transacao) => {
        const resultado = await transacao.execute(sql`
          WITH fechadas AS (
            UPDATE sessoes_mesa SET fechada_em = ${agora.toISOString()}::timestamptz
            WHERE restaurante_id = ${restauranteId}
              AND id = ANY(${sql.param([...sessoesMesaIds])}::uuid[])
              AND fechada_em IS NULL
              AND expira_em <= ${agora.toISOString()}::timestamptz
            RETURNING restaurante_id, id, mesa_id
          )
          INSERT INTO caixa_saida (restaurante_id, tipo_evento, carga)
          SELECT restaurante_id, 'SessaoMesaExpirada',
            jsonb_build_object('versao', 1, 'sessaoMesaId', id, 'mesaId', mesa_id)
          FROM fechadas`);
        return resultado.rowCount ?? 0;
      }),
  };
}
