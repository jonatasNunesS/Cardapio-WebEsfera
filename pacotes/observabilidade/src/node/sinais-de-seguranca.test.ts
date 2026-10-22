import { Writable } from 'node:stream';
import * as Sentry from '@sentry/node';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarTransporteFalso, DSN_DE_TESTE } from '../teste/index.ts';
import { criarLogger } from './logger.ts';
import { iniciarSentryNode } from './sentry.ts';
import { criarSinaisDeSeguranca } from './sinais-de-seguranca.ts';

const transporte = criarTransporteFalso();
const linhas: string[] = [];
const sinais = criarSinaisDeSeguranca(
  criarLogger({
    app: 'teste',
    destino: new Writable({
      write(pedaco: Buffer, _codificacao, concluir) {
        linhas.push(pedaco.toString());
        concluir();
      },
    }),
  }),
);

beforeAll(() => {
  iniciarSentryNode({
    dsn: DSN_DE_TESTE,
    ambiente: 'local',
    release: 'teste',
    app: 'api',
    transporte: transporte.fabrica,
  });
});

describe('sinais de segurança', () => {
  it('cada falha marca o span da requisição e gera log, sem evento no Sentry', async () => {
    let atributos: Record<string, unknown> = {};
    Sentry.startSpan({ name: 'POST /api/v1/sessao' }, (span) => {
      sinais.falhou('painel', 'senha');
      atributos = Sentry.spanToJSON(span).attributes;
    });
    await Sentry.flush(500);

    expect(atributos).toMatchObject({ 'autenticacao.falha': 'senha', 'autenticacao.publico': 'painel' });
    expect(transporte.eventos).toEqual([]);
    expect(JSON.parse(linhas.at(-1) ?? '{}')).toMatchObject({
      evento: 'autenticacao_falhou',
      publico: 'painel',
    });
  });

  it('o início de um bloqueio vira um aviso no Sentry com o código do alerta, sem dado pessoal', async () => {
    sinais.bloqueou('admin', 'segundo_fator', 'segundo_fator');
    await Sentry.flush(500);

    const [evento] = transporte.eventos;
    expect(evento?.level).toBe('warning');
    expect(evento?.tags).toMatchObject({ codigo: 'AUTENTICACAO_SEGUNDO_FATOR_BLOQUEADO', publico: 'admin' });
    expect(Object.values(evento?.tags ?? {}).join(' ')).not.toMatch(/@|\d+\.\d+\.\d+\.\d+/);
  });
});
