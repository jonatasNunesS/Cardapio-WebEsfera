import {
  aplicarInadimplencia,
  conciliarCobrancas,
  escolherPlanoEAssinar,
  obterLimiteDeMesas,
  processarEventoPagamento,
  TOPICOS_DE_PAGAMENTO,
  type GatewayPagamento,
  type PedidoDeJob,
} from '@cardapio/aplicacao';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarGatewayMercadoPago } from './gateway-mercado-pago.ts';
import { criarMercadoPagoFalso, type MercadoPagoFalso } from './mercado-pago-falso.ts';
import type { AcessoAoBanco } from '../banco/banco.ts';
import {
  criarEventosDePagamento,
  criarRegistroDeAvisos,
  criarRestaurantesParaCobranca,
} from '../banco/cobranca/eventos-de-pagamento.ts';
import { criarRepositorioDeAssinaturas } from '../banco/cobranca/repositorio-de-assinaturas.ts';
import { criarRepositorioDeMesas } from '../banco/mesas/repositorio-de-mesas.ts';
import { criarRepositorioMesas } from '../banco/mesas/repositorio-mesas.ts';
import {
  abrirBanco,
  consultarComoAdmin,
  criarRelatorDeTeste,
  criarRestauranteDeTeste,
} from '../banco/testes/apoio.ts';

const TOKEN = 'TEST-token-falso';
const relogio = { agora: () => new Date() };

let falso: MercadoPagoFalso;
let api: AcessoAoBanco;
let worker: AcessoAoBanco;
let gateway: GatewayPagamento;

beforeAll(async () => {
  falso = criarMercadoPagoFalso({ tokenDeAcesso: TOKEN, segredoDoWebhook: 'segredo' });
  gateway = criarGatewayMercadoPago({ url: await falso.ouvir(), tokenDeAcesso: TOKEN, tempoMaximoMs: 5000 });
  api = abrirBanco('api');
  worker = abrirBanco('worker');
});

afterAll(async () => {
  await Promise.all([api.encerrar(), worker.encerrar(), falso.encerrar()]);
});

const dependenciasDaApi = () => ({
  assinaturas: criarRepositorioDeAssinaturas(api),
  gateway,
  relogio,
  urlDeRetorno: 'https://painel.exemplo.com.br/plano',
});

const dependenciasDoWorker = (alvo: GatewayPagamento = gateway) => ({
  assinaturas: criarRepositorioDeAssinaturas(worker),
  gateway: alvo,
  eventos: criarEventosDePagamento(worker),
  relator: criarRelatorDeTeste(),
  relogio,
});

async function restauranteAssinado(plano = 'basico') {
  const { id, slug } = await criarRestauranteDeTeste(api);
  const resultado = await escolherPlanoEAssinar(
    dependenciasDaApi(),
    { restauranteId: id, papel: 'dono' },
    { codigoDoPlano: plano, emailDoPagador: 'dono@exemplo.com.br', chaveDeIdempotencia: randomUUID() },
  );
  if (!resultado.ok) {
    throw new Error(resultado.erro.codigo);
  }
  const [linha] = await consultarComoAdmin<{ mp_assinatura_id: string }>(
    'SELECT mp_assinatura_id FROM assinaturas WHERE restaurante_id = $1',
    [id],
  );
  return { id, slug, mpId: linha?.mp_assinatura_id ?? '', initPoint: resultado.valor.initPoint };
}

async function aviso(topico: string, recursoId: string) {
  const registrado = await criarRegistroDeAvisos(api).registrar({
    xRequestId: randomUUID(),
    topico,
    recursoId,
  });
  return registrado.eventoId;
}

const situacao = async (id: string) =>
  (await consultarComoAdmin<{ situacao: string }>('SELECT situacao FROM restaurantes WHERE id = $1', [id]))[0]
    ?.situacao;

const eventosDaCaixa = (id: string) =>
  consultarComoAdmin<{ tipo_evento: string; carga: unknown }>(
    'SELECT tipo_evento, carga FROM caixa_saida WHERE restaurante_id = $1 ORDER BY criado_em, id',
    [id],
  );

