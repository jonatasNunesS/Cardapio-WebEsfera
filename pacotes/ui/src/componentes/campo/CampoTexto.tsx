import type { InputHTMLAttributes } from 'react';
import { Campo, estilosDoCampo, type PropriedadesComunsDoCampo } from './Campo.tsx';

export interface PropriedadesCampoTexto
  extends
    PropriedadesComunsDoCampo,
    Omit<
      InputHTMLAttributes<HTMLInputElement>,
      'className' | 'style' | 'aria-describedby' | 'aria-invalid'
    > {}

export function CampoTexto({ rotulo, dica, erro, id, type = 'text', ...resto }: PropriedadesCampoTexto) {
  return (
    <Campo id={id} rotulo={rotulo} dica={dica} erro={erro}>
      {(ligacao) => <input {...resto} {...ligacao} type={type} className={estilosDoCampo.controle} />}
    </Campo>
  );
}
