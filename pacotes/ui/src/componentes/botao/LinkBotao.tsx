import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { Icone } from '../icone/Icone.tsx';
import type { NomeIcone } from '../icone/icones.ts';
import { classesDoBotao, type VarianteBotao } from './variantes.ts';

export interface PropriedadesLinkBotao extends Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'className' | 'style'
> {
  readonly href: string;
  readonly children: ReactNode;
  readonly variante?: VarianteBotao | undefined;
  readonly icone?: NomeIcone | undefined;
  readonly larguraTotal?: boolean | undefined;
}

export function LinkBotao({
  children,
  variante = 'principal',
  icone,
  larguraTotal = false,
  ...resto
}: PropriedadesLinkBotao) {
  return (
    <a {...resto} className={classesDoBotao(variante, larguraTotal)}>
      {icone !== undefined && <Icone nome={icone} />}
      {children}
    </a>
  );
}
