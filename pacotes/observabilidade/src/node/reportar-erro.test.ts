import { Writable } from 'node:stream';
import { CODIGOS, ErroAplicacao, ErroDependenciaExterna, ErroIsolamentoInquilino } from '@cardapio/aplicacao';
import * as Sentry from '@sentry/node';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarTransporteFalso, DSN_DE_TESTE } from '../teste/index.ts';
import { executarComContexto } from '../contexto.ts';
import { criarLogger, definirLoggerPadrao } from './logger.ts';
import { reportarErro } from './reportar-erro.ts';
import { iniciarSentryNode } from './sentry.ts';

const RESTAURANTE_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const transporte = criarTransporteFalso();
const linhasDoLog: string[] = [];

const contexto = {
  idRastreio: '0190a1b2-0000-7000-8000-00000000abcd',
  app: 'worker',
  tarefa: 'pagamentos.processar',
};

function erroDeDependencia() {
  return new ErroDependenciaExterna(
    'PAGAMENTO_CONSULTA_FALHOU',
    'Mercado Pago não respondeu',
    {
      modulo: 'assinaturas',
      casoDeUso: 'ConfirmarPagamentoAssinatura',
      restauranteId: RESTAURANTE_ID,
      entidade: 'assinatura',
      entidadeId: '0190a1b2-0000-7000-8000-000000000099',
      dados: { situacao: 'ativa', email: 'dono@restaurante.com' },
    },
    {
      provedor: 'mercadopago',
      operacao: 'GET /authorized_payments/{id}',
      statusHttp: 503,
      tentativa: 3,
      tentativasMaximas: 5,
      duracaoMs: 2140,
    },
  );
}

beforeAll(() => {
  definirLoggerPadrao(
    criarLogger({
      app: 'teste',
      destino: new Writable({
        write(pedaco: Buffer, _codificacao, concluir) {
          linhasDoLog.push(pedaco.toString());
          concluir();
        },
      }),
    }),
  );
});

describe('reportarErro sem DSN', () => {
  it('só registra no log e devolve o id do contexto', () => {
    const id = executarComContexto(contexto, () => reportarErro(erroDeDependencia()));

    expect(Sentry.isInitialized()).toBe(false);
    expect(id).toBe(contexto.idRastreio);
    expect(linhasDoLog.join('')).toContain('PAGAMENTO_CONSULTA_FALHOU');
    expect(linhasDoLog.join('')).not.toContain('dono@restaurante.com');
  });
});

describe('reportarErro com Sentry', () => {
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
    transporte.eventos.length = 0;
  });

  afterAll(async () => {
    await Sentry.close();
  });

  it('envia tags, contextos, fingerprint e título no formato definido', async () => {
    const id = executarComContexto(contexto, () => reportarErro(erroDeDependencia()));
    await Sentry.flush(1000);

    expect(transporte.eventos).toHaveLength(1);
    const [evento] = transporte.eventos;
    expect(evento?.event_id).toBe(id);
    expect(evento?.level).toBe('error');
    expect(evento?.tags).toMatchObject({
      app: 'worker',
      modulo: 'assinaturas',
      caso_de_uso: 'ConfirmarPagamentoAssinatura',
      restaurante_id: RESTAURANTE_ID,
      tarefa: 'pagamentos.processar',
      codigo: 'PAGAMENTO_CONSULTA_FALHOU',
    });
    expect(evento?.fingerprint).toEqual(['PAGAMENTO_CONSULTA_FALHOU', 'assinaturas']);
    expect(evento?.contexts?.negocio).toEqual({
      entidade: 'assinatura',
      entidade_id: '0190a1b2-0000-7000-8000-000000000099',
      dados: { situacao: 'ativa', email: '[oculto]' },
    });
    expect(evento?.contexts?.dependencia).toMatchObject({
      provedor: 'mercadopago',
      statusHttp: 503,
      tentativa: 3,
    });
    const principal = evento?.exception?.values?.at(-1);
    expect(`${principal?.type ?? ''}: ${principal?.value ?? ''}`).toBe(
      'ErroDependenciaExterna: PAGAMENTO_CONSULTA_FALHOU - Mercado Pago não respondeu',
    );
  });

  it('usa nível fatal para violação de isolamento', async () => {
    reportarErro(
      new ErroIsolamentoInquilino('ISOLAMENTO_LEITURA_CRUZADA', 'Leu outro restaurante', {
        modulo: 'pedidos',
      }),
    );
    await Sentry.flush(1000);

    expect(transporte.eventos[0]?.level).toBe('fatal');
  });

  it('classifica erro sem tipo com o código de falha não tipada', async () => {
    reportarErro(new TypeError('x is undefined'));
    await Sentry.flush(1000);

    expect(transporte.eventos[0]?.tags?.codigo).toBe(CODIGOS.SISTEMA_FALHA_NAO_TIPADA);
    expect(transporte.eventos[0]?.fingerprint).toEqual([CODIGOS.SISTEMA_FALHA_NAO_TIPADA, 'desconhecido']);
  });

  it('mantém o nome da subclasse no título', async () => {
    reportarErro(new ErroAplicacao('DEPURACAO_ERRO_PROVOCADO', 'teste', { modulo: 'depuracao' }));
    await Sentry.flush(1000);

    expect(transporte.eventos[0]?.exception?.values?.at(-1)?.type).toBe('ErroAplicacao');
  });
});
