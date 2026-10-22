import { AsyncLocalStorage } from 'node:async_hooks';

export interface JobEmExecucao {
  readonly fila: string;
  readonly id: string;
  readonly tentativa: number;
  readonly falhaDefinitiva?: boolean;
}

export interface ContextoDeExecucao {
  readonly idRastreio: string;
  readonly app: string;
  readonly rota?: string;
  readonly tarefa?: string;
  readonly restauranteId?: string;
  readonly casoDeUso?: string;
  readonly escopo?: 'sistema';
  readonly job?: JobEmExecucao;
}

const armazenamento = new AsyncLocalStorage<ContextoDeExecucao>();

export function executarComContexto<T>(contexto: ContextoDeExecucao, executar: () => T): T {
  return armazenamento.run(contexto, executar);
}

export function abrirContexto(contexto: ContextoDeExecucao): void {
  armazenamento.enterWith(contexto);
}

export function contextoAtual(): ContextoDeExecucao | undefined {
  return armazenamento.getStore();
}
