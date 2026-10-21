import { StrictMode, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './tokens.css';

export type Envoltorio = (conteudo: ReactNode) => ReactNode;

export function montarAplicacao(
  Aplicacao: ComponentType,
  envolver: Envoltorio = (conteudo) => conteudo,
): void {
  const raiz = document.getElementById('raiz');
  if (raiz === null) {
    throw new Error('Elemento #raiz ausente em index.html');
  }
  createRoot(raiz).render(<StrictMode>{envolver(<Aplicacao />)}</StrictMode>);
}
