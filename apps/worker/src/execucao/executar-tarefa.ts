import { executarComContexto, obterLoggerPadrao, reportarErro } from '@cardapio/observabilidade/node';
import { randomUUID } from 'node:crypto';

export type DadosDaTarefa = Readonly<Record<string, unknown>>;

function contextoDaTarefa(nome: string, dados: DadosDaTarefa) {
  const idRastreio = typeof dados.idRastreio === 'string' ? dados.idRastreio : randomUUID();
  const base = { idRastreio, app: 'worker', tarefa: nome };
  return typeof dados.restauranteId === 'string' ? { ...base, restauranteId: dados.restauranteId } : base;
}

export async function executarTarefa<T>(
  nome: string,
  dados: DadosDaTarefa,
  executar: (dados: DadosDaTarefa) => Promise<T>,
): Promise<T> {
  return executarComContexto(contextoDaTarefa(nome, dados), async () => {
    const logger = obterLoggerPadrao();
    const inicio = performance.now();
    logger.info({ tarefa: nome }, 'tarefa iniciada');
    try {
      const resultado = await executar(dados);
      logger.info({ tarefa: nome, duracaoMs: Math.round(performance.now() - inicio) }, 'tarefa concluída');
      return resultado;
    } catch (erro) {
      reportarErro(erro, { tarefa: nome });
      throw erro;
    }
  });
}
