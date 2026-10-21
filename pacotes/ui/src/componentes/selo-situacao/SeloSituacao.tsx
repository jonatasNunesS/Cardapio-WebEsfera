import { juntarClasses } from '../../utilitarios/classes.ts';
import tons from '../../utilitarios/tons.module.css';
import estilos from './SeloSituacao.module.css';

export type Situacao = 'aguardando' | 'emAtendimento' | 'concluido' | 'cancelado' | 'vencida' | 'paga';

type Tom = 'aviso' | 'informacao' | 'sucesso' | 'neutro' | 'erro';

const SITUACOES: Readonly<Record<Situacao, { texto: string; tom: Tom }>> = {
  aguardando: { texto: 'Aguardando', tom: 'aviso' },
  emAtendimento: { texto: 'Em atendimento', tom: 'informacao' },
  concluido: { texto: 'Concluído', tom: 'sucesso' },
  cancelado: { texto: 'Cancelado', tom: 'neutro' },
  vencida: { texto: 'Vencida', tom: 'erro' },
  paga: { texto: 'Paga', tom: 'sucesso' },
};

export interface PropriedadesSeloSituacao {
  readonly situacao: Situacao;
  readonly texto?: string | undefined;
}

export function SeloSituacao({ situacao, texto }: PropriedadesSeloSituacao) {
  const { texto: padrao, tom } = SITUACOES[situacao];
  return <span className={juntarClasses(estilos.selo, tons[tom])}>{texto ?? padrao}</span>;
}
