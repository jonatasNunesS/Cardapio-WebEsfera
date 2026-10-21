import oculto from '../../utilitarios/oculto.module.css';
import estilos from './Esqueleto.module.css';

export interface PropriedadesEsqueleto {
  readonly rotulo: string;
  readonly linhas?: number | undefined;
  readonly comMidia?: boolean | undefined;
}

export function Esqueleto({ rotulo, linhas = 3, comMidia = false }: PropriedadesEsqueleto) {
  return (
    <div className={estilos.esqueleto}>
      <span role="status" className={oculto.somenteLeitor}>
        {rotulo}
      </span>
      <div aria-hidden="true" className={estilos.blocos}>
        {comMidia && <div className={estilos.midia} />}
        {Array.from({ length: linhas }, (_, indice) => (
          <div key={indice} className={estilos.linha} />
        ))}
      </div>
    </div>
  );
}
