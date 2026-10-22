import {
  ehIdRastreioValido,
  executarComContexto,
  gerarIdRastreio,
  obterLoggerPadrao,
  reportarErro,
  type JobEmExecucao,
} from '@cardapio/observabilidade/node';

export type DadosDaTarefa = Readonly<Record<string, unknown>>;

export interface OpcoesDaTarefa {
  readonly job?: JobEmExecucao | undefined;
  readonly reportarFalha?: boolean | ((erro: unknown) => boolean) | undefined;
}

function contextoDaTarefa(nome: string, dados: DadosDaTarefa, job: JobEmExecucao | undefined) {
  const idRastreio = ehIdRastreioValido(dados.idRastreio) ? dados.idRastreio : gerarIdRastreio();
  const base = { idRastreio, app: 'worker', tarefa: nome, ...(job === undefined ? {} : { job }) };
  return typeof dados.restauranteId === 'string' ? { ...base, restauranteId: dados.restauranteId } : base;
}

function deveReportar(reportarFalha: OpcoesDaTarefa['reportarFalha'], erro: unknown): boolean {
  return typeof reportarFalha === 'function' ? reportarFalha(erro) : reportarFalha !== false;
}

export async function executarTarefa<T>(
  nome: string,
  dados: DadosDaTarefa,
  executar: (dados: DadosDaTarefa) => Promise<T>,
  opcoes: OpcoesDaTarefa = {},
): Promise<T> {
  return executarComContexto(contextoDaTarefa(nome, dados, opcoes.job), async () => {
    const logger = obterLoggerPadrao();
    const inicio = performance.now();
    logger.info({ tarefa: nome }, 'tarefa iniciada');
    try {
      const resultado = await executar(dados);
      logger.info({ tarefa: nome, duracaoMs: Math.round(performance.now() - inicio) }, 'tarefa concluída');
      return resultado;
    } catch (erro) {
      if (!deveReportar(opcoes.reportarFalha, erro)) {
        logger.warn({ tarefa: nome, tentativa: opcoes.job?.tentativa }, 'tarefa falhou; vai tentar de novo');
      } else {
        reportarErro(erro, { tarefa: nome });
      }
      throw erro;
    }
  });
}
