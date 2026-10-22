import {
  expirarSessoesMesa,
  publicarCaixaDeSaida,
  type RelatorDeErros,
  type RoteamentoDeEventos,
} from '@cardapio/aplicacao';
import {
  criarCaixaDeSaida,
  criarConexoesDeFila,
  criarFilasBullMQ,
  criarPublicadorTempoReal,
  criarRedis,
  criarSessoesMesaVencidas,
  criarTravaDistribuida,
  fecharRedis,
  iniciarTrabalhadores,
  registrarAgendamentos,
  type AcessoAoBanco,
  type Processador,
  type Trabalhadores,
} from '@cardapio/infraestrutura';
import {
  contextoAtual,
  criarPulsoDeRotina,
  monitorarRotina,
  obterLoggerPadrao,
  reportarErro,
} from '@cardapio/observabilidade/node';
import { executarTarefa } from '../execucao/executar-tarefa.ts';

export const LIMITE_DE_ENCERRAMENTO_MS = 30_000;
const DURACAO_DA_TRAVA_DO_PUBLICADOR_MS = 30_000;

const MONITOR_DA_EXPIRACAO = { aCadaMinutos: 5, margemMinutos: 10, duracaoMaximaMinutos: 4 };
const MONITOR_DO_PUBLICADOR = { aCadaMinutos: 1, margemMinutos: 5, duracaoMaximaMinutos: 1 };

const ROTEAMENTO_DE_EVENTOS: RoteamentoDeEventos = {};

export interface FilasDoWorker {
  iniciar(): void;
  encerrar(): Promise<void>;
}

export function comporFilas(url: string, banco: AcessoAoBanco, relator: RelatorDeErros): FilasDoWorker {
  const redis = criarRedis(url, relator, { connectionName: 'cache-e-tempo-real' });
  const conexoes = criarConexoesDeFila(url, relator);
  const filas = criarFilasBullMQ({
    conexao: conexoes.produtora,
    relator,
    idRastreioAtual: () => contextoAtual()?.idRastreio,
  });
  const trava = criarTravaDistribuida(redis);
  const dependenciasDaCaixa = {
    caixaDeSaida: criarCaixaDeSaida(banco, relator),
    publicador: criarPublicadorTempoReal(redis),
    filas,
    roteamento: ROTEAMENTO_DE_EVENTOS,
  };
  const pulsarPublicador = criarPulsoDeRotina('caixa-saida-publicador', MONITOR_DO_PUBLICADOR);
  const processadores: Record<string, Processador> = {
    'publicar-caixa-saida': async () => {
      const resumo = await trava.comTrava('publicar-caixa-saida', DURACAO_DA_TRAVA_DO_PUBLICADOR_MS, () =>
        publicarCaixaDeSaida(dependenciasDaCaixa),
      );
      pulsarPublicador();
      return resumo;
    },
    'expirar-sessoes-mesa': () =>
      monitorarRotina('rotinas-expirar-sessoes-mesa', MONITOR_DA_EXPIRACAO, () =>
        expirarSessoesMesa({
          sessoesMesa: criarSessoesMesaVencidas(banco),
          relogio: { agora: () => new Date() },
        }),
      ),
  };
  let trabalhadores: Trabalhadores | undefined;

  return {
    iniciar() {
      trabalhadores = iniciarTrabalhadores({
        conexao: conexoes.consumidora,
        banco,
        relator,
        processadores,
        executarTarefa,
      });
      registrarAgendamentos(conexoes.consumidora, relator).catch((erro: unknown) => {
        reportarErro(erro, { tarefa: 'registrarAgendamentos' });
      });
    },
    async encerrar() {
      const resultado = await trabalhadores?.encerrar(LIMITE_DE_ENCERRAMENTO_MS);
      obterLoggerPadrao().info({ resultado }, 'filas encerradas');
      await filas.encerrar();
      await conexoes.encerrar();
      await fecharRedis(redis);
    },
  };
}
