import type { ButtonHTMLAttributes } from 'react';
import { Icone } from '../icone/Icone.tsx';
import type { NomeIcone } from '../icone/icones.ts';
import { classesDoBotao, type VarianteBotao } from './variantes.ts';
import estilos from './Botao.module.css';

export interface PropriedadesBotaoIcone extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className' | 'style' | 'children' | 'aria-label'
> {
  readonly icone: NomeIcone;
  readonly rotulo: string;
  readonly variante?: VarianteBotao;
}

export function BotaoIcone({
  icone,
  rotulo,
  variante = 'secundario',
  type = 'button',
  ...resto
}: PropriedadesBotaoIcone) {
  return (
    <button
      {...resto}
      type={type}
      aria-label={rotulo}
      className={classesDoBotao(variante, false, estilos.icone)}
    >
      <Icone nome={icone} />
    </button>
  );
}
