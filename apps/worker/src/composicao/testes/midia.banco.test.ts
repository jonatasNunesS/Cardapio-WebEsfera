import {
  confirmarEnvioDeMidia,
  criarCategoria,
  criarPrato,
  solicitarEnvioDeMidia,
  type DependenciasDoProcessamento,
  type FilaDeJobs,
  type PedidoDeJob,
  type ProcessadorDeMidia,
} from '@cardapio/aplicacao';
import {
  criarArmazenamentoS3,
  criarBanco,
  criarFonteDoCardapioPublico,
  criarRepositorioDoCardapio,
  type AcessoAoBanco,
  type ArmazenamentoS3,
} from '@cardapio/infraestrutura';
import {
  consultarComUrl,
  criarAmostras,
  VARIAVEIS_DO_ARMAZENAMENTO_DE_TESTE as VARIAVEIS,
  VARIAVEIS_DO_MERCADO_PAGO_DE_TESTE,
  type Amostras,
} from '@cardapio/infraestrutura/testes';
import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { esquemaAmbienteWorker } from '../../ambiente.ts';
import { dependenciasDoProcessamento, processadoresDaMidia } from '../midia.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    bancoDeTeste: { readonly urlWorker: string; readonly urlAdmin: string };
  }
}

const relatorMudo = { reportar: () => randomUUID(), registrarPasso: () => undefined };
const LIMITE_DO_DERIVADO = 600 * 1024;

interface EventoDaCaixa extends Record<string, unknown> {
  readonly id: string;
  readonly restaurante_id: string;
  readonly tipo_evento: string;
  readonly carga: Record<string, unknown>;
}

class FilaQueAnota implements FilaDeJobs {
  readonly pedidos: PedidoDeJob[] = [];
  enfileirar(pedido: PedidoDeJob) {
    this.pedidos.push(pedido);
    return Promise.resolve({ situacao: 'enfileirado' as const, atrasoMs: pedido.atrasoMs ?? 0 });
  }
}

function comoAdmin<T extends Record<string, unknown>>(texto: string, valores: unknown[] = []) {
  return consultarComUrl<T>(inject('bancoDeTeste').urlAdmin, texto, valores);
}

