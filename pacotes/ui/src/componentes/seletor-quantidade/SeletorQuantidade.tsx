import { Icone } from '../icone/Icone.tsx';
import oculto from '../../utilitarios/oculto.module.css';
import estilos from './SeletorQuantidade.module.css';

export interface PropriedadesSeletorQuantidade {
  readonly nomeDoItem: string;
  readonly valor: number;
  readonly aoMudar: (valor: number) => void;
  readonly minimo?: number | undefined;
  readonly maximo?: number | undefined;
  readonly desativado?: boolean | undefined;
}

export function SeletorQuantidade({
  nomeDoItem,
  valor,
  aoMudar,
  minimo = 1,
  maximo = 20,
  desativado = false,
}: PropriedadesSeletorQuantidade) {
  const podeDiminuir = !desativado && valor > minimo;
  const podeAumentar = !desativado && valor < maximo;
  return (
    <div className={estilos.seletor} role="group" aria-label={`Quantidade de ${nomeDoItem}`}>
      <button
        type="button"
        className={estilos.botao}
        aria-label={`Diminuir ${nomeDoItem}`}
        aria-disabled={!podeDiminuir}
        onClick={() => {
          if (podeDiminuir) {
            aoMudar(valor - 1);
          }
        }}
      >
        <Icone nome="menos" />
      </button>
      <span className={estilos.valor} aria-live="polite" aria-atomic="true">
        <span className={oculto.somenteLeitor}>{`Quantidade de ${nomeDoItem}: `}</span>
        {valor}
      </span>
      <button
        type="button"
        className={estilos.botao}
        aria-label={`Aumentar ${nomeDoItem}`}
        aria-disabled={!podeAumentar}
        onClick={() => {
          if (podeAumentar) {
            aoMudar(valor + 1);
          }
        }}
      >
        <Icone nome="mais" />
      </button>
    </div>
  );
}
