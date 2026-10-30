import { describe, expect, it, vi } from 'vitest';
import { iniciarSentryDepois, type Agendar } from './tardio.ts';

const OPCOES = {
  app: 'cardapio',
  dsn: 'https://chave@sentry.exemplo/1',
  release: 'r',
  ambiente: 'local',
} as const;

function sentryFalso() {
  return {
    iniciarSentryWeb: vi.fn(() => true),
    reportarErroWeb: vi.fn(() => 'id'),
  };
}

describe('Sentry tardio', () => {
  it('não carrega o SDK antes do agendamento; carrega depois, com medição de desempenho', async () => {
    const tarefas: (() => void)[] = [];
    const agendar: Agendar = (tarefa) => tarefas.push(tarefa);
    const sentry = sentryFalso();
    const carregar = vi.fn(() => Promise.resolve(sentry));

    iniciarSentryDepois(OPCOES, agendar, carregar);
    expect(carregar).not.toHaveBeenCalled();
    tarefas.forEach((tarefa) => {
      tarefa();
    });
    await vi.waitFor(() => {
      expect(sentry.iniciarSentryWeb).toHaveBeenCalledWith({ ...OPCOES, medirDesempenho: true });
    });
  });

  it('erros antes do carregamento ficam na fila e são enviados na ordem; depois vão direto', async () => {
    const tarefas: (() => void)[] = [];
    const sentry = sentryFalso();
    const tardio = iniciarSentryDepois(
      OPCOES,
      (tarefa) => tarefas.push(tarefa),
      () => Promise.resolve(sentry),
    );
    const primeiro = new Error('um');
    const segundo = new Error('dois');

    tardio.reportar(primeiro, { rota: 'a' });
    tardio.reportar(segundo);
    tarefas.forEach((tarefa) => {
      tarefa();
    });
    await vi.waitFor(() => {
      expect(sentry.reportarErroWeb).toHaveBeenCalledTimes(2);
    });
    tardio.reportar(new Error('tres'));

    expect(sentry.reportarErroWeb.mock.calls.map((chamada) => (chamada as unknown[])[0])).toEqual([
      primeiro,
      segundo,
      expect.objectContaining({ message: 'tres' }),
    ]);
  });
});
