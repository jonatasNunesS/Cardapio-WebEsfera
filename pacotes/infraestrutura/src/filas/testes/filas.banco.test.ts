import { CODIGOS, ErroAplicacao, ErroIsolamentoInquilino } from '@cardapio/aplicacao';
import type { Redis } from 'ioredis';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AcessoAoBanco } from '../../banco/banco.ts';
import { caixaSaida, restaurantes } from '../../banco/esquema/index.ts';
import { abrirBanco, criarRelatorDeTeste, criarRestauranteDeTeste } from '../../banco/testes/apoio.ts';
import { registrarAgendamentos } from '../agendamentos.ts';
import type { ConexoesDeFila } from '../conexoes.ts';
import { criarFilasBullMQ, type FilasBullMQ } from '../fila-de-jobs.ts';
import { criarLimitadorPorRestaurante } from '../limitador-por-restaurante.ts';
import { REGISTRO_DE_FILAS } from '../registro.ts';
import { iniciarTrabalhadores, type Processador, type Trabalhadores } from '../trabalhadores.ts';
import {
  abrirConexoesDeTeste,
  abrirRedisSimples,
  apagarPrefixo,
  criarExecutorDeTeste,
  esperarAte,
  estadoDoJob,
  prefixoDeTeste,
} from './apoio-filas.ts';

const JOB = 'expirar-sessoes-mesa';

