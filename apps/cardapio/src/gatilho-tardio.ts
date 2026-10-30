export const ESPERA_ATE_OCIOSA_MS = 10_000;
const INTERACOES = ['pointerdown', 'keydown', 'touchstart'] as const;

type Alvo = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export function naPrimeiraInteracaoOuOciosa(
  tarefa: () => void,
  esperaMs = ESPERA_ATE_OCIOSA_MS,
  alvo: Alvo = globalThis,
): void {
  let feita = false;
  const executar = () => {
    if (feita) {
      return;
    }
    feita = true;
    clearTimeout(temporizador);
    for (const evento of INTERACOES) {
      alvo.removeEventListener(evento, executar, true);
    }
    tarefa();
  };
  const temporizador = setTimeout(() => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(executar);
    } else {
      executar();
    }
  }, esperaMs);
  for (const evento of INTERACOES) {
    alvo.addEventListener(evento, executar, { capture: true, once: true, passive: true });
  }
}
