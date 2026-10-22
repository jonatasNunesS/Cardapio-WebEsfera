import * as Sentry from '@sentry/node';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarTransporteFalso, DSN_DE_TESTE } from '../teste/index.ts';
import { criarPulsoDeRotina, monitorarRotina } from './monitor-de-rotina.ts';
import { aguardarEnvio, iniciarSentryNode } from './sentry.ts';

const transporte = criarTransporteFalso();
const CONFIGURACAO = { aCadaMinutos: 5, margemMinutos: 10, duracaoMaximaMinutos: 4 };

describe('monitor de rotina (Sentry Crons)', () => {
  beforeAll(() => {
    iniciarSentryNode({
      app: 'worker',
      dsn: DSN_DE_TESTE,
      release: 'worker@0.0.0+abc1234',
      ambiente: 'local',
      transporte: transporte.fabrica,
    });
  });

  beforeEach(() => {
    transporte.checkIns.length = 0;
  });

  afterAll(async () => {
    await Sentry.close();
  });

  it('a rotina manda check-in de início e de fim com o intervalo configurado', async () => {
    const resultado = await monitorarRotina('rotinas-expirar-sessoes-mesa', CONFIGURACAO, () =>
      Promise.resolve(7),
    );
    await aguardarEnvio(1000);

    expect(resultado).toBe(7);
    expect(transporte.checkIns.map((checkIn) => checkIn.status)).toEqual(['in_progress', 'ok']);
    expect(transporte.checkIns[0]).toMatchObject({
      monitor_slug: 'rotinas-expirar-sessoes-mesa',
      monitor_config: {
        schedule: { type: 'interval', value: 5, unit: 'minute' },
        checkin_margin: 10,
        max_runtime: 4,
      },
    });
  });

  it('rotina que falha manda check-in de erro e o erro sobe', async () => {
    const erro = new Error('falhou');
    await expect(monitorarRotina('rotina-que-falha', CONFIGURACAO, () => Promise.reject(erro))).rejects.toBe(
      erro,
    );
    await aguardarEnvio(1000);

    expect(transporte.checkIns.map((checkIn) => checkIn.status)).toEqual(['in_progress', 'error']);
  });

  it('o pulso manda no máximo um check-in por intervalo', async () => {
    let agora = 0;
    const pulsar = criarPulsoDeRotina('caixa-saida', { ...CONFIGURACAO, aCadaMinutos: 1 }, () => agora);

    pulsar();
    agora = 30_000;
    pulsar();
    agora = 61_000;
    pulsar();
    await aguardarEnvio(1000);

    expect(transporte.checkIns.map((checkIn) => checkIn.status)).toEqual(['ok', 'ok']);
  });
});
