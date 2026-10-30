import {
  COOKIE_DA_SESSAO_DE_MESA,
  gerarUuidV7,
  rotaCom,
  ROTAS_DAS_MESAS_NO_PAINEL as MESAS,
  ROTAS_DO_CARDAPIO_NO_PAINEL as CARDAPIO,
  ROTAS_DO_CARDAPIO_PUBLICO as PUBLICO,
  ROTAS_DO_PEDIDO as PEDIDO,
  type CategoriaNoPainel,
  type PratoNoPainel,
  type RespostaMesasDoPainel,
  type RespostaPedido,
} from '@cardapio/contratos';
import {
  consultarComUrl,
  VARIAVEIS_DO_ARMAZENAMENTO_DE_TESTE,
  VARIAVEIS_DO_MERCADO_PAGO_DE_TESTE,
} from '@cardapio/infraestrutura/testes';
import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { esquemaAmbienteApi } from '../../ambiente.ts';
import { comporApi } from '../index.ts';
import { donoComRestaurante, ipUnico, Navegador } from './navegador.ts';

const uuidv7 = () => gerarUuidV7(Date.now(), randomBytes(10));
const HOSTS = { painel: 'painel.localhost', cardapio: 'cardapio.localhost' };

function comoAdmin(texto: string, valores: unknown[]) {
  return consultarComUrl<Record<string, unknown>>(inject('bancoDeTeste').urlAdmin, texto, valores);
}

