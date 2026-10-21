import { obterLoggerPadrao } from './logger.ts';
import { reportarErro } from './reportar-erro.ts';
import { aguardarEnvio } from './sentry.ts';

const LIMITE_ENVIO_MS = 2000;

export interface OpcoesTratadoresDeFalha {
  readonly encerrar?: (codigo: number) => void;
}

export function instalarTratadoresDeFalha(opcoes: OpcoesTratadoresDeFalha = {}): void {
  const encerrar = opcoes.encerrar ?? ((codigo: number) => process.exit(codigo));
  const tratar = (origem: string) => (erro: unknown) => {
    const idRastreio = reportarErro(erro, { origem });
    obterLoggerPadrao().fatal(
      { origem, id_rastreio: idRastreio },
      'Falha não tratada; o processo será encerrado',
    );
    void aguardarEnvio(LIMITE_ENVIO_MS).then(() => {
      encerrar(1);
    });
  };
  process.on('unhandledRejection', tratar('unhandledRejection'));
  process.on('uncaughtException', tratar('uncaughtException'));
}
