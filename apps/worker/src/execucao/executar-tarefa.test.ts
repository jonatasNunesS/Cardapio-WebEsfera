import { CODIGOS, ErroAplicacao } from '@cardapio/aplicacao';
import {
  aguardarEnvio,
  criarLogger,
  definirLoggerPadrao,
  iniciarSentryNode,
} from '@cardapio/observabilidade/node';
import { criarTransporteFalso, DSN_DE_TESTE } from '@cardapio/observabilidade/teste';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { executarTarefa } from './executar-tarefa.ts';

const transporte = criarTransporteFalso();
const RESTAURANTE_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

beforeAll(() => {
  definirLoggerPadrao(criarLogger({ app: 'worker', nivel: 'silent' }));
  iniciarSentryNode({
    app: 'worker',
    dsn: DSN_DE_TESTE,
    release: 'worker@0.0.0+teste',
    ambiente: 'local',
    transporte: transporte.fabrica,
  });
});

beforeEach(() => {
  transporte.eventos.length = 0;
});

describe('executarTarefa', () => {
  it('reporta com a tag tarefa e relança o erro', async () => {
    const erro = new ErroAplicacao(CODIGOS.DEPURACAO_ERRO_PROVOCADO, 'falhou', { modulo: 'notificacoes' });

    await expect(
      executarTarefa('notificacoes.enviar', { restauranteId: RESTAURANTE_ID }, () => Promise.reject(erro)),
    ).rejects.toBe(erro);
    await aguardarEnvio(1000);

    expect(transporte.eventos).toHaveLength(1);
    expect(transporte.eventos[0]?.tags).toMatchObject({
      app: 'worker',
      tarefa: 'notificacoes.enviar',
      restaurante_id: RESTAURANTE_ID,
    });
  });

  it('não reporta no sucesso e devolve o resultado', async () => {
    const resultado = await executarTarefa('rotinas.limpar', {}, () => Promise.resolve(7));
    await aguardarEnvio(1000);

    expect(resultado).toBe(7);
    expect(transporte.eventos).toHaveLength(0);
  });

  it('com o job, as tags levam fila, job e tentativa', async () => {
    const erro = new ErroAplicacao(CODIGOS.DEPURACAO_ERRO_PROVOCADO, 'falhou', { modulo: 'rotinas' });
    const job = { fila: 'rotinas', id: 'expirar-sessoes-mesa-1', tentativa: 3 };

    await expect(
      executarTarefa('rotinas.expirar', { restauranteId: RESTAURANTE_ID }, () => Promise.reject(erro), {
        job,
      }),
    ).rejects.toBe(erro);
    await aguardarEnvio(1000);

    expect(transporte.eventos[0]?.tags).toMatchObject({
      fila: 'rotinas',
      job_id: 'expirar-sessoes-mesa-1',
      tentativa: '3',
      falha_definitiva: 'sim',
      restaurante_id: RESTAURANTE_ID,
    });
  });

  it('tentativa que ainda vai se repetir não vai ao Sentry, mas o erro sobe', async () => {
    const erro = new Error('instável');
    await expect(
      executarTarefa('rotinas.expirar', {}, () => Promise.reject(erro), { reportarFalha: false }),
    ).rejects.toBe(erro);
    await aguardarEnvio(1000);

    expect(transporte.eventos).toHaveLength(0);
  });

  it('o predicado decide pelo erro se a falha vai ao Sentry', async () => {
    const definitiva = new Error('definitiva');
    const transitoria = new Error('transitória');
    const reportarFalha = (erro: unknown) => erro === definitiva;

    await expect(
      executarTarefa('rotinas.expirar', {}, () => Promise.reject(transitoria), { reportarFalha }),
    ).rejects.toBe(transitoria);
    await expect(
      executarTarefa('rotinas.expirar', {}, () => Promise.reject(definitiva), { reportarFalha }),
    ).rejects.toBe(definitiva);
    await aguardarEnvio(1000);

    expect(transporte.eventos).toHaveLength(1);
  });
});
