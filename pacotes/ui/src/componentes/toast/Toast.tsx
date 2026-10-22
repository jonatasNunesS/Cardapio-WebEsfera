import { useEffect, useRef } from 'react';
import { juntarClasses } from '../../utilitarios/classes.ts';
import { ICONE_DO_TIPO, type TipoAviso } from '../aviso/Aviso.tsx';
import { Icone } from '../icone/Icone.tsx';
import tons from '../../utilitarios/tons.module.css';
import estilos from './Toast.module.css';

export interface PropriedadesToast {
  readonly tipo: TipoAviso;
  readonly texto: string;
  readonly aoFechar: () => void;
  readonly duracaoMs?: number | undefined;
}

export function Toast({ tipo, texto, aoFechar, duracaoMs }: PropriedadesToast) {
  const pausadoRef = useRef(false);
  const aoFecharRef = useRef(aoFechar);
  aoFecharRef.current = aoFechar;

  useEffect(() => {
    if (duracaoMs === undefined) {
      return undefined;
    }
    const temporizador = window.setInterval(() => {
      if (!pausadoRef.current) {
        window.clearInterval(temporizador);
        aoFecharRef.current();
      }
    }, duracaoMs);
    return () => {
      window.clearInterval(temporizador);
    };
  }, [duracaoMs]);

  const pausar = () => {
    pausadoRef.current = true;
  };
  const retomar = () => {
    pausadoRef.current = false;
  };
  return (
    <div
      className={juntarClasses(estilos.toast, tons[tipo])}
      onMouseEnter={pausar}
      onMouseLeave={retomar}
      onFocus={pausar}
      onBlur={retomar}
    >
      <Icone nome={ICONE_DO_TIPO[tipo]} />
      <p className={estilos.texto}>{texto}</p>
      <button type="button" className={estilos.fechar} aria-label="Fechar notificação" onClick={aoFechar}>
        <Icone nome="fechar" />
      </button>
    </div>
  );
}
