import type { ChamadaDoProcessamento, FilaDeJobs, RelatorDeErros } from '@cardapio/aplicacao';

export const ESPERA_MAXIMA_DA_FILA_MS = 300;

function esgotar(ms: number): { promessa: Promise<'adiado'>; cancelar: () => void } {
  let temporizador: NodeJS.Timeout | undefined;
  const promessa = new Promise<'adiado'>((resolver) => {
    temporizador = setTimeout(() => {
      resolver('adiado');
    }, ms);
  });
  return {
    promessa,
    cancelar: () => {
      clearTimeout(temporizador);
    },
  };
}

// O aviso já está gravado; sem Redis, a conciliação o reprocessa: docs/adr/0014-assinaturas-e-cobranca.md
export function criarChamadaDoProcessamento(
  filas: FilaDeJobs,
  relator: RelatorDeErros,
  esperaMaximaMs = ESPERA_MAXIMA_DA_FILA_MS,
): ChamadaDoProcessamento {
  return {
    async avisar(eventoId) {
      const limite = esgotar(esperaMaximaMs);
      const enfileirar = filas
        .enfileirar({
          nome: 'processar-evento-pagamento',
          idDoJob: `evento-${eventoId}`,
          dados: { eventoId },
        })
        .then(() => 'enfileirado' as const)
        .catch((erro: unknown) => {
          relator.registrarPasso({ categoria: 'cobranca', mensagem: 'fila indisponível; aviso adiado' });
          relator.reportar(erro, { tarefa: 'avisarProcessamentoDePagamento' });
          return 'adiado' as const;
        });
      const desfecho = await Promise.race([enfileirar, limite.promessa]);
      limite.cancelar();
      return desfecho;
    },
  };
}
