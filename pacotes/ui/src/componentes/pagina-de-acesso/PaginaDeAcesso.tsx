import type { ReactNode } from 'react';
import estilos from './PaginaDeAcesso.module.css';

export interface PropriedadesPaginaDeAcesso {
  readonly marca: string;
  readonly titulo: string;
  readonly descricao?: ReactNode | undefined;
  readonly children: ReactNode;
  readonly rodape?: ReactNode | undefined;
}

export function PaginaDeAcesso({ marca, titulo, descricao, children, rodape }: PropriedadesPaginaDeAcesso) {
  return (
    <main className={estilos.pagina}>
      <div className={estilos.coluna}>
        <p className={estilos.marca}>{marca}</p>
        <section className={estilos.cartao} aria-labelledby="titulo-da-pagina">
          <h1 id="titulo-da-pagina" className={estilos.titulo}>
            {titulo}
          </h1>
          {descricao !== undefined && <div className={estilos.descricao}>{descricao}</div>}
          {children}
        </section>
        {rodape !== undefined && <div className={estilos.rodape}>{rodape}</div>}
      </div>
    </main>
  );
}
