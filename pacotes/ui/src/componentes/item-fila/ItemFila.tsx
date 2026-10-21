import { juntarClasses } from '../../utilitarios/classes.ts';
import { Botao } from '../botao/Botao.tsx';
import { Icone } from '../icone/Icone.tsx';
import estilos from './ItemFila.module.css';

export type EstadoItemFila = 'novo' | 'assumido' | 'atrasado';

export interface PropriedadesItemFila {
  readonly mesa: number;
  readonly tipo: string;
  readonly tempo: string;
  readonly estado: EstadoItemFila;
  readonly detalhe?: string | undefined;
  readonly responsavel?: string | undefined;
  readonly aoAssumir?: (() => void) | undefined;
  readonly aoConcluir?: (() => void) | undefined;
  readonly naTv?: boolean | undefined;
}

function Acoes({ estado, mesa, responsavel, aoAssumir, aoConcluir }: PropriedadesItemFila) {
  if (estado === 'assumido') {
    return (
      <div className={estilos.acoes}>
        <p className={estilos.responsavel}>
          <Icone nome="confirmar" tamanho={16} />
          {responsavel ?? 'Você assumiu'}
        </p>
        <Botao
          variante="secundario"
          larguraTotal
          onClick={aoConcluir}
          aria-label={`Concluir mesa ${String(mesa)}`}
        >
          Concluir
        </Botao>
      </div>
    );
  }
  return (
    <Botao larguraTotal onClick={aoAssumir} aria-label={`Assumir mesa ${String(mesa)}`}>
      Assumir
    </Botao>
  );
}

export function ItemFila(propriedades: PropriedadesItemFila) {
  const { mesa, tipo, tempo, estado, detalhe, responsavel, naTv = false } = propriedades;
  const atrasado = estado === 'atrasado';
  return (
    <article className={juntarClasses(estilos.item, estilos[estado], naTv && estilos.tv)}>
      <header className={estilos.topo}>
        <h3 className={estilos.mesa}>Mesa {mesa}</h3>
        <span className={juntarClasses(estilos.tempo, atrasado && estilos.tempoAtrasado)}>
          {atrasado && <Icone nome="relogio" tamanho={16} />}
          {atrasado ? `Atrasado · ${tempo}` : tempo}
        </span>
      </header>
      <p className={estilos.tipo}>{tipo}</p>
      {detalhe !== undefined && <p className={estilos.detalhe}>{detalhe}</p>}
      {naTv ? (
        estado === 'assumido' && <p className={estilos.responsavel}>{responsavel ?? 'Em atendimento'}</p>
      ) : (
        <Acoes {...propriedades} />
      )}
    </article>
  );
}
