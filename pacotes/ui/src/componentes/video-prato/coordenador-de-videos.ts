export interface CoordenadorDeVideos {
  tocar(id: string, pausar: () => void): void;
  parou(id: string): void;
}

export const LIMITE_DE_VIDEOS_TOCANDO = 2;

export function criarCoordenadorDeVideos(limite = LIMITE_DE_VIDEOS_TOCANDO): CoordenadorDeVideos {
  const tocando: { id: string; pausar: () => void }[] = [];
  const remover = (id: string) => {
    const indice = tocando.findIndex((video) => video.id === id);
    if (indice >= 0) {
      tocando.splice(indice, 1);
    }
  };
  return {
    tocar(id, pausar) {
      remover(id);
      tocando.push({ id, pausar });
      while (tocando.length > limite) {
        tocando.shift()?.pausar();
      }
    },
    parou: remover,
  };
}
