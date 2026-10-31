import {
  rotaCom,
  ROTAS_DA_EQUIPE as FILA,
  ROTAS_DO_PEDIDO as PEDIDO,
  type RespostaFila,
} from '@cardapio/contratos';
import { ROTAS_DO_TEMPO_REAL } from '@cardapio/contratos/publico';
import { criarRedis } from '@cardapio/infraestrutura';
import { consultarComUrl } from '@cardapio/infraestrutura/testes';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { comporApi } from '../index.ts';
import { abrirClienteNaMesa, ambienteDeTeste, enviarComChave, HOSTS, uuidv7 } from './mesa-apoio.ts';
import type { Navegador } from './navegador.ts';
import { abrirSse } from './sse-apoio.ts';

let servidor: FastifyInstance;
let redis: ReturnType<typeof criarRedis>;

beforeAll(async () => {
  servidor = comporApi(ambienteDeTeste());
  await servidor.listen({ host: '127.0.0.1', port: 0 });
  redis = criarRedis(inject('urlRedisDeTeste'), { reportar: () => '', registrarPasso: () => undefined });
});

afterAll(async () => {
  redis.disconnect();
  await servidor.close();
});

async function restauranteDo(slug: string): Promise<string> {
  const [linha] = await consultarComUrl<{ id: string }>(
    inject('bancoDeTeste').urlAdmin,
    'SELECT id FROM restaurantes WHERE slug = $1',
    [slug],
  );
  return linha?.id ?? '';
}

function publicar(restauranteId: string, tipo: string, dados: Record<string, unknown>) {
  return redis.publish(
    `r:${restauranteId}:tempo-real`,
    JSON.stringify({
      id: uuidv7(),
      tipo,
      restaurante_id: restauranteId,
      ocorrido_em: new Date().toISOString(),
      versao: 1,
      dados,
    }),
  );
}

async function mesaComPedido(nome: string) {
  const mesa = await abrirClienteNaMesa(servidor, nome);
  const pedido = (await enviarComChave(servidor, mesa.cliente, PEDIDO.pedidos, { itens: mesa.itens })).json<{
    id: string;
  }>();
  return { ...mesa, pedidoId: pedido.id, restauranteId: await restauranteDo(mesa.slug) };
}

const fila = async (dono: Navegador) => (await dono.pedir('GET', FILA.fila)).json<RespostaFila>();

describe('fila da equipe pela API', () => {
  it('avança na ordem; ação repetida dá 409 com a situação atual; cancelar exige motivo', async () => {
    const { dono, pedidoId } = await mesaComPedido('Fila API');
    const avancar = (situacaoEsperada: string) =>
      dono.navegador.pedir('POST', rotaCom(FILA.avancoDoPedido, { id: pedidoId }), { situacaoEsperada });

    expect((await avancar('enviado')).statusCode).toBe(204);
    const repetido = await avancar('enviado');
    expect(repetido.statusCode).toBe(409);
    expect(repetido.json()).toMatchObject({ detalhes: { situacaoAtual: 'em_preparo' } });

    const semMotivo = await dono.navegador.pedir(
      'POST',
      rotaCom(FILA.cancelamentoDoPedido, { id: pedidoId }),
      {
        situacaoEsperada: 'em_preparo',
        motivo: '',
      },
    );
    expect(semMotivo.statusCode).toBe(422);
    expect((await fila(dono.navegador)).pedidos.map((p) => p.situacao)).toEqual(['em_preparo']);
  });

  it('nenhuma rota da fila aceita restaurante_id do cliente: o corpo com ele é recusado', async () => {
    const { dono, pedidoId } = await mesaComPedido('Fila sem id');
    const resposta = await dono.navegador.pedir('POST', rotaCom(FILA.avancoDoPedido, { id: pedidoId }), {
      situacaoEsperada: 'enviado',
      restaurante_id: uuidv7(),
    });
    expect(resposta.statusCode).toBe(400);
  });

  it('B não mexe no pedido de A', async () => {
    const a = await mesaComPedido('Fila A');
    const b = await mesaComPedido('Fila B');
    const resposta = await b.dono.navegador.pedir('POST', rotaCom(FILA.avancoDoPedido, { id: a.pedidoId }), {
      situacaoEsperada: 'enviado',
    });
    expect(resposta.statusCode).toBe(404);
  });
});

