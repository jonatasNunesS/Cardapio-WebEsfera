import '@cardapio/ui/fontes/cardapio.css';
import './base.css';
import { montarAplicacao } from '@cardapio/ui';
import { RouterProvider } from 'react-router';
import { avisarTelaPronta, sentry } from './observabilidade.ts';
import { registrarTrabalhador } from './offline/aquecer.ts';
import { criarRotas } from './rotas.tsx';

const rotas = criarRotas();

montarAplicacao(() => <RouterProvider router={rotas} />);

const pararDeOuvir = rotas.subscribe((estado) => {
  if (estado.initialized && estado.navigation.state === 'idle') {
    pararDeOuvir();
    avisarTelaPronta();
  }
});

addEventListener('load', () => {
  registrarTrabalhador().then(
    () => undefined,
    (erro: unknown) => {
      sentry.reportar(erro, { etapa: 'registrar-service-worker' });
    },
  );
});
