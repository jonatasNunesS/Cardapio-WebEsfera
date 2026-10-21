import type { ReactNode } from 'react';
import { juntarClasses } from '../../utilitarios/classes.ts';
import { Icone } from '../icone/Icone.tsx';
import type { NomeIcone } from '../icone/icones.ts';
import tons from '../../utilitarios/tons.module.css';
import estilos from './Aviso.module.css';

export type TipoAviso = 'informacao' | 'sucesso' | 'aviso' | 'erro';

export const ICONE_DO_TIPO: Readonly<Record<TipoAviso, NomeIcone>> = {
  informacao: 'informacao',
  sucesso: 'sucesso',
  aviso: 'aviso',
  erro: 'erro',
};

export function papelDoTipo(tipo: TipoAviso): 'alert' | 'status' {
  return tipo === 'erro' ? 'alert' : 'status';
}

export interface PropriedadesAviso {
  readonly tipo: TipoAviso;
  readonly titulo?: string | undefined;
  readonly children: ReactNode;
  readonly acao?: ReactNode | undefined;
}

export function Aviso({ tipo, titulo, children, acao }: PropriedadesAviso) {
  return (
    <div role={papelDoTipo(tipo)} className={juntarClasses(estilos.caixa, tons[tipo])}>
      <Icone nome={ICONE_DO_TIPO[tipo]} className={estilos.icone} />
      <div className={estilos.corpo}>
        {titulo !== undefined && <p className={estilos.titulo}>{titulo}</p>}
        <div className={estilos.texto}>{children}</div>
        {acao !== undefined && <div className={estilos.acao}>{acao}</div>}
      </div>
    </div>
  );
}
