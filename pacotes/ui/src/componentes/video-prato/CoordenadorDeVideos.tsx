import { createContext, use, useState, type ReactNode } from 'react';
import { criarCoordenadorDeVideos, type CoordenadorDeVideos } from './coordenador-de-videos.ts';

const CoordenadorContext = createContext<CoordenadorDeVideos>(criarCoordenadorDeVideos());

export function ProvedorDeVideos({ children }: { readonly children: ReactNode }) {
  const [coordenador] = useState(() => criarCoordenadorDeVideos());
  return <CoordenadorContext value={coordenador}>{children}</CoordenadorContext>;
}

export function useCoordenadorDeVideos(): CoordenadorDeVideos {
  return use(CoordenadorContext);
}
