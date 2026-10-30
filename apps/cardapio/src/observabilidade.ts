import { configuracaoDoBuild } from '@cardapio/observabilidade/web/configuracao';
import { depoisDaPrimeiraPintura, iniciarSentryDepois } from '@cardapio/observabilidade/web/tardio';

export const configuracao = configuracaoDoBuild();

let liberar: () => void = () => undefined;
const telaPronta = new Promise<void>((resolver) => {
  liberar = resolver;
});

// O SDK do Sentry só baixa depois que o cardápio aparece, para não disputar banda com o LCP: docs/adr/0013-cardapio-do-cliente.md
export const sentry = iniciarSentryDepois({ app: 'cardapio', ...configuracao }, (tarefa) => {
  void telaPronta.then(() => {
    depoisDaPrimeiraPintura(tarefa);
  });
});

export function avisarTelaPronta(): void {
  liberar();
}
