import { useRef, type KeyboardEvent } from 'react';
import estilos from './Chip.module.css';

export interface Categoria {
  readonly id: string;
  readonly nome: string;
}

export interface PropriedadesChipCategoria {
  readonly rotulo: string;
  readonly categorias: readonly Categoria[];
  readonly selecionada: string;
  readonly aoEscolher: (id: string) => void;
}

const TECLAS: Readonly<Record<string, (indice: number, total: number) => number>> = {
  ArrowRight: (indice, total) => (indice + 1) % total,
  ArrowLeft: (indice, total) => (indice - 1 + total) % total,
  Home: () => 0,
  End: (_indice, total) => total - 1,
};

export function ChipCategoria({ rotulo, categorias, selecionada, aoEscolher }: PropriedadesChipCategoria) {
  const listaRef = useRef<HTMLUListElement>(null);
  const mover = (evento: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const proximo = TECLAS[evento.key]?.(indice, categorias.length);
    if (proximo === undefined) {
      return;
    }
    evento.preventDefault();
    listaRef.current?.querySelectorAll('button')[proximo]?.focus();
  };
  return (
    <nav aria-label={rotulo}>
      <ul ref={listaRef} className={estilos.lista}>
        {categorias.map((categoria, indice) => (
          <li key={categoria.id}>
            <button
              type="button"
              className={estilos.chip}
              aria-pressed={categoria.id === selecionada}
              onClick={() => {
                aoEscolher(categoria.id);
              }}
              onKeyDown={(evento) => {
                mover(evento, indice);
              }}
            >
              {categoria.nome}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
