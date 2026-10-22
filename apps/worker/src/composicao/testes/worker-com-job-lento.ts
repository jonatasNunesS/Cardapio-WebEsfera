import { criarBanco, criarConexoesDeFila, iniciarTrabalhadores } from '@cardapio/infraestrutura';
import { criarLogger, definirLoggerPadrao, relatorDeErrosSentry } from '@cardapio/observabilidade/node';
import { instalarEncerramento } from '../../encerramento.ts';
import { executarTarefa } from '../../execucao/executar-tarefa.ts';
import { criarProcessoWorker } from '../../processo.ts';
import { LIMITE_DE_ENCERRAMENTO_MS } from '../filas.ts';

const DURACAO_DO_JOB_MS = 1500;

definirLoggerPadrao(criarLogger({ app: 'worker' }));
const banco = criarBanco({
  runtime: { url: process.env.URL_BANCO_WORKER ?? '', nomeAplicacao: 'teste-encerramento' },
  relator: relatorDeErrosSentry,
});
const conexoes = criarConexoesDeFila(process.env.URL_REDIS ?? '', relatorDeErrosSentry);
const trabalhadores = iniciarTrabalhadores({
  conexao: conexoes.consumidora,
  banco,
  relator: relatorDeErrosSentry,
  processadores: {
    'expirar-sessoes-mesa': async () => {
      process.send?.({ situacao: 'job-iniciado' });
      await new Promise((resolver) => setTimeout(resolver, DURACAO_DO_JOB_MS));
      return { lento: true };
    },
  },
  executarTarefa,
  filas: ['rotinas'],
  prefixo: process.env.PREFIXO_FILAS,
});
const worker = criarProcessoWorker({
  aoEncerrar: async () => {
    await trabalhadores.encerrar(LIMITE_DE_ENCERRAMENTO_MS);
    await conexoes.encerrar();
    await banco.encerrar();
  },
});
instalarEncerramento(worker);
worker.iniciar();
process.send?.({ situacao: 'pronto' });
