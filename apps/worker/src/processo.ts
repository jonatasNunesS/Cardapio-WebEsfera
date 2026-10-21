const INTERVALO_DE_VIDA_MS = 60_000;

export interface ProcessoWorker {
  iniciar(): void;
  encerrar(): Promise<void>;
}

export interface OpcoesDoProcesso {
  readonly aoEncerrar: () => Promise<void>;
}

export function criarProcessoWorker(opcoes: OpcoesDoProcesso): ProcessoWorker {
  let temporizador: NodeJS.Timeout | undefined;
  return {
    iniciar() {
      temporizador = setInterval(() => undefined, INTERVALO_DE_VIDA_MS);
    },
    async encerrar() {
      clearInterval(temporizador);
      temporizador = undefined;
      await opcoes.aoEncerrar();
    },
  };
}
