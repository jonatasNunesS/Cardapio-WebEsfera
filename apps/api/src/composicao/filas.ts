import type { RelatorDeErros } from '@cardapio/aplicacao';
import { NOMES_DAS_FILAS } from '@cardapio/contratos';
import { criarFila, criarRedis, fecharRedis } from '@cardapio/infraestrutura';
import { limparValor } from '@cardapio/observabilidade';
import { reportarErro } from '@cardapio/observabilidade/node';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import type { OpcoesDoPainelDeFilas } from '../rotas/filas.ts';

export interface PainelDeFilasComposto {
  readonly opcoes: Pick<OpcoesDoPainelDeFilas, 'adaptadores' | 'aoFalhar'>;
  encerrar(): Promise<void>;
}

export function comporPainelDeFilas(url: string, relator: RelatorDeErros): PainelDeFilasComposto {
  const conexao = criarRedis(url, relator, { connectionName: 'painel-de-filas', enableOfflineQueue: false });
  const filas = NOMES_DAS_FILAS.map((nome) => criarFila(nome, { conexao, relator }));
  const adaptadores = filas.map((fila) => {
    const adaptador = new BullMQAdapter(fila, { allowRetries: true, readOnlyMode: false });
    adaptador.setFormatter('data', limparValor);
    adaptador.setFormatter('returnValue', limparValor);
    return adaptador;
  });
  return {
    opcoes: {
      adaptadores,
      aoFalhar: (erro) => {
        reportarErro(erro, { tarefa: 'painelDeFilas' });
      },
    },
    async encerrar() {
      await Promise.all(filas.map((fila) => fila.close()));
      await fecharRedis(conexao);
    },
  };
}
