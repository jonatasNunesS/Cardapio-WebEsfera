import { ErrorBoundary } from '@sentry/react';
import type { ComponentType, ReactNode } from 'react';

export interface PropriedadesTelaDeErro {
  readonly idRastreio: string;
  readonly aoTentarDeNovo: () => void;
}

export interface PropriedadesFronteiraDeErro {
  readonly children: ReactNode;
  readonly TelaDeErro: ComponentType<PropriedadesTelaDeErro>;
}

export function FronteiraDeErro({ children, TelaDeErro }: PropriedadesFronteiraDeErro) {
  return (
    <ErrorBoundary
      fallback={(falha) => (
        <TelaDeErro
          idRastreio={falha.eventId}
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
