import { useId, type ReactNode } from 'react';
import { juntarClasses } from '../../utilitarios/classes.ts';
import { Icone } from '../icone/Icone.tsx';
import estilos from './Campo.module.css';

export interface PropriedadesComunsDoCampo {
  readonly rotulo: string;
  readonly dica?: string | undefined;
  readonly erro?: string | undefined;
}

export interface LigacaoDoCampo {
  readonly id: string;
  readonly 'aria-describedby'?: string;
  readonly 'aria-invalid'?: true;
}

interface PropriedadesCampo extends PropriedadesComunsDoCampo {
  readonly id?: string | undefined;
  readonly children: (ligacao: LigacaoDoCampo) => ReactNode;
}

interface PropriedadesMensagens {
  readonly idDica: string;
  readonly idErro: string;
  readonly dica?: string | undefined;
  readonly erro?: string | undefined;
}

export function MensagensDoCampo({ idDica, idErro, dica, erro }: PropriedadesMensagens) {
  return (
    <>
      {dica !== undefined && (
        <p id={idDica} className={estilos.dica}>
          {dica}
        </p>
      )}
      {erro !== undefined && (
        <p id={idErro} className={estilos.erro}>
          <Icone nome="erro" tamanho={16} />
          {erro}
        </p>
      )}
    </>
  );
}

export function descricaoDoCampo(
  idDica: string,
  idErro: string,
  dica?: string,
  erro?: string,
): string | undefined {
  const ids = juntarClasses(dica !== undefined && idDica, erro !== undefined && idErro);
  return ids === '' ? undefined : ids;
}

export function Campo({ id, rotulo, dica, erro, children }: PropriedadesCampo) {
  const geradoId = useId();
  const idControle = id ?? geradoId;
  const idDica = `${idControle}-dica`;
  const idErro = `${idControle}-erro`;
  const descricao = descricaoDoCampo(idDica, idErro, dica, erro);
  return (
    <div className={estilos.campo}>
      <label htmlFor={idControle} className={estilos.rotulo}>
        {rotulo}
      </label>
      {children({
        id: idControle,
        ...(descricao === undefined ? {} : { 'aria-describedby': descricao }),
        ...(erro === undefined ? {} : { 'aria-invalid': true }),
      })}
      <MensagensDoCampo idDica={idDica} idErro={idErro} dica={dica} erro={erro} />
    </div>
  );
}

export const estilosDoCampo = estilos;
