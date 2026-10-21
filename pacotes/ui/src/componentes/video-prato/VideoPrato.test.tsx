import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ProvedorDeVideos } from './CoordenadorDeVideos.tsx';
import { VideoPrato } from './VideoPrato.tsx';

type Retorno = (entradas: { intersectionRatio: number; target: Element }[]) => void;

const observados = new Map<Element, Retorno>();

class ObservadorFalso {
  private readonly retorno: Retorno;
  constructor(retorno: Retorno) {
    this.retorno = retorno;
  }
  observe(alvo: Element) {
    observados.set(alvo, this.retorno);
  }
  disconnect() {
    for (const [alvo, retorno] of observados) {
      if (retorno === this.retorno) {
        observados.delete(alvo);
      }
    }
  }
}

function mostrar(video: Element, fracao: number) {
  act(() => {
    observados.get(video)?.([{ intersectionRatio: fracao, target: video }]);
  });
}

function preferencias({ movimentoReduzido = false, economiaDeDados = false } = {}) {
  vi.stubGlobal('matchMedia', (consulta: string) => ({
    matches: movimentoReduzido && consulta.includes('reduce'),
  }));
  Object.defineProperty(navigator, 'connection', {
    value: { saveData: economiaDeDados },
    configurable: true,
  });
}

const PROPRIEDADES = {
  fonteMp4: '/costela.mp4',
  capa: '/costela.webp',
  descricao: 'Costela na brasa girando',
};

let tocar: Mock<() => Promise<void>>;
let pausar: Mock<() => void>;

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', ObservadorFalso);
  tocar = vi.fn<() => Promise<void>>(() => Promise.resolve());
  pausar = vi.fn<() => void>();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(tocar);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pausar);
  preferencias();
});

afterEach(() => {
  observados.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function video(): HTMLVideoElement {
  return screen.getByLabelText<HTMLVideoElement>('Costela na brasa girando');
}

describe('VideoPrato', () => {
  it('é mudo, em linha, em loop, sem pré-carregar e com capa', () => {
    render(<VideoPrato {...PROPRIEDADES} fonteWebm="/costela.webm" />);
    const elemento = video();
    expect(elemento.muted).toBe(true);
    expect(elemento.hasAttribute('playsinline')).toBe(true);
    expect(elemento.loop).toBe(true);
    expect(elemento.getAttribute('preload')).toBe('none');
    expect(elemento.getAttribute('poster')).toBe('/costela.webp');
    expect([...elemento.querySelectorAll('source')].map((fonte) => fonte.type)).toEqual([
      'video/webm',
      'video/mp4',
    ]);
  });

  it('só toca com 60% ou mais visível e pausa ao sair', () => {
    render(<VideoPrato {...PROPRIEDADES} />);
    mostrar(video(), 0.59);
    expect(tocar).not.toHaveBeenCalled();
    mostrar(video(), 0.6);
    expect(tocar).toHaveBeenCalledTimes(1);
    mostrar(video(), 0.2);
    expect(pausar).toHaveBeenCalled();
  });

  it('no máximo 2 tocando: o terceiro pausa o mais antigo', () => {
    render(
      <ProvedorDeVideos>
        <VideoPrato {...PROPRIEDADES} descricao="Prato 1" />
        <VideoPrato {...PROPRIEDADES} descricao="Prato 2" />
        <VideoPrato {...PROPRIEDADES} descricao="Prato 3" />
      </ProvedorDeVideos>,
    );
    const [um, dois, tres] = ['Prato 1', 'Prato 2', 'Prato 3'].map((nome) => screen.getByLabelText(nome));
    for (const elemento of [um, dois, tres]) {
      if (elemento !== undefined) {
        mostrar(elemento, 1);
      }
    }
    expect(tocar).toHaveBeenCalledTimes(3);
    expect(pausar.mock.contexts).toEqual([um]);
    expect(screen.getAllByRole('button', { name: 'Pausar vídeo do prato' })).toHaveLength(2);
  });

  it.each([
    ['movimento reduzido', { movimentoReduzido: true }],
    ['economia de dados', { economiaDeDados: true }],
  ])('com %s não toca sozinho: capa e "Reproduzir"', async (_nome, opcoes) => {
    preferencias(opcoes);
    render(<VideoPrato {...PROPRIEDADES} />);
    mostrar(video(), 1);
    expect(tocar).not.toHaveBeenCalled();
    const botao = screen.getByRole('button', { name: 'Reproduzir vídeo do prato' });
    expect(botao.textContent).toBe('Reproduzir');
    await userEvent.click(botao);
    expect(tocar).toHaveBeenCalledTimes(1);
  });

  it('se o vídeo falha, fica a capa, sem mensagem nem botão', () => {
    render(<VideoPrato {...PROPRIEDADES} />);
    fireEvent.error(video());
    expect(screen.getByRole('img', { name: 'Costela na brasa girando' }).getAttribute('src')).toBe(
      '/costela.webp',
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/erro|falh/i)).toBeNull();
  });

  it('a pausa funciona pelo teclado e não volta a tocar sozinha', async () => {
    render(<VideoPrato {...PROPRIEDADES} />);
    mostrar(video(), 1);
    screen.getByRole('button', { name: 'Pausar vídeo do prato' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(pausar).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Reproduzir vídeo do prato' })).toBeDefined();
    mostrar(video(), 1);
    expect(tocar).toHaveBeenCalledTimes(1);
  });
});
