import type { ButtonHTMLAttributes } from 'react';
import estilos from './Chip.module.css';

export interface PropriedadesFiltroChip extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className' | 'style' | 'children' | 'aria-pressed'
> {
  readonly rotulo: string;
  readonly selecionado: boolean;
  readonly contagem?: number | undefined;
}

export function FiltroChip({
  rotulo,
  selecionado,
  contagem,
  type = 'button',
  ...resto
}: PropriedadesFiltroChip) {
  return (
    <button {...resto} type={type} className={estilos.chip} aria-pressed={selecionado}>
      {contagem === undefined ? rotulo : `${rotulo} · ${String(contagem)}`}
    </button>
  );
}