describe('filas BullMQ com Redis e Postgres reais', () => {
  let banco: AcessoAoBanco;
  let limpeza: Redis;
  let conexoes: ConexoesDeFila;
  let filas: FilasBullMQ;
  let trabalhadores: Trabalhadores | undefined;
  let prefixo: string;

  beforeAll(() => {
    banco = abrirBanco('worker');
    limpeza = abrirRedisSimples();
  });

  afterAll(async () => {
    await banco.encerrar();
    await limpeza.quit();
  });

  function rotinas() {
    const fila = filas.filas.get('rotinas');
    if (fila === undefined) {
      throw new Error('fila rotinas não registrada');
    }
    return fila;
  }

  function preparar() {
    prefixo = prefixoDeTeste();
    conexoes = abrirConexoesDeTeste(criarRelatorDeTeste());
    filas = criarFilasBullMQ({ conexao: conexoes.produtora, relator: criarRelatorDeTeste(), prefixo });
  }

  function trabalhar(processador: Processador) {
    const executor = criarExecutorDeTeste();
    trabalhadores = iniciarTrabalhadores({
      conexao: conexoes.consumidora,
      banco,
      relator: criarRelatorDeTeste(),
      processadores: { [JOB]: processador },
      executarTarefa: executor.executar,
      filas: ['rotinas'],
      prefixo,
    });
    return executor;
  }

  function adicionarCru(id: string, dados: Record<string, unknown>, tentativas: number) {
    return filas.filas.get('rotinas')?.add(JOB, dados, {
      jobId: id,
      attempts: tentativas,
      backoff: { type: 'fixed', delay: 10 },
    });
  }

  afterEach(async () => {
    await trabalhadores?.encerrar(5000);
    trabalhadores = undefined;
    await filas.encerrar();
    await conexoes.encerrar();
    await apagarPrefixo(limpeza, prefixo);
  });

  it('o mesmo jobId enfileirado duas vezes gera um job só', async () => {
    preparar();
    const pedido = { nome: JOB, idDoJob: 'rotina-expirar-v1', dados: {} };

    const primeiro = await filas.enfileirar(pedido);
    const segundo = await filas.enfileirar(pedido);

    expect(primeiro.situacao).toBe('enfileirado');
    expect(segundo.situacao).toBe('duplicado');
    expect(await filas.filas.get('rotinas')?.getJobCountByTypes('wait', 'prioritized', 'delayed')).toBe(1);
  });

  it('recusa ao enfileirar payload fora do contrato, job sem contrato e id fora do padrão', async () => {
    preparar();

    await expect(
      filas.enfileirar({ nome: JOB, idDoJob: 'a-1', dados: { email: 'x' } }),
    ).rejects.toMatchObject({
      codigo: CODIGOS.FILA_JOB_PAYLOAD_INVALIDO,
    });
    await expect(filas.enfileirar({ nome: 'inexistente', idDoJob: 'a-2', dados: {} })).rejects.toMatchObject({
      codigo: CODIGOS.FILA_JOB_DESCONHECIDO,
    });
    await expect(filas.enfileirar({ nome: JOB, idDoJob: 'a:3', dados: {} })).rejects.toMatchObject({
      codigo: CODIGOS.FILA_ENFILEIRAR_ID_INVALIDO,
    });
    await expect(filas.enfileirar({ nome: JOB, idDoJob: '123', dados: {} })).rejects.toMatchObject({
      codigo: CODIGOS.FILA_ENFILEIRAR_ID_INVALIDO,
    });
  });

  it('payload inválido no processamento vai para falhas sem nova tentativa', async () => {
    preparar();
    const executor = trabalhar(() => Promise.resolve('não deveria rodar'));

    await adicionarCru('payload-invalido', { email: 'pessoa@exemplo.com' }, 5);
    await esperarAte(async () => (await estadoDoJob(rotinas(), 'payload-invalido')) === 'failed');

    const job = await filas.filas.get('rotinas')?.getJob('payload-invalido');
    expect(job?.attemptsMade).toBe(1);
    expect(executor.reportadas).toHaveLength(1);
    expect(executor.reportadas[0]?.erro).toMatchObject({ codigo: CODIGOS.FILA_JOB_PAYLOAD_INVALIDO });
    expect(JSON.stringify(executor.reportadas[0]?.erro)).not.toContain('pessoa@exemplo.com');
  });

  it('job que falha N vezes vai para falhas e só a última tentativa é reportada, com fila, job, tentativa e restaurante', async () => {
    preparar();
    const restauranteId = uuidv7();
    const executor = trabalhar(() => Promise.reject(new Error('dependência instável')));

    await adicionarCru('sempre-falha', { restauranteId }, 3);
    await esperarAte(async () => (await estadoDoJob(rotinas(), 'sempre-falha')) === 'failed');

    expect(executor.execucoes.map((execucao) => execucao.tentativa)).toEqual([1, 2, 3]);
    expect(executor.reportadas).toHaveLength(1);
    expect(executor.reportadas[0]).toMatchObject({
      job: { fila: 'rotinas', id: 'sempre-falha', tentativa: 3 },
      restauranteId,
    });
  });

  it('processador com restauranteId roda dentro de comRestaurante e não alcança outro restaurante', async () => {
    preparar();
    const [restaurante, outro] = [await criarRestauranteDeTeste(banco), await criarRestauranteDeTeste(banco)];
    const vistos: unknown[] = [];
    const executor = trabalhar(async ({ transacao }) => {
      const visiveis = await transacao?.select({ id: restaurantes.id }).from(restaurantes);
      vistos.push(visiveis?.map((linha) => linha.id));
      await transacao
        ?.insert(caixaSaida)
        .values({ restauranteId: outro.id, tipoEvento: 'SessaoMesaExpirada', carga: {} });
    });

    await adicionarCru('contexto-1', { restauranteId: restaurante.id }, 1);
    await esperarAte(async () => (await estadoDoJob(rotinas(), 'contexto-1')) === 'failed');

    expect(vistos).toEqual([[restaurante.id]]);
    expect(executor.reportadas.at(-1)?.erro).toBeInstanceOf(ErroIsolamentoInquilino);
  });

  it('job de mídia roda sem transação aberta; falha definitiva não repete e avisa o esgotamento uma vez', async () => {
    preparar();
    const restauranteId = uuidv7();
    const midiaId = uuidv7();
    const esgotados: string[] = [];
    const recebidas: unknown[] = [];
    const executor = criarExecutorDeTeste();
    trabalhadores = iniciarTrabalhadores({
      conexao: conexoes.consumidora,
      banco,
      relator: criarRelatorDeTeste(),
      processadores: {
        'processar-midia': (execucao) => {
          recebidas.push(execucao.transacao);
          return Promise.reject(
            new ErroAplicacao(CODIGOS.MIDIA_PROCESSAR_FERRAMENTA_FALHOU, 'ffmpeg falhou', {
              modulo: 'midia',
            }),
          );
        },
      },
      executarTarefa: executor.executar,
      aoEsgotarTentativas: (nome) => {
        esgotados.push(nome);
        return Promise.resolve();
      },
      filas: ['midia'],
      prefixo,
    });
    const dados = {
      restauranteId,
      eventoId: uuidv7(),
      tipo: 'MidiaEnviada',
      carga: { versao: 1, midiaId, tentativa: 1 },
    };
    const midia = filas.filas.get('midia');
    await midia?.add('processar-midia', dados, { jobId: 'midia-falha', attempts: 5 });
    await esperarAte(
      async () => midia !== undefined && (await estadoDoJob(midia, 'midia-falha')) === 'failed',
    );

    expect(recebidas).toEqual([undefined]);
    expect(esgotados).toEqual(['processar-midia']);
    expect((await midia?.getJob('midia-falha'))?.attemptsMade).toBe(1);
  });

  it('job concluído fica com o resultado do processador', async () => {
    preparar();
    trabalhar(() => Promise.resolve({ fechadas: 0 }));

    await filas.enfileirar({ nome: JOB, idDoJob: 'concluido-1', dados: {} });
    await esperarAte(async () => (await estadoDoJob(rotinas(), 'concluido-1')) === 'completed');

    expect((await filas.filas.get('rotinas')?.getJob('concluido-1'))?.returnvalue).toEqual({ fechadas: 0 });
  });

  it('encerrar espera o job em andamento terminar', async () => {
    preparar();
    let terminou = false;
    trabalhar(async () => {
      await new Promise((resolver) => setTimeout(resolver, 600));
      terminou = true;
    });

    await filas.enfileirar({ nome: JOB, idDoJob: 'lento-1', dados: {} });
    await esperarAte(async () => (await estadoDoJob(rotinas(), 'lento-1')) === 'active');
    const resultado = await trabalhadores?.encerrar(5000);
    trabalhadores = undefined;

    expect(resultado).toBe('concluido');
    expect(terminou).toBe(true);
    expect(await estadoDoJob(rotinas(), 'lento-1')).toBe('completed');
  });

  it('encerrar força o fechamento quando o job passa do limite', async () => {
    preparar();
    trabalhar(() => new Promise((resolver) => setTimeout(resolver, 3000)));

    await filas.enfileirar({ nome: JOB, idDoJob: 'travado-1', dados: {} });
    await esperarAte(async () => (await estadoDoJob(rotinas(), 'travado-1')) === 'active');
    const resultado = await trabalhadores?.encerrar(200);
    trabalhadores = undefined;

    expect(resultado).toBe('forcado');
  });

  it('registra os agendamentos uma vez só, mesmo chamado de novo', async () => {
    preparar();

    await registrarAgendamentos(conexoes.consumidora, criarRelatorDeTeste(), { prefixo });
    await registrarAgendamentos(conexoes.consumidora, criarRelatorDeTeste(), { prefixo });

    const rotinas = await filas.filas.get('rotinas')?.getJobSchedulers();
    const caixa = await filas.filas.get('caixa-saida')?.getJobSchedulers();
    expect(rotinas?.map((agendamento) => [agendamento.key, agendamento.every])).toEqual([[JOB, 300_000]]);
    expect(caixa?.map((agendamento) => [agendamento.key, agendamento.every])).toEqual([
      ['publicar-caixa-saida', 1000],
    ]);
  });
});