describe('assinatura e cobrança no Postgres com o Mercado Pago falso', () => {
  it('EscolherPlanoEAssinar grava a assinatura pendente com o external_reference do restaurante', async () => {
    const { id, mpId, initPoint } = await restauranteAssinado();

    expect(falso.assinaturas.get(mpId)?.external_reference).toBe(id);
    expect(initPoint).toBe(falso.assinaturas.get(mpId)?.init_point);
    expect(await obterLimiteDeMesas({ assinaturas: criarRepositorioDeAssinaturas(api) }, id)).toBe(30);
  });

  it('dois avisos do mesmo pagamento mudam a assinatura uma vez e emitem o evento uma vez', async () => {
    const { id, mpId } = await restauranteAssinado();
    await falso.autorizar(mpId);
    const cobranca = await falso.cobrar(mpId, 'approved');

    await processarEventoPagamento(
      dependenciasDoWorker(),
      await aviso(TOPICOS_DE_PAGAMENTO.assinatura, mpId),
    );
    const primeiro = await processarEventoPagamento(
      dependenciasDoWorker(),
      await aviso(TOPICOS_DE_PAGAMENTO.cobranca, cobranca),
    );
    const segundo = await processarEventoPagamento(
      dependenciasDoWorker(),
      await aviso(TOPICOS_DE_PAGAMENTO.cobranca, cobranca),
    );

    expect([primeiro, segundo]).toEqual(['aplicado', 'sem-mudanca']);
    expect(await situacao(id)).toBe('ativo');
    expect((await eventosDaCaixa(id)).map((e) => e.tipo_evento)).toEqual([
      'AssinaturaAlterada',
      'RestauranteSituacaoAlterada',
    ]);
    const [linha] = await consultarComoAdmin<{ situacao: string; paga_em: Date | null }>(
      'SELECT situacao, paga_em FROM cobrancas WHERE restaurante_id = $1',
      [id],
    );
    expect(linha?.situacao).toBe('paga');
    expect(await obterLimiteDeMesas({ assinaturas: criarRepositorioDeAssinaturas(api) }, id)).toBe(10);
  });

  it('nenhuma transação fica aberta enquanto o Mercado Pago responde devagar', async () => {
    const { mpId } = await restauranteAssinado();
    await falso.autorizar(mpId);
    const abertas: number[] = [];
    const contarAbertas = async () => {
      await new Promise((resolver) => setTimeout(resolver, 300));
      const [linha] = await consultarComoAdmin<{ total: number }>(
        `SELECT count(*)::int AS total FROM pg_stat_activity
          WHERE application_name LIKE 'teste-worker%' AND state LIKE 'idle in transaction%'`,
      );
      return linha?.total ?? -1;
    };
    const lento: GatewayPagamento = {
      ...gateway,
      async consultarAssinatura(idDaAssinatura) {
        abertas.push(await contarAbertas());
        return gateway.consultarAssinatura(idDaAssinatura);
      },
    };
    const controle = await worker.comSistema(() => contarAbertas());
    expect(controle).toBeGreaterThan(0);

    await processarEventoPagamento(
      dependenciasDoWorker(lento),
      await aviso(TOPICOS_DE_PAGAMENTO.assinatura, mpId),
    );

    expect(abertas).toEqual([0]);
  });

  it('a reconsulta falha: nada muda e o evento fica sem processado_em', async () => {
    const { id, mpId } = await restauranteAssinado();
    await falso.autorizar(mpId);
    const cobranca = await falso.cobrar(mpId, 'approved');
    const eventoId = await aviso(TOPICOS_DE_PAGAMENTO.cobranca, cobranca);
    falso.definirFora(true);

    await expect(processarEventoPagamento(dependenciasDoWorker(), eventoId)).rejects.toMatchObject({
      dependencia: { statusHttp: 503 },
    });
    falso.definirFora(false);

    expect(await situacao(id)).toBe('teste');
    const [evento] = await consultarComoAdmin<{ processado_em: Date | null; tentativas: number }>(
      'SELECT processado_em, tentativas FROM eventos_pagamento WHERE id = $1',
      [eventoId],
    );
    expect(evento).toEqual({ processado_em: null, tentativas: 1 });
  });

  it('a conciliação reenfileira uma vez o evento sem processado_em', async () => {
    const eventoId = await aviso(TOPICOS_DE_PAGAMENTO.assinatura, randomBytes(8).toString('hex'));
    await consultarComoAdmin(
      "UPDATE eventos_pagamento SET recebido_em = now() - interval '1 hour' WHERE id = $1",
      [eventoId],
    );
    const pedidos: PedidoDeJob[] = [];
    const filas = {
      enfileirar: (pedido: PedidoDeJob) => {
        pedidos.push(pedido);
        return Promise.resolve({ situacao: 'enfileirado' as const, atrasoMs: 0 });
      },
    };
    const rotinas = {
      assinaturas: criarRepositorioDeAssinaturas(worker),
      eventos: criarEventosDePagamento(worker),
      restaurantes: criarRestaurantesParaCobranca(worker),
      filas,
      relogio,
    };

    await conciliarCobrancas(rotinas);
    const doEvento = pedidos.filter((pedido) => pedido.nome === 'processar-evento-pagamento');

    expect(doEvento.filter((pedido) => pedido.dados.eventoId === eventoId)).toHaveLength(1);
    expect(pedidos.some((pedido) => pedido.nome === 'conciliar-assinatura')).toBe(true);
  });

  it('dia 15: pedidos suspensos, o cardápio continua respondendo e o pagamento reativa', async () => {
    const { id, slug, mpId } = await restauranteAssinado();
    const mesas = criarRepositorioDeMesas(api);
    const mesa = await mesas.criar(
      id,
      { numero: 1, nome: null, area: null, codigo: randomBytes(16).toString('base64url') },
      30,
      { usuarioId: null },
    );
    await consultarComoAdmin(
      "UPDATE restaurantes SET teste_termina_em = now() - interval '20 days' WHERE id = $1",
      [id],
    );
    const rotinas = {
      assinaturas: criarRepositorioDeAssinaturas(worker),
      restaurantes: criarRestaurantesParaCobranca(worker),
      relogio,
    };

    await aplicarInadimplencia(rotinas);
    expect(await situacao(id)).toBe('inadimplente');
    const codigo = mesa.tipo === 'ok' ? mesa.mesa.codigo : '';
    expect((await criarRepositorioMesas(api).resolverMesa(slug, 1, codigo)).situacao).toBe('valida');

    await falso.autorizar(mpId);
    const cobranca = await falso.cobrar(mpId, 'approved');
    await processarEventoPagamento(
      dependenciasDoWorker(),
      await aviso(TOPICOS_DE_PAGAMENTO.cobranca, cobranca),
    );
    expect(await situacao(id)).toBe('ativo');
  });

  it('com o Básico autorizado, criar mesa acima de 10 é recusado', async () => {
    const { id, mpId } = await restauranteAssinado();
    await falso.autorizar(mpId);
    await processarEventoPagamento(
      dependenciasDoWorker(),
      await aviso(TOPICOS_DE_PAGAMENTO.assinatura, mpId),
    );
    const limite = await obterLimiteDeMesas({ assinaturas: criarRepositorioDeAssinaturas(api) }, id);
    const mesas = criarRepositorioDeMesas(api);
    const desfechos = [];
    for (let numero = 1; numero <= 11; numero += 1) {
      desfechos.push(
        (
          await mesas.criar(
            id,
            { numero, nome: null, area: null, codigo: randomBytes(16).toString('base64url') },
            limite,
            { usuarioId: null },
          )
        ).tipo,
      );
    }

    expect(limite).toBe(10);
    expect(desfechos.filter((tipo) => tipo === 'ok')).toHaveLength(10);
    expect(desfechos.at(-1)).toBe('limite');
  });
});