describe('pedido pela API da mesa', () => {
  let servidor: FastifyInstance;

  beforeAll(async () => {
    servidor = comporApi(
      esquemaAmbienteApi.parse({
        NODE_ENV: 'test',
        APP_ENV: 'local',
        PORTA_API: '3000',
        URL_BANCO_API: inject('bancoDeTeste').urlApi,
        URL_REDIS: inject('urlRedisDeTeste'),
        DOMINIO_CARDAPIO: HOSTS.cardapio,
        DOMINIO_PAINEL: HOSTS.painel,
        DOMINIO_ADMIN: 'admin.localhost',
        URL_PAINEL: 'http://painel.localhost:5173',
        CHAVE_CIFRA_TOTP: Buffer.alloc(32, 7).toString('base64'),
        CHAVE_SESSAO_MESA: 'mesa-teste-mesa-teste-mesa-teste-mesa',
        ...VARIAVEIS_DO_ARMAZENAMENTO_DE_TESTE,
        ...VARIAVEIS_DO_MERCADO_PAGO_DE_TESTE,
      }),
    );
    await servidor.ready();
  });

  afterAll(async () => {
    await servidor.close();
  });

  async function clienteNaMesa(nome: string) {
    const dono = await donoComRestaurante(servidor, HOSTS.painel, nome);
    const categoria = (
      await dono.navegador.pedir('POST', CARDAPIO.categorias, { nome: 'Principais' })
    ).json<CategoriaNoPainel>();
    const novoPrato = async (nomeDoPrato: string, precoCentavos: number) =>
      (
        await dono.navegador.pedir('POST', CARDAPIO.pratos, {
          categoriaId: categoria.id,
          nome: nomeDoPrato,
          descricao: '',
          precoCentavos,
          disponivel: true,
          destaque: false,
        })
      ).json<PratoNoPainel>();
    const picanha = await novoPrato('Picanha', 8900);
    const suco = await novoPrato('Suco', 1200);
    await dono.navegador.pedir('POST', MESAS.mesas, { numero: 4, nome: null, area: null });
    const link = new URL(
      (await dono.navegador.pedir('GET', MESAS.mesas)).json<RespostaMesasDoPainel>().mesas[0]?.link ?? '',
    );
    const cliente = new Navegador(servidor, HOSTS.cardapio, ipUnico());
    await cliente.pedir(
      'GET',
      `${link.pathname.replace(/^\/([^/]+)\/mesa\//, '/api/v1/cardapios/$1/mesa/')}${link.search}`,
    );
    const itens = [
      { pratoId: picanha.id, quantidade: 2, observacao: 'ao ponto' },
      { pratoId: suco.id, quantidade: 1, observacao: '' },
    ];
    return { dono, cliente, picanha, suco, itens, slug: dono.slug };
  }

  const enviar = (cliente: Navegador, corpo: object, chave: string | null = uuidv7()) =>
    servidor.inject({
      method: 'POST',
      url: PEDIDO.pedidos,
      remoteAddress: cliente.ip,
      headers: {
        host: HOSTS.cardapio,
        cookie: [...cliente.cookies].map(([nome, valor]) => `${nome}=${valor}`).join('; '),
        ...(chave === null ? {} : { 'idempotency-key': chave }),
      },
      payload: corpo,
    });

  it('cria o pedido com preço do servidor; o reenvio com a mesma chave devolve o mesmo pedido', async () => {
    const { cliente, itens } = await clienteNaMesa('Pedido feliz');
    const chave = uuidv7();
    const primeiro = await enviar(cliente, { itens }, chave);
    const reenvio = await enviar(cliente, { itens }, chave);
    const pedido = primeiro.json<RespostaPedido>();

    expect(primeiro.statusCode).toBe(201);
    expect(reenvio.statusCode).toBe(200);
    expect(reenvio.json()).toEqual(pedido);
    expect(pedido).toMatchObject({ numero: 1, situacao: 'enviado', totalCentavos: 8900 * 2 + 1200 });
    const consulta = await cliente.pedir('GET', rotaCom(PEDIDO.pedido, { id: pedido.id }));
    expect(consulta.json()).toEqual(pedido);
  });

  it('recusa sem Idempotency-Key, com chave que não é uuid v7, com preço no corpo e com restauranteId no corpo', async () => {
    const { cliente, itens } = await clienteNaMesa('Pedido recusas');
    const semChave = await enviar(cliente, { itens }, null);
    const chaveV4 = await enviar(cliente, { itens }, '6f2b1c4e-9a7d-4e3b-8c1a-2d5f6e7a8b9c');
    const comPreco = await enviar(cliente, { itens: [{ ...itens[0], precoCentavos: 1 }] });
    const comTotal = await enviar(cliente, { itens, totalCentavos: 1 });
    const comRestaurante = await enviar(cliente, { itens, restauranteId: uuidv7() });

    expect([semChave, chaveV4, comPreco, comTotal, comRestaurante].map((r) => r.statusCode)).toEqual([
      400, 400, 400, 400, 400,
    ]);
  });

  it('a mesma chave com outro carrinho dá 422', async () => {
    const { cliente, itens } = await clienteNaMesa('Pedido chave');
    const chave = uuidv7();
    await enviar(cliente, { itens }, chave);
    const outro = await enviar(cliente, { itens: itens.slice(1) }, chave);

    expect(outro.statusCode).toBe(422);
    expect(outro.json()).toMatchObject({ codigo: 'PEDIDO_CRIAR_CHAVE_REUSADA' });
  });

  it('prato esgotado entre montar e enviar: 409 com os ids, nada gravado', async () => {
    const { cliente, itens, suco } = await clienteNaMesa('Pedido esgotado');
    await comoAdmin('UPDATE pratos SET disponivel = false WHERE id = $1', [suco.id]);
    const resposta = await enviar(cliente, { itens });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json()).toMatchObject({
      codigo: 'PEDIDO_CRIAR_ITEM_INDISPONIVEL',
      detalhes: { pratoIds: [suco.id] },
    });
  });

  it('inadimplente recusa o pedido, e o cardápio segue respondendo', async () => {
    const { cliente, itens, slug } = await clienteNaMesa('Pedido inadimplente');
    const [restaurante] = await comoAdmin('SELECT id FROM restaurantes WHERE slug = $1', [slug]);
    await comoAdmin("UPDATE restaurantes SET situacao = 'inadimplente' WHERE id = $1", [restaurante?.id]);
    const resposta = await enviar(cliente, { itens });
    const cardapio = await cliente.pedir('GET', rotaCom(PUBLICO.cardapio, { slug }));

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ codigo: 'PEDIDO_CRIAR_RESTAURANTE_SUSPENSO' });
    expect(cardapio.statusCode).toBe(200);
  });

  it('sem cookie ou com cookie adulterado: 401 com o caminho de escanear de novo', async () => {
    const { cliente, itens } = await clienteNaMesa('Pedido sem sessão');
    const intruso = new Navegador(servidor, HOSTS.cardapio, ipUnico());
    const semCookie = await enviar(intruso, { itens });
    const valor = decodeURIComponent(cliente.cookies.get(COOKIE_DA_SESSAO_DE_MESA) ?? '');
    intruso.cookies.set(COOKIE_DA_SESSAO_DE_MESA, encodeURIComponent(`${uuidv7()}${valor.slice(36)}`));
    const adulterado = await enviar(intruso, { itens });

    expect([semCookie.statusCode, adulterado.statusCode]).toEqual([401, 401]);
    expect(semCookie.json()).toMatchObject({ codigo: 'PEDIDO_SESSAO_MESA_EXPIRADA' });
  });

  it('o cliente cancela enquanto enviado; outro cliente não vê nem cancela', async () => {
    const a = await clienteNaMesa('Pedido A');
    const b = await clienteNaMesa('Pedido B');
    const pedido = (await enviar(a.cliente, { itens: a.itens })).json<RespostaPedido>();
    const rota = rotaCom(PEDIDO.cancelamento, { id: pedido.id });

    expect((await b.cliente.pedir('GET', rotaCom(PEDIDO.pedido, { id: pedido.id }))).statusCode).toBe(404);
    expect((await b.cliente.pedir('POST', rota)).statusCode).toBe(404);
    expect((await a.cliente.pedir('POST', rota)).statusCode).toBe(204);
    expect((await a.cliente.pedir('POST', rota)).statusCode).toBe(409);
    expect((await a.cliente.pedir('GET', rotaCom(PEDIDO.pedido, { id: pedido.id }))).json()).toMatchObject({
      situacao: 'cancelado',
    });
  });

  it('as rotas do pedido só existem no host do cardápio', async () => {
    const resposta = await servidor.inject({
      method: 'POST',
      url: PEDIDO.pedidos,
      headers: { host: HOSTS.painel },
    });
    expect(resposta.statusCode).toBe(404);
  });
});
