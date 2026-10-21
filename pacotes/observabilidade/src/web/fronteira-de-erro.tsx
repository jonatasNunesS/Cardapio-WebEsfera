import { ErrorBoundary } from '@sentry/react';
import { useRef, type ComponentType, type ReactNode } from 'react';
import { v7 as uuidv7 } from 'uuid';

export interface PropriedadesTelaDeErro {
  readonly idRastreio: string;
  readonly aoTentarDeNovo: () => void;
}

export interface PropriedadesFronteiraDeErro {
  readonly children: ReactNode;
  readonly TelaDeErro: ComponentType<PropriedadesTelaDeErro>;
}

export function FronteiraDeErro({ children, TelaDeErro }: PropriedadesFronteiraDeErro) {
  const idRastreio = useRef(uuidv7());
  return (
    <ErrorBoundary
      beforeCapture={(escopo) => {
        escopo.setTag('id_rastreio', idRastreio.current);
      }}
      onReset={() => {
        idRastreio.current = uuidv7();
      }}
      fallback={(falha) => (
        <TelaDeErro
          idRastreio={idRastreio.current}
          aoTentarDeNovo={() => {
            falha.resetError();
          }}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
