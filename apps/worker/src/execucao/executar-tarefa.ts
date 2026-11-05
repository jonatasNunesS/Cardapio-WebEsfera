import {
  contextoAtual,
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

const nadaPublicado = (resultado: unknown) =>
  typeof resultado === 'object' &&
  resultado !== null &&
  'publicados' in resultado &&
  'falhas' in resultado &&
  resultado.publicados === 0 &&
  resultado.falhas === 0;

// Tarefas que rodam a cada segundo só escrevem em info quando fazem algo: docs/adr/0009-filas-e-outbox.md
const OCIOSA_EM_DEBUG: Readonly<Record<string, (resultado: unknown) => boolean>> = {
  'caixa-saida.publicar-caixa-saida': nadaPublicado,
};

function reportarFalhaDefinitiva(erro: unknown, nome: string, job: JobEmExecucao | undefined): void {
  const contexto = contextoAtual();
  if (job === undefined || contexto === undefined) {
    reportarErro(erro, { tarefa: nome });
    return;
  }
  executarComContexto({ ...contexto, job: { ...job, falhaDefinitiva: true } }, () =>
    reportarErro(erro, { tarefa: nome }),
  );
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
    const ociosa = OCIOSA_EM_DEBUG[nome];
    (ociosa === undefined ? logger.info : logger.debug).call(logger, { tarefa: nome }, 'tarefa iniciada');
    try {
      const resultado = await executar(dados);
      const nivel = ociosa?.(resultado) === true ? logger.debug : logger.info;
      nivel.call(
        logger,
        { tarefa: nome, duracaoMs: Math.round(performance.now() - inicio) },
        'tarefa concluída',
      );
      return resultado;
    } catch (erro) {
      if (!deveReportar(opcoes.reportarFalha, erro)) {
        logger.warn({ tarefa: nome, tentativa: opcoes.job?.tentativa }, 'tarefa falhou; vai tentar de novo');
      } else {
        reportarFalhaDefinitiva(erro, nome, opcoes.job);
      }
      throw erro;
    }
  });
}