describe('mídia no worker (Postgres, Garage e FFmpeg reais)', { timeout: 120_000 }, () => {
  let banco: AcessoAoBanco;
  let armazenamento: ArmazenamentoS3;
  let amostras: Amostras;
  let filas: FilaQueAnota;
  let dependencias: DependenciasDoProcessamento;

  beforeAll(async () => {
    const ambiente = esquemaAmbienteWorker.parse({
      NODE_ENV: 'test',
      APP_ENV: 'local',
      URL_BANCO_WORKER: inject('bancoDeTeste').urlWorker,
      URL_REDIS: 'redis://127.0.0.1:6379/15',
      ...VARIAVEIS,
      ...VARIAVEIS_DO_MERCADO_PAGO_DE_TESTE,
    });
    banco = criarBanco({
      runtime: { url: ambiente.URL_BANCO_WORKER, nomeAplicacao: 'teste-worker-midia' },
      relator: relatorMudo,
    });
    armazenamento = criarArmazenamentoS3({
      endpoint: VARIAVEIS.URL_ARMAZENAMENTO,
      regiao: VARIAVEIS.REGIAO_ARMAZENAMENTO,
      chave: VARIAVEIS.CHAVE_ARMAZENAMENTO,
      segredo: VARIAVEIS.SEGREDO_ARMAZENAMENTO,
      bucketOriginais: VARIAVEIS.BUCKET_ORIGINAIS,
      bucketPublico: VARIAVEIS.BUCKET_PUBLICO,
      urlPublica: VARIAVEIS.URL_PUBLICA_MIDIA,
    });
    filas = new FilaQueAnota();
    dependencias = dependenciasDoProcessamento(ambiente, banco, filas, armazenamento);
    amostras = await criarAmostras();
  }, 60_000);

  afterAll(async () => {
    armazenamento.encerrar();
    await banco.encerrar();
    await rm(amostras.pasta, { recursive: true, force: true });
  });

  async function pratoNovo() {
    const restauranteId = randomUUID();
    const slug = `midia-${restauranteId.slice(0, 8)}`;
    await comoAdmin(
      `WITH r AS (INSERT INTO restaurantes (id, slug, nome, situacao) VALUES ($1, $2, 'Restaurante da mídia', 'teste'))
       INSERT INTO historico_slugs (restaurante_id, slug) VALUES ($1, $2)`,
      [restauranteId, slug],
    );
    const acesso = { restauranteId, papel: 'dono' } as const;
    const cardapio = { cardapio: criarRepositorioDoCardapio(banco) };
    const categoria = await criarCategoria(cardapio, acesso, { nome: 'Principais' });
    const prato = await criarPrato(cardapio, acesso, {
      categoriaId: categoria.ok ? categoria.valor.id : '',
      nome: 'Costela',
      descricao: '',
      precoCentavos: 8900,
      disponivel: true,
      destaque: false,
    });
    return { acesso, pratoId: prato.ok ? prato.valor.id : '' };
  }

  async function enviar(
    acesso: { restauranteId: string; papel: 'dono' },
    pratoId: string,
    arquivo: string,
    tipo = 'video/mp4',
  ) {
    const conteudo = await readFile(arquivo);
    const envio = await solicitarEnvioDeMidia(dependencias, acesso, pratoId, {
      tipoConteudo: tipo,
      tamanhoBytes: conteudo.byteLength,
    });
    if (!envio.ok) {
      throw new Error(envio.erro.codigo);
    }
    const resposta = await fetch(envio.valor.url, {
      method: 'PUT',
      body: conteudo,
      headers: envio.valor.cabecalhos,
    });
    expect(resposta.status).toBe(200);
    expect((await confirmarEnvioDeMidia(dependencias, acesso, envio.valor.midiaId)).ok).toBe(true);
    return envio.valor.midiaId;
  }

  async function jobDoEvento(restauranteId: string, tipo: string, midiaId: string) {
    const [evento] = await comoAdmin<EventoDaCaixa>(
      `SELECT id, restaurante_id, tipo_evento, carga FROM caixa_saida
        WHERE restaurante_id = $1 AND tipo_evento = $2 AND carga->>'midiaId' = $3
        ORDER BY criado_em DESC LIMIT 1`,
      [restauranteId, tipo, midiaId],
    );
    if (evento === undefined) {
      throw new Error(`sem evento ${tipo}`);
    }
    return { eventoId: evento.id, tipo, carga: evento.carga, restauranteId };
  }

  async function processar(restauranteId: string, midiaId: string, deps = dependencias) {
    const processador = processadoresDaMidia(deps)['processar-midia'];
    return processador?.({
      nome: 'processar-midia',
      dados: await jobDoEvento(restauranteId, 'MidiaEnviada', midiaId),
    });
  }

  it('vídeo real: derivados até 600 KB no bucket público, prato com vídeo e original agendado para 7 dias', async () => {
    const { acesso, pratoId } = await pratoNovo();
    const midiaId = await enviar(acesso, pratoId, amostras.videoLongo);

    expect(await processar(acesso.restauranteId, midiaId)).toBe('publicada');
    const cardapio = await criarFonteDoCardapioPublico(banco).ler(acesso.restauranteId);
    const derivados = cardapio.midias[pratoId];
    expect(derivados?.tipo).toBe('video');
    if (derivados?.tipo !== 'video') {
      return;
    }
    for (const arquivo of [derivados.mp4, derivados.webm, derivados.capa]) {
      const objeto = await armazenamento.consultar('publica', arquivo.caminho);
      expect(objeto?.tamanhoBytes).toBe(arquivo.bytes);
      expect(arquivo.bytes).toBeLessThanOrEqual(LIMITE_DO_DERIVADO);
    }
    expect(derivados.duracaoMs).toBe(10_000);
    expect(filas.pedidos.at(-1)).toMatchObject({
      nome: 'apagar-original-midia',
      dados: { midiaId },
      atrasoMs: 7 * 24 * 60 * 60 * 1000,
    });
  });

  it('nenhuma transação fica aberta enquanto o FFmpeg roda: o banco aceita mexer na mídia no meio', async () => {
    const { acesso, pratoId } = await pratoNovo();
    const midiaId = await enviar(acesso, pratoId, amostras.foto, 'image/jpeg');
    let liberar: () => void = () => undefined;
    const portao = new Promise<void>((resolver) => {
      liberar = resolver;
    });
    let observado: { abertas: number; travas: number } | undefined;
    const lento: ProcessadorDeMidia = {
      sondar: (arquivo, tipo) => dependencias.processador.sondar(arquivo, tipo),
      async gerar(arquivo, plano, pasta) {
        const abertas = await comoAdmin<{ total: string }>(
          `SELECT count(*) AS total FROM pg_stat_activity
            WHERE application_name = 'teste-worker-midia' AND state LIKE 'idle in transaction%'`,
        );
        const travas = await comoAdmin<{ total: string }>(
          `SELECT count(*) AS total FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
            WHERE a.application_name = 'teste-worker-midia' AND l.relation = 'public.midias'::regclass`,
        );
        observado = { abertas: Number(abertas[0]?.total), travas: Number(travas[0]?.total) };
        await portao;
        return dependencias.processador.gerar(arquivo, plano, pasta);
      },
    };
    const emAndamento = processar(acesso.restauranteId, midiaId, { ...dependencias, processador: lento });
    await new Promise((resolver) => setTimeout(resolver, 1500));
    liberar();

    expect(await emAndamento).toBe('publicada');
    expect(observado).toEqual({ abertas: 0, travas: 0 });
  });

  it('arquivo ruim é recusado sem travar a fila: o prato continua com a mídia anterior', async () => {
    const { acesso, pratoId } = await pratoNovo();
    const boa = await enviar(acesso, pratoId, amostras.foto, 'image/jpeg');
    await processar(acesso.restauranteId, boa);
    const ruim = await enviar(acesso, pratoId, amostras.soAudio);

    const inicio = Date.now();
    expect(await processar(acesso.restauranteId, ruim)).toBe('recusada');
    expect(Date.now() - inicio).toBeLessThan(10_000);
    const [linha] = await comoAdmin<{ situacao: string; motivo_falha: string }>(
      'SELECT situacao, motivo_falha FROM midias WHERE id = $1',
      [ruim],
    );
    expect(linha).toEqual({ situacao: 'falhou', motivo_falha: 'sem_video' });
    const cardapio = await criarFonteDoCardapioPublico(banco).ler(acesso.restauranteId);
    expect(cardapio.midias[pratoId]?.tipo).toBe('foto');
  });

  it('reprocessar o mesmo job não duplica derivados; trocar manda a antiga para a limpeza, que apaga do armazenamento', async () => {
    const { acesso, pratoId } = await pratoNovo();
    const antiga = await enviar(acesso, pratoId, amostras.foto, 'image/jpeg');
    await processar(acesso.restauranteId, antiga);
    expect(await processar(acesso.restauranteId, antiga)).toBe('ignorado');
    const prefixo = `r/${acesso.restauranteId}/midias/${antiga}/`;
    const [antes] = await comoAdmin<{ derivados: { imagem: { variantes: unknown[] } } }>(
      'SELECT derivados FROM midias WHERE id = $1',
      [antiga],
    );
    expect(antes?.derivados.imagem.variantes).toHaveLength(8);

    const nova = await enviar(acesso, pratoId, amostras.foto, 'image/jpeg');
    await processar(acesso.restauranteId, nova);
    const descartar = processadoresDaMidia(dependencias)['descartar-midia'];
    const apagados = await descartar?.({
      nome: 'descartar-midia',
      dados: await jobDoEvento(acesso.restauranteId, 'MidiaDescartada', antiga),
    });

    expect(apagados).toBe(9);
    expect(await armazenamento.consultar('publica', `${prefixo}imagem-320.webp`)).toBeNull();
    expect(await armazenamento.consultar('originais', `${prefixo}original`)).toBeNull();
    expect(
      await armazenamento.consultar('originais', `r/${acesso.restauranteId}/midias/${nova}/original`),
    ).not.toBeNull();
  });

  it('apagar o original (7 dias depois) mantém os derivados', async () => {
    const { acesso, pratoId } = await pratoNovo();
    const midiaId = await enviar(acesso, pratoId, amostras.foto, 'image/jpeg');
    await processar(acesso.restauranteId, midiaId);
    const apagar = processadoresDaMidia(dependencias)['apagar-original-midia'];

    expect(
      await apagar?.({
        nome: 'apagar-original-midia',
        dados: { restauranteId: acesso.restauranteId, midiaId },
      }),
    ).toBe(true);
    const prefixo = `r/${acesso.restauranteId}/midias/${midiaId}/`;
    expect(await armazenamento.consultar('originais', `${prefixo}original`)).toBeNull();
    expect(await armazenamento.consultar('publica', `${prefixo}imagem-320.avif`)).not.toBeNull();
  });
});
