import {
  ehIdRastreioValido,
  executarComContexto,
  gerarIdRastreio,
  obterLoggerPadrao,
  reportarErro,
} from '@cardapio/observabilidade/node';

export type DadosDaTarefa = Readonly<Record<string, unknown>>;

function contextoDaTarefa(nome: string, dados: DadosDaTarefa) {
  const idRastreio = ehIdRastreioValido(dados.idRastreio) ? dados.idRastreio : gerarIdRastreio();
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
