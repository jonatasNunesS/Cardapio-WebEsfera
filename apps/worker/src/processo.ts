const INTERVALO_DE_VIDA_MS = 60_000;

export interface ProcessoWorker {
  iniciar(): void;
  encerrar(): Promise<void>;
}

export interface OpcoesDoProcesso {
  readonly aoIniciar?: (() => void) | undefined;
  readonly aoEncerrar: () => Promise<void>;
}

export function criarProcessoWorker(opcoes: OpcoesDoProcesso): ProcessoWorker {
  let temporizador: NodeJS.Timeout | undefined;
  let encerramento: Promise<void> | undefined;
  return {
    iniciar() {
      temporizador = setInterval(() => undefined, INTERVALO_DE_VIDA_MS);
      opcoes.aoIniciar?.();
    },
    encerrar() {
      encerramento ??= (async () => {
        clearInterval(temporizador);
        temporizador = undefined;
        await opcoes.aoEncerrar();
      })();
      return encerramento;
    },
  };
}
