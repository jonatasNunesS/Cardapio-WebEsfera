import type { SelectHTMLAttributes } from 'react';
import { Campo, estilosDoCampo, type PropriedadesComunsDoCampo } from './Campo.tsx';

export interface OpcaoSeletor {
  readonly valor: string;
  readonly rotulo: string;
}

export interface PropriedadesSeletor
  extends
    PropriedadesComunsDoCampo,
    Omit<
      SelectHTMLAttributes<HTMLSelectElement>,
      'className' | 'style' | 'aria-describedby' | 'aria-invalid' | 'children'
    > {
  readonly opcoes: readonly OpcaoSeletor[];
}

export function Seletor({ rotulo, dica, erro, id, opcoes, ...resto }: PropriedadesSeletor) {
  return (
    <Campo id={id} rotulo={rotulo} dica={dica} erro={erro}>
      {(ligacao) => (
        <select {...resto} {...ligacao} className={estilosDoCampo.controle}>
          {opcoes.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </option>
          ))}
        </select>
      )}
    </Campo>
  );
}
