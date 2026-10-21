import { ICONES, type NomeIcone } from './icones.ts';
import { juntarClasses } from '../../utilitarios/classes.ts';
import estilos from './Icone.module.css';

export type TamanhoIcone = 16 | 20 | 24;

export interface PropriedadesIcone {
  readonly nome: NomeIcone;
  readonly tamanho?: TamanhoIcone;
  readonly rotulo?: string;
  readonly className?: string;
}

export function Icone({ nome, tamanho = 20, rotulo, className }: PropriedadesIcone) {
  const Svg = ICONES[nome];
  const classes = juntarClasses(estilos.icone, className);
  if (rotulo === undefined) {
    return <Svg className={classes} size={tamanho} strokeWidth={2} aria-hidden="true" focusable="false" />;
  }
  return (
    <Svg
      className={classes}
      size={tamanho}
      strokeWidth={2}
      role="img"
      aria-label={rotulo}
      focusable="false"
    />
  );
}
