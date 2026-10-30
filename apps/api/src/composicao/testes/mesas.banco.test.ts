import { createHmac } from 'node:crypto';
import {
  COOKIE_DA_SESSAO_DE_MESA,
  rotaCom,
  ROTAS_DA_MESA_PUBLICA as PUBLICA,
  ROTAS_DAS_MESAS_NO_PAINEL as PAINEL,
  ROTAS_DO_CARDAPIO_NO_PAINEL as CARDAPIO,
  type RespostaMesasDoPainel,
  type RespostaSessaoDeMesa,
} from '@cardapio/contratos';
import {
  consultarComUrl,
  VARIAVEIS_DO_ARMAZENAMENTO_DE_TESTE,
  VARIAVEIS_DO_MERCADO_PAGO_DE_TESTE,
} from '@cardapio/infraestrutura/testes';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { esquemaAmbienteApi } from '../../ambiente.ts';
import { comporApi } from '../index.ts';
import { donoComRestaurante, ipUnico, Navegador } from './navegador.ts';

const CHAVE = 'mesa-teste-mesa-teste-mesa-teste-mesa';
const HOSTS = { painel: 'painel.localhost', cardapio: 'cardapio.localhost' };

function caminhoDo(link: string): string {
  const url = new URL(link);
  return `${url.pathname.replace(/^\/([^/]+)\/mesa\//, '/api/v1/cardapios/$1/mesa/')}${url.search}`;
}

