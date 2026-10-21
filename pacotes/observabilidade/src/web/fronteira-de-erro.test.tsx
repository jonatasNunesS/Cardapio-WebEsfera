import { cleanup, render, screen } from '@testing-library/react';
import * as Sentry from '@sentry/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { criarTransporteFalso, DSN_DE_TESTE } from '../teste/index.ts';
import { FronteiraDeErro, type PropriedadesTelaDeErro } from './fronteira-de-erro.tsx';
import { iniciarSentryWeb } from './sentry-web.ts';

const transporte = criarTransporteFalso();

function TelaFalsa({ idRastreio }: PropriedadesTelaDeErro) {
  return <p role="alert">Rastreio {idRastreio}</p>;
}

function ComponenteQueQuebra(): never {
  throw new Error('falha ao renderizar o cardápio');
}

beforeAll(() => {
  iniciarSentryWeb({
    app: 'cardapio',
    dsn: DSN_DE_TESTE,
    release: 'cardapio@0.0.0+abc1234',
    ambiente: 'local',
    transporte: transporte.fabrica,
  });
  vi.spyOn(globalThis.console, 'error').mockImplementation(() => undefined);
});

afterEach(cleanup);

afterAll(async () => {
  vi.restoreAllMocks();
  await Sentry.close();
});

describe('FronteiraDeErro', () => {
  it('mostra a tela de erro com o id de rastreio e reporta uma vez', async () => {
    render(
      <FronteiraDeErro TelaDeErro={TelaFalsa}>
        <ComponenteQueQuebra />
      </FronteiraDeErro>,
    );
    await Sentry.flush(1000);

    expect(transporte.eventos).toHaveLength(1);
    const idRastreio = transporte.eventos[0]?.tags?.id_rastreio ?? '';
    expect(idRastreio).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    expect(screen.getByRole('alert').textContent).toBe(`Rastreio ${idRastreio}`);
    expect(screen.getByRole('alert').textContent).not.toContain(
      transporte.eventos[0]?.event_id ?? 'sem-evento',
    );
    expect(transporte.eventos[0]?.tags?.app).toBe('cardapio');
  });

  it('mostra o conteúdo quando nada quebra', () => {
    render(
      <FronteiraDeErro TelaDeErro={TelaFalsa}>
        <p>Cardápio</p>
      </FronteiraDeErro>,
    );

    expect(screen.getByText('Cardápio')).toBeTruthy();
  });
});
