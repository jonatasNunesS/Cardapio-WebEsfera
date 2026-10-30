import type { EventosDePagamento, RegistroDeAvisos, RestaurantesParaCobranca } from '@cardapio/aplicacao';
import { sql } from 'drizzle-orm';
import type { AcessoAoBanco } from '../banco.ts';

export function criarRegistroDeAvisos(banco: AcessoAoBanco): RegistroDeAvisos {
  return {
    registrar: (aviso) =>
      banco.semRestaurante('registrarAvisoDePagamento', async (transacao) => {
        const { rows } = await transacao.execute<{ evento_id: string; processado: boolean }>(
          sql`SELECT evento_id, processado FROM app.registrar_evento_pagamento(${aviso.xRequestId}, ${aviso.topico}, ${aviso.recursoId})`,
        );
        const [linha] = rows;
        return { eventoId: linha?.evento_id ?? '', processado: linha?.processado ?? false };
      }),
  };
}

export function criarEventosDePagamento(banco: AcessoAoBanco): EventosDePagamento {
  return {
    iniciar: (eventoId, agora) =>
      banco.comSistema(async (transacao) => {
        const { rows } = await transacao.execute<{ topico: string; recurso_id: string }>(sql`
          UPDATE eventos_pagamento
             SET em_processamento_em = ${agora.toISOString()}::timestamptz, tentativas = tentativas + 1
           WHERE id = ${eventoId} AND processado_em IS NULL
          RETURNING topico, recurso_id`);
        const [linha] = rows;
        return linha === undefined ? null : { topico: linha.topico, recursoId: linha.recurso_id };
      }),
    concluir: (eventoId, agora) =>
      banco.comSistema(async (transacao) => {
        await transacao.execute(sql`
          UPDATE eventos_pagamento SET processado_em = ${agora.toISOString()}::timestamptz, ultimo_erro_codigo = NULL
           WHERE id = ${eventoId} AND processado_em IS NULL`);
      }),
    registrarFalha: (eventoId, codigo) =>
      banco.comSistema(async (transacao) => {
        await transacao.execute(sql`
          UPDATE eventos_pagamento SET ultimo_erro_codigo = ${codigo} WHERE id = ${eventoId}`);
      }),
    listarPendentes: (recebidosAntesDe, limite) =>
      banco.comSistema(async (transacao) => {
        const { rows } = await transacao.execute<{ id: string }>(sql`
          SELECT id FROM eventos_pagamento
           WHERE processado_em IS NULL AND recebido_em < ${recebidosAntesDe.toISOString()}::timestamptz
           ORDER BY recebido_em LIMIT ${limite}`);
        return rows.map((linha) => linha.id);
      }),
  };
}

export function criarRestaurantesParaCobranca(banco: AcessoAoBanco): RestaurantesParaCobranca {
  return {
    listar: (apos, limite) =>
      banco.comSistema(async (transacao) => {
        const { rows } = await transacao.execute<{ restaurante_id: string }>(
          sql`SELECT restaurante_id FROM app.listar_restaurantes_para_cobranca(${apos}::uuid, ${limite})`,
        );
        return rows.map((linha) => linha.restaurante_id);
      }),
  };
}