describe('tempo real por SSE', () => {
  it('sem sessão do painel: 401; sem cookie da mesa: 401', async () => {
    const painel = await abrirSse(servidor, HOSTS.painel, ROTAS_DO_TEMPO_REAL.painel);
    const mesa = await abrirSse(servidor, HOSTS.cardapio, ROTAS_DO_TEMPO_REAL.mesa);
    expect([painel.status, mesa.status]).toEqual([401, 401]);
  });

  it('A nunca recebe os eventos de B', async () => {
    const a = await mesaComPedido('SSE A');
    const b = await mesaComPedido('SSE B');
    const fluxoA = await abrirSse(servidor, HOSTS.painel, ROTAS_DO_TEMPO_REAL.painel, a.dono.navegador);
    await vi.waitFor(() => {
      expect(fluxoA.eventos).toEqual(['pronto']);
    });

    await publicar(b.restauranteId, 'PedidoCriado', { pedidoId: uuidv7(), numero: 1, mesaId: uuidv7() });
    await publicar(a.restauranteId, 'ChamadoCriado', {
      chamadoId: uuidv7(),
      tipo: 'garcom',
      mesaId: uuidv7(),
    });

    await vi.waitFor(() => {
      expect(fluxoA.eventos).toEqual(['pronto', 'ChamadoCriado']);
    });
    fluxoA.fechar();
  });

  it('a mesa só recebe o que é da própria sessão', async () => {
    const a = await mesaComPedido('SSE mesa');
    const [linha] = await consultarComUrl<{ id: string }>(
      inject('bancoDeTeste').urlAdmin,
      'SELECT id FROM sessoes_mesa WHERE restaurante_id = $1 AND fechada_em IS NULL',
      [a.restauranteId],
    );
    const sessaoMesaId = linha?.id ?? '';
    const fluxo = await abrirSse(servidor, HOSTS.cardapio, ROTAS_DO_TEMPO_REAL.mesa, a.cliente);
    await vi.waitFor(() => {
      expect(fluxo.eventos).toEqual(['pronto']);
    });

    const base = { pedidoId: a.pedidoId, numero: 1, mesaId: uuidv7(), de: 'enviado', para: 'em_preparo' };
    await publicar(a.restauranteId, 'PedidoSituacaoAlterada', { ...base, sessaoMesaId: uuidv7() });
    await publicar(a.restauranteId, 'PedidoSituacaoAlterada', { ...base, sessaoMesaId });

    await vi.waitFor(() => {
      expect(fluxo.eventos).toEqual(['pronto', 'PedidoSituacaoAlterada']);
    });
    fluxo.fechar();
  });

  it('o Redis cai: o fluxo termina, o painel reconecta, reconsulta e converge', async () => {
    const { dono, pedidoId } = await mesaComPedido('SSE queda');
    const fluxo = await abrirSse(servidor, HOSTS.painel, ROTAS_DO_TEMPO_REAL.painel, dono.navegador);
    await vi.waitFor(() => {
      expect(fluxo.eventos).toEqual(['pronto']);
    });

    const clientes = String(await redis.client('LIST'));
    for (const [, id, nome] of clientes.matchAll(/^id=(\d+) .*? name=(\S*)/gm)) {
      if (nome === 'tempo-real' && id !== undefined) {
        await redis.client('KILL', 'ID', id);
      }
    }
    await fluxo.terminou;
    await dono.navegador.pedir('POST', rotaCom(FILA.avancoDoPedido, { id: pedidoId }), {
      situacaoEsperada: 'enviado',
    });

    const novo = await vi.waitFor(
      async () => {
        const tentativa = await abrirSse(servidor, HOSTS.painel, ROTAS_DO_TEMPO_REAL.painel, dono.navegador);
        expect(tentativa.status).toBe(200);
        return tentativa;
      },
      { timeout: 3000, interval: 50 },
    );
    await vi.waitFor(() => {
      expect(novo.eventos).toEqual(['pronto']);
    });
    expect((await fila(dono.navegador)).pedidos.map((p) => p.situacao)).toEqual(['em_preparo']);
    novo.fechar();
  });
});
