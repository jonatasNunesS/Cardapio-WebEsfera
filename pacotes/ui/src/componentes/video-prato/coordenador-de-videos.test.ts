import { describe, expect, it, vi } from 'vitest';
import { criarCoordenadorDeVideos } from './coordenador-de-videos.ts';

describe('coordenador de vídeos', () => {
  it('com um terceiro vídeo tocando, pausa o mais antigo', () => {
    const coordenador = criarCoordenadorDeVideos();
    const [a, b, c] = [vi.fn(), vi.fn(), vi.fn()];
    coordenador.tocar('a', a);
    coordenador.tocar('b', b);
    coordenador.tocar('c', c);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    expect(c).not.toHaveBeenCalled();
  });

  it('um vídeo que parou libera a vaga', () => {
    const coordenador = criarCoordenadorDeVideos();
    const [a, b, c] = [vi.fn(), vi.fn(), vi.fn()];
    coordenador.tocar('a', a);
    coordenador.tocar('b', b);
    coordenador.parou('a');
    coordenador.tocar('c', c);
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('tocar de novo o mesmo vídeo o torna o mais recente', () => {
    const coordenador = criarCoordenadorDeVideos();
    const [a, b, c] = [vi.fn(), vi.fn(), vi.fn()];
    coordenador.tocar('a', a);
    coordenador.tocar('b', b);
    coordenador.tocar('a', a);
    coordenador.tocar('c', c);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
  });
});