describe('limite por restaurante (GCRA no Redis)', () => {
  let redis: Redis;

  beforeAll(() => {
    redis = abrirRedisSimples();
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('restaurante acima do limite recebe atraso e outro restaurante no mesmo instante não', async () => {
    const limitador = criarLimitadorPorRestaurante(redis);
    const limite = { porMinuto: 60, rajada: 5 };
    const [barulhento, vizinho] = [uuidv7(), uuidv7()];
    const nome = `teste-${uuidv7().slice(-12)}`;

    const atrasos = [];
    for (let pedido = 0; pedido < 8; pedido += 1) {
      atrasos.push(await limitador.atrasoMs(nome, barulhento, limite));
    }
    const doVizinho = await limitador.atrasoMs(nome, vizinho, limite);

    expect(atrasos.slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(atrasos[5]).toBeGreaterThan(900);
    expect(atrasos[7]).toBeGreaterThan(atrasos[6] ?? 0);
    expect(doVizinho).toBe(0);
  });

  it('as filas com limite têm valores coerentes no registro', () => {
    for (const configuracao of Object.values(REGISTRO_DE_FILAS)) {
      if (configuracao.limitePorRestaurante !== null) {
        expect(configuracao.limitePorRestaurante.porMinuto).toBeGreaterThan(0);
        expect(configuracao.limitePorRestaurante.rajada).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('erros de domínio do job', () => {
  it('payload inválido é falha definitiva', async () => {
    const { ehFalhaDefinitiva } = await import('../trabalhadores.ts');
    const erro = new ErroAplicacao(CODIGOS.FILA_JOB_PAYLOAD_INVALIDO, 'x', { modulo: 'filas' });
    expect(ehFalhaDefinitiva(erro)).toBe(true);
    expect(ehFalhaDefinitiva(new Error('x'))).toBe(false);
  });
});
