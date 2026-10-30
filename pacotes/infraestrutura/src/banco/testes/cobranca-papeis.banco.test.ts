import { ErroIsolamentoInquilino } from '@cardapio/aplicacao';
import { sql } from 'drizzle-orm';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AcessoAoBanco } from '../banco.ts';
import { criarRegistroDeAvisos } from '../cobranca/eventos-de-pagamento.ts';
import { abrirBanco, consultarComoAdmin } from './apoio.ts';

let api: AcessoAoBanco;
let worker: AcessoAoBanco;

beforeAll(() => {
  api = abrirBanco('api');
  worker = abrirBanco('worker');
});

afterAll(async () => {
  await Promise.all([api.encerrar(), worker.encerrar()]);
});

async function aviso(recursoId: string) {
  const registrado = await criarRegistroDeAvisos(api).registrar({
    xRequestId: randomUUID(),
    topico: 'subscription_preapproval',
    recursoId,
  });
  return registrado.eventoId;
}

describe('papéis em eventos_pagamento, assinaturas e cobrancas', () => {
  it('a API não lê eventos_pagamento direto: só pela função', async () => {
    await expect(
      api.semRestaurante('teste', (transacao) =>
        transacao.execute(sql`SELECT count(*) FROM eventos_pagamento`),
      ),
    ).rejects.toBeInstanceOf(ErroIsolamentoInquilino);
  });

  it('app_sistema só altera as colunas de processamento e não lê assinaturas nem cobrancas', async () => {
    const eventoId = await aviso(randomBytes(8).toString('hex'));

    await expect(
      worker.comSistema((transacao) =>
        transacao.execute(sql`UPDATE eventos_pagamento SET recurso_id = 'outro' WHERE id = ${eventoId}`),
      ),
    ).rejects.toBeInstanceOf(ErroIsolamentoInquilino);
    for (const tabela of ['assinaturas', 'cobrancas']) {
      await expect(
        worker.comSistema((transacao) =>
          transacao.execute(sql`SELECT count(*) FROM ${sql.identifier(tabela)}`),
        ),
      ).rejects.toBeInstanceOf(ErroIsolamentoInquilino);
    }
  });

  it('todo restaurante tem fim do teste preenchido (backfill e padrão de 10 dias)', async () => {
    const [linha] = await consultarComoAdmin<{ sem: number; dias: number }>(
      `SELECT count(*) FILTER (WHERE teste_termina_em IS NULL)::int AS sem,
              round(extract(epoch FROM (max(teste_termina_em - criado_em))) / 86400)::int AS dias
         FROM restaurantes WHERE criado_em > now() - interval '1 minute'`,
    );
    expect(linha).toEqual({ sem: 0, dias: 10 });
  });
});
