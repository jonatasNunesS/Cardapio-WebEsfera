const INTERVALO_DE_VIDA_MS = 60_000;

export interface ProcessoWorker {
  iniciar(): void;
  encerrar(): void;
}

export function criarProcessoWorker(): ProcessoWorker {
  let temporizador: NodeJS.Timeout | undefined;
  return {
    iniciar() {
      temporizador = setInterval(() => undefined, INTERVALO_DE_VIDA_MS);
    },
    encerrar() {
      clearInterval(temporizador);
      temporizador = undefined;
    },
  };
}
