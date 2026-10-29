import { CODIGOS, ErroAplicacao } from '@cardapio/aplicacao';
import { spawn } from 'node:child_process';

export interface LimitesDaFerramenta {
  readonly tempoMs: number;
  readonly memoriaBytes: number;
  readonly prlimit: string | null;
}

export interface SaidaDaFerramenta {
  readonly codigo: number | null;
  readonly saida: string;
  readonly erro: string;
}

const MAXIMO_DA_SAIDA = 64 * 1024;

function comLimites(programa: string, argumentos: readonly string[], limites: LimitesDaFerramenta) {
  if (limites.prlimit === null) {
    return { comando: programa, argumentos };
  }
  const segundosDeCpu = Math.ceil((limites.tempoMs / 1000) * 4);
  return {
    comando: limites.prlimit,
    argumentos: [
      `--as=${String(limites.memoriaBytes)}`,
      `--cpu=${String(segundosDeCpu)}`,
      '--nofile=64',
      '--',
      programa,
      ...argumentos,
    ],
  };
}

function acumular(atual: string, pedaco: Buffer): string {
  const junto = atual + pedaco.toString('utf8');
  return junto.length > MAXIMO_DA_SAIDA ? junto.slice(-MAXIMO_DA_SAIDA) : junto;
}

function tempoEsgotado(programa: string, limites: LimitesDaFerramenta): ErroAplicacao {
  return new ErroAplicacao(
    CODIGOS.MIDIA_PROCESSAR_TEMPO_ESGOTADO,
    'A ferramenta de mídia passou do tempo limite',
    {
      modulo: 'midia',
      casoDeUso: 'processar',
      dados: { programa, limiteMs: limites.tempoMs },
    },
  );
}

export function executarFerramenta(
  programa: string,
  argumentos: readonly string[],
  limites: LimitesDaFerramenta,
): Promise<SaidaDaFerramenta> {
  const { comando, argumentos: completos } = comLimites(programa, argumentos, limites);
  return new Promise((resolver, rejeitar) => {
    const processo = spawn(comando, completos, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C' },
      timeout: limites.tempoMs,
      killSignal: 'SIGKILL',
    });
    let saida = '';
    let erro = '';
    processo.stdout.on('data', (pedaco: Buffer) => {
      saida = acumular(saida, pedaco);
    });
    processo.stderr.on('data', (pedaco: Buffer) => {
      erro = acumular(erro, pedaco);
    });
    processo.on('error', rejeitar);
    processo.on('close', (codigo, sinal) => {
      if (sinal === 'SIGKILL' && codigo === null) {
        rejeitar(tempoEsgotado(programa, limites));
        return;
      }
      resolver({ codigo, saida, erro });
    });
  });
}

export function falhaDaFerramenta(programa: string, resultado: SaidaDaFerramenta): ErroAplicacao {
  return new ErroAplicacao(
    CODIGOS.MIDIA_PROCESSAR_FERRAMENTA_FALHOU,
    'A ferramenta de mídia terminou com erro',
    {
      modulo: 'midia',
      casoDeUso: 'processar',
      dados: { programa, codigo: resultado.codigo, erro: resultado.erro.slice(-2000) },
    },
  );
}
