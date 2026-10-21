import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icone } from '../icone/Icone.tsx';
import { criarControleDoVideo, type ControleDoVideo, type EstadoDoVideo } from './controle-do-video.ts';
import { useCoordenadorDeVideos } from './CoordenadorDeVideos.tsx';
import { podeTocarSozinho } from './preferencias.ts';
import estilos from './VideoPrato.module.css';

export interface PropriedadesVideoPrato {
  readonly fonteMp4: string;
  readonly fonteWebm?: string | undefined;
  readonly capa: string;
  readonly descricao: string;
}

export const VISIBILIDADE_MINIMA = 0.6;

function observarVisibilidade(video: HTMLVideoElement, controle: ControleDoVideo): () => void {
  const observador = new IntersectionObserver(
    ([entrada]) => {
      const visivel = entrada !== undefined && entrada.intersectionRatio >= VISIBILIDADE_MINIMA;
      if (visivel && controle.estado() === 'parado') {
        controle.tocar();
      } else if (!visivel && controle.estado() === 'tocando') {
        controle.pausar('parado');
      }
    },
    { threshold: [0, VISIBILIDADE_MINIMA, 1] },
  );
  observador.observe(video);
  return () => {
    observador.disconnect();
  };
}

export function VideoPrato({ fonteMp4, fonteWebm, capa, descricao }: PropriedadesVideoPrato) {
  const videoId = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const coordenador = useCoordenadorDeVideos();
  const [estado, setEstado] = useState<EstadoDoVideo>('parado');
  const [tocaSozinho] = useState(podeTocarSozinho);
  const controle = useMemo(
    () =>
      criarControleDoVideo({
        id: videoId,
        coordenador,
        obterVideo: () => videoRef.current,
        aoMudar: setEstado,
      }),
    [videoId, coordenador],
  );

  useEffect(() => {
    const video = videoRef.current;
    const pararDeObservar =
      video !== null && tocaSozinho && typeof IntersectionObserver !== 'undefined'
        ? observarVisibilidade(video, controle)
        : undefined;
    return () => {
      pararDeObservar?.();
      controle.pausar('parado');
    };
  }, [controle, tocaSozinho]);

  if (estado === 'falhou') {
    return (
      <div className={estilos.video}>
        <img className={estilos.midia} src={capa} alt={descricao} />
      </div>
    );
  }

  const tocandoAgora = estado === 'tocando';
  return (
    <div className={estilos.video}>
      <video
        ref={videoRef}
        className={estilos.midia}
        aria-label={descricao}
        poster={capa}
        muted
        playsInline
        loop
        preload="none"
        onError={() => {
          controle.falhar();
        }}
      >
        {fonteWebm !== undefined && <source src={fonteWebm} type="video/webm" />}
        <source
          src={fonteMp4}
          type="video/mp4"
          onError={() => {
            controle.falhar();
          }}
        />
      </video>
      <button
        type="button"
        className={tocaSozinho ? estilos.controle : estilos.reproduzir}
        aria-label={tocandoAgora ? 'Pausar vídeo do prato' : 'Reproduzir vídeo do prato'}
        onClick={() => {
          if (tocandoAgora) {
            controle.pausar('pausadoPelaPessoa');
          } else {
            controle.tocar();
          }
        }}
      >
        <Icone nome={tocandoAgora ? 'pausar' : 'reproduzir'} tamanho={tocaSozinho ? 16 : 20} />
        {!tocaSozinho && !tocandoAgora && <span aria-hidden="true">Reproduzir</span>}
      </button>
    </div>
  );
}