describe('mesas pela API', () => {
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
        CHAVE_SESSAO_MESA: CHAVE,
        ...VARIAVEIS_DO_ARMAZENAMENTO_DE_TESTE,
        ...VARIAVEIS_DO_MERCADO_PAGO_DE_TESTE,
      }),
    );
    await servidor.ready();
  });

  afterAll(async () => {
    await servidor.close();
  });

  async function donoComMesas(nome: string, numeros: readonly number[]) {
    const dono = await donoComRestaurante(servidor, HOSTS.painel, nome);
    for (const numero of numeros) {
      await dono.navegador.pedir('POST', PAINEL.mesas, { numero, nome: null, area: null });
    }
    const lista = (await dono.navegador.pedir('GET', PAINEL.mesas)).json<RespostaMesasDoPainel>();
    return { ...dono, lista };
  }

  it('cria e lista com o link canônico; restauranteId no corpo é recusado', async () => {
    const { navegador, slug, lista } = await donoComMesas('Mesas API', [2, 1]);
    const intruso = await navegador.pedir('POST', PAINEL.mesas, {
      numero: 3,
      nome: null,
      area: null,
      restauranteId: '00000000-0000-0000-0000-000000000000',
    });

    expect(lista.mesas.map((mesa) => mesa.numero)).toEqual([1, 2]);
    expect(lista.limite).toBe(30);
    expect(lista.mesas[0]?.link).toMatch(
      new RegExp(`^https://${HOSTS.cardapio}/${slug}/mesa/1\\?c=[A-Za-z0-9_-]{22}$`),
    );
    expect(intruso.statusCode).toBe(400);
  });

  it('o link abre a sessão com cookie __Host- assinado, HttpOnly, Secure, SameSite=Lax e 4 h', async () => {
    const { lista } = await donoComMesas('Mesas Cookie', [5]);
    const cliente = new Navegador(servidor, HOSTS.cardapio, ipUnico());
    const resposta = await cliente.pedir('GET', caminhoDo(lista.mesas[0]?.link ?? ''));
    const cookie = resposta.cookies.find((item) => item.name === COOKIE_DA_SESSAO_DE_MESA);
    const corpo = resposta.json<RespostaSessaoDeMesa>();

    expect(resposta.statusCode).toBe(200);
    expect(cookie).toMatchObject({ path: '/', httpOnly: true, secure: true, sameSite: 'Lax' });
    expect(cookie?.domain).toBeUndefined();
    expect(decodeURIComponent(cookie?.value ?? '')).toMatch(
      /^[0-9a-f-]{36}:[0-9a-f-]{36}\.[A-Za-z0-9+/_-]+$/,
    );
    const duracao = (cookie?.expires?.getTime() ?? 0) - Date.now();
    expect(duracao).toBeGreaterThan(4 * 60 * 60 * 1000 - 60_000);
    expect(duracao).toBeLessThanOrEqual(4 * 60 * 60 * 1000);
    expect(corpo).toMatchObject({ numero: 5 });

    const segundo = new Navegador(servidor, HOSTS.cardapio, ipUnico());
    const outra = await segundo.pedir('GET', caminhoDo(lista.mesas[0]?.link ?? ''));
    expect(outra.json<RespostaSessaoDeMesa>().expiraEm).toBe(corpo.expiraEm);
  });

  it('slug ou número desatualizado redireciona 301 para o link canônico', async () => {
    const { lista, slug } = await donoComMesas('Mesas Redireciona', [8]);
    const link = new URL(lista.mesas[0]?.link ?? '');
    const codigo = link.searchParams.get('c') ?? '';
    const cliente = new Navegador(servidor, HOSTS.cardapio, ipUnico());
    const resposta = await cliente.pedir(
      'GET',
      `${rotaCom(PUBLICA.abrir, { slug: 'outro-slug', numero: '99' })}?c=${codigo}`,
    );

    expect(resposta.statusCode).toBe(301);
    expect(resposta.headers.location).toBe(`${rotaCom(PUBLICA.abrir, { slug, numero: '8' })}?c=${codigo}`);
    expect(cliente.cookies.has(COOKIE_DA_SESSAO_DE_MESA)).toBe(false);
  });

  it('código inexistente, mesa desativada e código trocado dão 404 sem cookie', async () => {
    const { navegador, lista, slug } = await donoComMesas('Mesas Inválidas', [1, 2]);
    const [um, dois] = lista.mesas;
    await navegador.pedir('PUT', rotaCom(PAINEL.situacao, { id: um?.id ?? '' }), { ativa: false });
    await navegador.pedir('POST', rotaCom(PAINEL.codigo, { id: dois?.id ?? '' }));
    const cliente = new Navegador(servidor, HOSTS.cardapio, ipUnico());

    const respostas = await Promise.all([
      cliente.pedir('GET', `${rotaCom(PUBLICA.abrir, { slug, numero: '1' })}?c=${'A'.repeat(22)}`),
      cliente.pedir('GET', `${rotaCom(PUBLICA.abrir, { slug, numero: '1' })}?c=curto`),
      cliente.pedir('GET', caminhoDo(um?.link ?? '')),
      cliente.pedir('GET', caminhoDo(dois?.link ?? '')),
    ]);

    expect(respostas.map((resposta) => resposta.statusCode)).toEqual([404, 404, 404, 404]);
    expect(respostas.map((resposta) => resposta.json<{ codigo: string }>().codigo)).toEqual(
      Array.from({ length: 4 }, () => 'MESA_ABRIR_QR_INVALIDO'),
    );
    expect(cliente.cookies.has(COOKIE_DA_SESSAO_DE_MESA)).toBe(false);
    await navegador.pedir('PUT', rotaCom(PAINEL.situacao, { id: um?.id ?? '' }), { ativa: true });
    expect((await cliente.pedir('GET', caminhoDo(um?.link ?? ''))).statusCode).toBe(200);
  });

  it('a sessão de mesa não dá acesso ao painel, nem com o cookie copiado para o host do painel', async () => {
    const { lista } = await donoComMesas('Mesas Sem Painel', [1]);
    const cliente = new Navegador(servidor, HOSTS.cardapio, ipUnico());
    await cliente.pedir('GET', caminhoDo(lista.mesas[0]?.link ?? ''));
    const intruso = new Navegador(servidor, HOSTS.painel, ipUnico());
    for (const [nome, valor] of cliente.cookies) {
      intruso.cookies.set(nome, valor);
      intruso.cookies.set('__Host-sessao_painel', valor);
    }

    expect((await intruso.pedir('GET', PAINEL.mesas)).statusCode).toBe(401);
    expect((await intruso.pedir('GET', CARDAPIO.cardapio)).statusCode).toBe(401);
    expect((await cliente.pedir('GET', PAINEL.mesas)).statusCode).toBe(404);
  });

  it('o cookie de mesa é restaurante e sessão assinados com HMAC-SHA256 da chave do ambiente', async () => {
    const { lista } = await donoComMesas('Mesas Assinatura', [1]);
    const cliente = new Navegador(servidor, HOSTS.cardapio, ipUnico());
    await cliente.pedir('GET', caminhoDo(lista.mesas[0]?.link ?? ''));
    const valor = decodeURIComponent(cliente.cookies.get(COOKIE_DA_SESSAO_DE_MESA) ?? '');
    const conteudo = valor.slice(0, valor.lastIndexOf('.'));

    const hmac = createHmac('sha256', CHAVE).update(conteudo).digest('base64').replace(/=+$/, '');

    expect(conteudo).toMatch(/^[0-9a-f-]{36}:[0-9a-f-]{36}$/);
    expect(valor).toBe(`${conteudo}.${hmac}`);
  });

  it('isolamento: outro restaurante não lê, não edita nem baixa o QR das mesas de A', async () => {
    const a = await donoComMesas('Mesas A', [1]);
    const b = await donoComMesas('Mesas B', []);
    const id = a.lista.mesas[0]?.id ?? '';

    expect(b.lista.mesas).toEqual([]);
    expect((await b.navegador.pedir('GET', rotaCom(PAINEL.cartao, { id }))).statusCode).toBe(404);
    expect(
      (await b.navegador.pedir('PUT', rotaCom(PAINEL.mesa, { id }), { nome: 'x', area: null })).statusCode,
    ).toBe(404);
    expect((await b.navegador.pedir('POST', rotaCom(PAINEL.codigo, { id }))).statusCode).toBe(404);
  });

  it('PNG e ZIP: tipos e nomes certos; o ZIP só traz mesas ativas', async () => {
    const { navegador, lista, slug } = await donoComMesas('Mesas Cartões', [1, 2, 3]);
    await navegador.pedir('PUT', rotaCom(PAINEL.situacao, { id: lista.mesas[1]?.id ?? '' }), {
      ativa: false,
    });
    const png = await navegador.pedir('GET', rotaCom(PAINEL.cartao, { id: lista.mesas[0]?.id ?? '' }));
    const zip = await navegador.pedir('GET', PAINEL.cartoes);
    const nomes = [...zip.rawPayload.toString('latin1').matchAll(/mesa-\d+\.png/g)].map(
      (achado) => achado[0],
    );

    expect(png.headers['content-type']).toBe('image/png');
    expect(png.rawPayload.subarray(1, 4).toString()).toBe('PNG');
    expect(zip.headers['content-type']).toBe('application/zip');
    expect(zip.headers['content-disposition']).toBe(`attachment; filename="mesas-${slug}.zip"`);
    expect(new Set(nomes)).toEqual(new Set(['mesa-1.png', 'mesa-3.png']));
  });

  it('limite do período de teste: 30 ativas; a 31a é recusada', async () => {
    const { navegador } = await donoComMesas(
      'Mesas Limite',
      Array.from({ length: 30 }, (_, indice) => indice + 1),
    );
    const alem = await navegador.pedir('POST', PAINEL.mesas, { numero: 31, nome: null, area: null });
    const linhas = await consultarComUrl<{ total: number }>(
      inject('bancoDeTeste').urlAdmin,
      `SELECT count(*)::integer AS total FROM auditoria WHERE entidade = 'mesa' AND acao = 'criar' AND restaurante_id = (SELECT restaurante_id FROM mesas WHERE codigo = $1)`,
      [
        new URL(
          (await navegador.pedir('GET', PAINEL.mesas)).json<RespostaMesasDoPainel>().mesas[0]?.link ?? '',
        ).searchParams.get('c'),
      ],
    );

    expect(alem.statusCode).toBe(409);
    expect(alem.json<{ codigo: string }>().codigo).toBe('MESA_CRIAR_LIMITE_DO_PLANO');
    expect(linhas).toEqual([{ total: 30 }]);
  });
});
