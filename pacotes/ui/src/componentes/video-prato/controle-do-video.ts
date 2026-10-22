import type { CoordenadorDeVideos } from './coordenador-de-videos.ts';

export type EstadoDoVideo = 'parado' | 'tocando' | 'pausadoPelaPessoa' | 'falhou';

export interface ControleDoVideo {
  tocar(): void;
  pausar(novo: Exclude<EstadoDoVideo, 'tocando'>): void;
  falhar(): void;
  estado(): EstadoDoVideo;
}

interface OpcoesDoControle {
  readonly id: string;
  readonly coordenador: CoordenadorDeVideos;
  readonly obterVideo: () => HTMLVideoElement | null;
  readonly aoMudar: (estado: EstadoDoVideo) => void;
}

export function criarControleDoVideo({
  id,
  coordenador,
  obterVideo,
  aoMudar,
}: OpcoesDoControle): ControleDoVideo {
  let atual: EstadoDoVideo = 'parado';
  const mudar = (novo: EstadoDoVideo) => {
    atual = novo;
    aoMudar(novo);
  };
  const controle: ControleDoVideo = {
    estado: () => atual,
    pausar(novo) {
      obterVideo()?.pause();
      coordenador.parou(id);
      if (atual !== 'falhou') {
        mudar(novo);
      }
    },
    falhar() {
      obterVideo()?.pause();
      coordenador.parou(id);
      mudar('falhou');
    },
    tocar() {
      const video = obterVideo();
      if (video === null || atual === 'falhou') {
        return;
      }
      coordenador.tocar(id, () => {
        controle.pausar('parado');
      });
      mudar('tocando');
      video.play().catch(() => {
        controle.pausar('parado');
      });
    },
  };
  return controle;
}
