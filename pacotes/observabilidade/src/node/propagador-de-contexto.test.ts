import { CODIGOS, ErroAplicacao } from '@cardapio/aplicacao';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarTransporteFalso, DSN_DE_TESTE } from '../teste/index.ts';
import { contextoAtual, executarComContexto } from '../contexto.ts';
import { aguardarEnvio, iniciarSentryNode } from './sentry.ts';
import { criarLogger, definirLoggerPadrao } from './logger.ts';
import { propagadorDeContexto } from './propagador-de-contexto.ts';
import { reportarErro } from './reportar-erro.ts';

const RESTAURANTE_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const CONTEXTO = {
  idRastreio: '0190a1b2-0000-7000-8000-00000000abcd',
  app: 'worker',
  tarefa: 'caixa.publicar',
};
const transporte = criarTransporteFalso();

beforeAll(() => {
  definirLoggerPadrao(criarLogger({ app: 'teste', nivel: 'silent' }));
  iniciarSentryNode({
    app: 'worker',
    dsn: DSN_DE_TESTE,
    release: 'worker@0.0.0+teste',
    ambiente: 'local',
    transporte: transporte.fabrica,
  });
});

describe('propagadorDeContexto', () => {
  it('comRestaurante acrescenta o restaurante e mantém o id de rastreio', () => {
    const dentro = executarComContexto(CONTEXTO, () =>
      propagadorDeContexto.comRestaurante(RESTAURANTE_ID, () => contextoAtual()),
    );
    expect(dentro).toEqual({ ...CONTEXTO, restauranteId: RESTAURANTE_ID });
  });

  it('comRestaurante fora de contexto cria um com id de rastreio novo', () => {
    const dentro = propagadorDeContexto.comRestaurante(RESTAURANTE_ID, () => contextoAtual());
    expect(dentro?.restauranteId).toBe(RESTAURANTE_ID);
    expect(dentro?.idRastreio).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });

  it('comSistema marca o escopo e o erro vai ao Sentry com a tag contexto=sistema', async () => {
    executarComContexto(CONTEXTO, () =>
      propagadorDeContexto.comSistema(() =>
        reportarErro(new ErroAplicacao(CODIGOS.BANCO_CONSULTA_FALHOU, 'falhou', { modulo: 'banco' })),
      ),
    );
    await aguardarEnvio(1000);

    expect(transporte.eventos[0]?.tags).toMatchObject({
      contexto: 'sistema',
      id_rastreio: CONTEXTO.idRastreio,
    });
    expect(transporte.eventos[0]?.tags?.restaurante_id).toBeUndefined();
  });
});
