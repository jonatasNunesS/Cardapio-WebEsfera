import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { Icone } from '../icone/Icone.tsx';
import type { NomeIcone } from '../icone/icones.ts';
import { classesDoBotao, type VarianteBotao } from './variantes.ts';
import estilos from './Botao.module.css';

export interface PropriedadesBotao extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className' | 'style'
> {
  readonly children: ReactNode;
  readonly variante?: VarianteBotao | undefined;
  readonly carregando?: boolean | undefined;
  readonly icone?: NomeIcone | undefined;
  readonly larguraTotal?: boolean | undefined;
}

export function Botao({
  children,
  variante = 'principal',
  carregando = false,
  icone,
  larguraTotal = false,
  type = 'button',
  onClick,
  ...resto
}: PropriedadesBotao) {
  const aoClicar = (evento: MouseEvent<HTMLButtonElement>) => {
    if (carregando) {
      evento.preventDefault();
      return;
    }
    onClick?.(evento);
  };
  return (
    <button
      {...resto}
      type={type}
      className={classesDoBotao(variante, larguraTotal)}
      aria-busy={carregando || undefined}
      aria-disabled={carregando || undefined}
      onClick={aoClicar}
    >
      {carregando ? (
        <Icone nome="carregando" className={estilos.giro} />
      ) : (
        icone !== undefined && <Icone nome={icone} />
      )}
      {children}
    </button>
  );
}
