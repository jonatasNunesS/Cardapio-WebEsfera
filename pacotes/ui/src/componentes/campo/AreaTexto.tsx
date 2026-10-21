import type { TextareaHTMLAttributes } from 'react';
import { juntarClasses } from '../../utilitarios/classes.ts';
import { Campo, estilosDoCampo, type PropriedadesComunsDoCampo } from './Campo.tsx';

export interface PropriedadesAreaTexto
  extends
    PropriedadesComunsDoCampo,
    Omit<
      TextareaHTMLAttributes<HTMLTextAreaElement>,
      'className' | 'style' | 'aria-describedby' | 'aria-invalid'
    > {}

export function AreaTexto({ rotulo, dica, erro, id, rows = 3, ...resto }: PropriedadesAreaTexto) {
  return (
    <Campo id={id} rotulo={rotulo} dica={dica} erro={erro}>
      {(ligacao) => (
        <textarea
          {...resto}
          {...ligacao}
          rows={rows}
          className={juntarClasses(estilosDoCampo.controle, estilosDoCampo.area)}
        />
      )}
    </Campo>
  );
}
