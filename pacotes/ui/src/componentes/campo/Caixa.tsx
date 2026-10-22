import { useId, type InputHTMLAttributes } from 'react';
import {
  descricaoDoCampo,
  estilosDoCampo,
  MensagensDoCampo,
  type PropriedadesComunsDoCampo,
} from './Campo.tsx';

export interface PropriedadesCaixa
  extends
    PropriedadesComunsDoCampo,
    Omit<
      InputHTMLAttributes<HTMLInputElement>,
      'className' | 'style' | 'type' | 'aria-describedby' | 'aria-invalid'
    > {}

export function Caixa({ rotulo, dica, erro, id, ...resto }: PropriedadesCaixa) {
  const geradoId = useId();
  const idControle = id ?? geradoId;
  const idDica = `${idControle}-dica`;
  const idErro = `${idControle}-erro`;
  return (
    <div className={estilosDoCampo.campo}>
      <label className={estilosDoCampo.opcao}>
        <input
          {...resto}
          id={idControle}
          type="checkbox"
          aria-describedby={descricaoDoCampo(idDica, idErro, dica, erro)}
          aria-invalid={erro === undefined ? undefined : true}
        />
        {rotulo}
      </label>
      <MensagensDoCampo idDica={idDica} idErro={idErro} dica={dica} erro={erro} />
    </div>
  );
}
