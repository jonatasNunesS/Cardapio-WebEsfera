import { configuracaoDoBuild } from '@cardapio/observabilidade/web/configuracao';
import { depoisDaPrimeiraPintura, iniciarSentryDepois } from '@cardapio/observabilidade/web/tardio';
import { naPrimeiraInteracaoOuOciosa } from './gatilho-tardio.ts';

export const configuracao = configuracaoDoBuild();

let liberar: () => void = () => undefined;
const telaPronta = new Promise<void>((resolver) => {
  liberar = resolver;
});

// O SDK do Sentry fica fora da primeira carga: baixa na primeira interação ou com a página ociosa: docs/adr/0015-pedido-do-cliente.md
export const sentry = iniciarSentryDepois({ app: 'cardapio', ...configuracao }, (tarefa) => {
  void telaPronta.then(() => {
    depoisDaPrimeiraPintura(() => {
      naPrimeiraInteracaoOuOciosa(tarefa);
    });
  });
});

export function avisarTelaPronta(): void {
  liberar();
}
