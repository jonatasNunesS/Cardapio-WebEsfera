import { StrictMode, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';

export function montarAplicacao(Aplicacao: ComponentType, idRaiz = 'raiz'): void {
  const raiz = document.getElementById(idRaiz);
  if (raiz === null) {
    throw new Error(`Elemento #${idRaiz} ausente em index.html`);
  }
  createRoot(raiz).render(
    <StrictMode>
      <Aplicacao />
    </StrictMode>,
  );
}
