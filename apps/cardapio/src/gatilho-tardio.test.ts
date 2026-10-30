import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { naPrimeiraInteracaoOuOciosa } from './gatilho-tardio.ts';

describe('Sentry na primeira interação ou com a página ociosa', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('roda na primeira interação, uma vez só, antes do tempo de ociosidade', () => {
    const alvo = new EventTarget();
    const tarefa = vi.fn();
    naPrimeiraInteracaoOuOciosa(tarefa, 10_000, alvo);

    alvo.dispatchEvent(new Event('pointerdown'));
    alvo.dispatchEvent(new Event('keydown'));
    vi.advanceTimersByTime(20_000);

    expect(tarefa).toHaveBeenCalledTimes(1);
  });

  it('sem interação, espera a ociosidade e não roda antes', () => {
    const tarefa = vi.fn();
    naPrimeiraInteracaoOuOciosa(tarefa, 10_000, new EventTarget());

    vi.advanceTimersByTime(9_999);
    expect(tarefa).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(tarefa).toHaveBeenCalledTimes(1);
  });

  it('rolar a página não conta como interação', () => {
    const alvo = new EventTarget();
    const tarefa = vi.fn();
    naPrimeiraInteracaoOuOciosa(tarefa, 10_000, alvo);

    alvo.dispatchEvent(new Event('scroll'));
    expect(tarefa).not.toHaveBeenCalled();
  });
});
