import {
  rotaCom,
  ROTAS_DO_CARDAPIO_NO_PAINEL as PAINEL,
  ROTAS_DO_CARDAPIO_PUBLICO as PUBLICO,
  ROTAS_DO_PAINEL,
  type CategoriaNoPainel,
  type PratoNoPainel,
  type RespostaBuscaPublica,
  type RespostaCardapioDoPainel,
  type RespostaCardapioPublico,
} from '@cardapio/contratos';
import { criarRedis } from '@cardapio/infraestrutura';
import { consultarComUrl, VARIAVEIS_DO_ARMAZENAMENTO_DE_TESTE } from '@cardapio/infraestrutura/testes';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { esquemaAmbienteApi } from '../../ambiente.ts';
import { comporApi } from '../index.ts';
import { donoComRestaurante, ipUnico, Navegador } from './navegador.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    urlRedisDeTeste: string;
    bancoDeTeste: { readonly urlApi: string; readonly urlAdmin: string };
  }
}

const HOSTS = { painel: 'painel.localhost', cardapio: 'cardapio.localhost' };

function comoAdmin(texto: string, valores: unknown[]) {
  return consultarComUrl<{ id: string }>(inject('bancoDeTeste').urlAdmin, texto, valores);
}

const relatorMudo = { reportar: () => randomUUID(), registrarPasso: () => undefined };

describe('cardápio pela API', () => {
  let servidor: FastifyInstance;
  let redis: ReturnType<typeof criarRedis>;

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
        ...VARIAVEIS_DO_ARMAZENAMENTO_DE_TESTE,
      }),
    );
    await servidor.ready();
    redis = criarRedis(inject('urlRedisDeTeste'), relatorMudo);
  });

  afterAll(async () => {
    await servidor.close();
    await redis.quit();
  });

  async function montarCardapio(nome: string) {
    const dono = await donoComRestaurante(servidor, HOSTS.painel, nome);
    const categoria = (
      await dono.navegador.pedir('POST', PAINEL.categorias, { nome: 'Principais' })
    ).json<CategoriaNoPainel>();
    const prato = async (nomeDoPrato: string, descricao: string) =>
      (
        await dono.navegador.pedir('POST', PAINEL.pratos, {
          categoriaId: categoria.id,
          nome: nomeDoPrato,
          descricao,
          precoCentavos: 8900,
          disponivel: true,
          destaque: false,
        })
      ).json<PratoNoPainel>();
    const costela = await prato('Costela na brasa', 'Fogo de chão.');
    const risoto = await prato('Risoto de abóbora', 'Queijo canastra.');
    return { ...dono, categoria, costela, risoto };
  }

  const publico = () => new Navegador(servidor, HOSTS.cardapio, ipUnico());

  it('painel: cria, lista, edita com versão, marca esgotado, reordena e remove', async () => {
    const { navegador, costela, risoto } = await montarCardapio('Brasa API');

    const editado = await navegador.pedir('PUT', rotaCom(PAINEL.prato, { id: costela.id }), {
      categoriaId: costela.categoriaId,
      nome: 'Costela 12 horas',
      descricao: costela.descricao,
      precoCentavos: costela.precoCentavos,
      disponivel: costela.disponivel,
      destaque: costela.destaque,
      versao: costela.versao,
    });
    const conflito = await navegador.pedir('PUT', rotaCom(PAINEL.prato, { id: costela.id }), {
      categoriaId: costela.categoriaId,
      nome: 'Outra',
      descricao: '',
      precoCentavos: 100,
      disponivel: true,
      destaque: false,
      versao: costela.versao,
    });
    const esgotado = await navegador.pedir('PATCH', rotaCom(PAINEL.situacaoDoPrato, { id: risoto.id }), {
      versao: risoto.versao,
      disponivel: false,
    });
    const movido = await navegador.pedir('PUT', rotaCom(PAINEL.posicaoDoPrato, { id: risoto.id }), {
      versao: risoto.versao + 1,
      posicao: 0,
    });
    const lista = (await navegador.pedir('GET', PAINEL.cardapio)).json<RespostaCardapioDoPainel>();

    expect(editado.statusCode).toBe(200);
    expect(editado.json<PratoNoPainel>().versao).toBe(costela.versao + 1);
    expect(conflito.statusCode).toBe(409);
    expect(conflito.json()).toMatchObject({ codigo: 'CARDAPIO_EDITAR_CONFLITO_DE_VERSAO' });
    expect(esgotado.statusCode).toBe(200);
    expect(movido.statusCode).toBe(204);
    expect(lista.categorias[0]?.pratos.map((prato) => [prato.nome, prato.disponivel])).toEqual([
      ['Risoto de abóbora', false],
      ['Costela 12 horas', true],
    ]);
    const removido = await navegador.pedir('DELETE', rotaCom(PAINEL.prato, { id: costela.id }), {
      versao: costela.versao + 1,
    });
    expect(removido.statusCode).toBe(204);
  });

  it('o restaurante vem só da sessão: corpo com restauranteId é recusado e B não alcança A', async () => {
    const a = await montarCardapio('Restaurante A');
    const b = await donoComRestaurante(servidor, HOSTS.painel, 'Restaurante B');

    const comRestaurante = await b.navegador.pedir('POST', PAINEL.categorias, {
      nome: 'Invasão',
      restauranteId: a.categoria.id,
    });
    const listaDeB = (await b.navegador.pedir('GET', PAINEL.cardapio)).json<RespostaCardapioDoPainel>();
    const editarDeA = await b.navegador.pedir(
      'PATCH',
      rotaCom(PAINEL.situacaoDoPrato, { id: a.costela.id }),
      {
        versao: 1,
        disponivel: false,
      },
    );
    const pratoNaCategoriaDeA = await b.navegador.pedir('POST', PAINEL.pratos, {
      categoriaId: a.categoria.id,
      nome: 'Invasor',
      descricao: '',
      precoCentavos: 100,
      disponivel: true,
      destaque: false,
    });

    expect(comRestaurante.statusCode).toBe(400);
    expect(listaDeB.categorias).toEqual([]);
    expect(editarDeA.statusCode).toBe(404);
    expect(pratoNaCategoriaDeA.statusCode).toBe(404);
  });

  it('sem sessão, o painel do cardápio responde 401; no host público as rotas do painel não existem', async () => {
    const anonimo = new Navegador(servidor, HOSTS.painel, ipUnico());
    expect((await anonimo.pedir('GET', PAINEL.cardapio)).statusCode).toBe(401);
    expect((await publico().pedir('GET', PAINEL.cardapio)).statusCode).toBe(404);
  });

  it('leitura pública: cache com o restaurante na chave, mudança publicada aparece na leitura seguinte', async () => {
    const { navegador, slug, costela } = await montarCardapio('Cardápio Público');
    const url = rotaCom(PUBLICO.cardapio, { slug });

    const primeira = await publico().pedir('GET', url);
    const corpo = primeira.json<RespostaCardapioPublico>();
    const chaves = await redis.keys(`r:*:cardapio:v${String(corpo.versao)}`);
    await navegador.pedir('PATCH', rotaCom(PAINEL.situacaoDoPrato, { id: costela.id }), {
      versao: costela.versao,
      disponivel: false,
    });
    const segunda = (await publico().pedir('GET', url)).json<RespostaCardapioPublico>();

    expect(primeira.statusCode).toBe(200);
    expect(primeira.headers['cache-control']).toContain('max-age=30');
    expect(corpo.secoes[0]?.pratos[0]).toMatchObject({
      nome: 'Costela na brasa',
      preco: 'R$ 89,00',
      disponivel: true,
    });
    expect(chaves.some((chave) => /^r:[0-9a-f-]{36}:cardapio:v\d+$/.test(chave))).toBe(true);
    expect(segunda.versao).toBeGreaterThan(corpo.versao);
    expect(segunda.secoes[0]?.pratos[0]?.disponivel).toBe(false);
  });

  it('fechado traz a marca e a próxima abertura; o cardápio continua visível', async () => {
    const { navegador, slug } = await montarCardapio('Fechado Agora');
    const amanha = (new Date().getUTCDay() + 3) % 7;
    await navegador.pedir('PUT', ROTAS_DO_PAINEL.horarios, {
      horarios: [{ diaSemana: amanha, abre: '18:00', fecha: '19:00' }],
    });

    const corpo = (
      await publico().pedir('GET', rotaCom(PUBLICO.cardapio, { slug }))
    ).json<RespostaCardapioPublico>();

    expect(corpo.aberto).toBe(false);
    expect(corpo.proximaAbertura).toMatchObject({ abre: '18:00', hoje: false });
    expect(corpo.secoes).toHaveLength(1);
  });

  it('slug do histórico redireciona com 301; cancelado e inexistente dão 404', async () => {
    const { slug } = await montarCardapio('Slug Antigo');
    const [restaurante] = await comoAdmin('SELECT id FROM restaurantes WHERE slug = $1', [slug]);
    const restauranteId = restaurante?.id;
    const novo = `${slug}-renovado`;
    await comoAdmin('INSERT INTO historico_slugs (restaurante_id, slug) VALUES ($1, $2)', [
      restauranteId,
      novo,
    ]);
    await comoAdmin('UPDATE restaurantes SET slug = $1 WHERE id = $2', [novo, restauranteId]);

    const antigo = await publico().pedir('GET', rotaCom(PUBLICO.cardapio, { slug }));
    const buscaAntiga = await publico().pedir('GET', `${rotaCom(PUBLICO.busca, { slug })}?termo=costela`);
    await comoAdmin("UPDATE restaurantes SET situacao = 'cancelado' WHERE id = $1", [restauranteId]);
    const cancelado = await publico().pedir('GET', rotaCom(PUBLICO.cardapio, { slug: novo }));
    const inexistente = await publico().pedir('GET', rotaCom(PUBLICO.cardapio, { slug: 'nao-existe-nunca' }));

    expect(antigo.statusCode).toBe(301);
    expect(antigo.headers.location).toBe(rotaCom(PUBLICO.cardapio, { slug: novo }));
    expect(buscaAntiga.headers.location).toBe(`${rotaCom(PUBLICO.busca, { slug: novo })}?termo=costela`);
    expect(cancelado.statusCode).toBe(404);
    expect(inexistente.statusCode).toBe(404);
  });

  it('busca pública sem acento, e o limite de taxa responde 429', async () => {
    const { slug } = await montarCardapio('Busca Pública');
    const cliente = publico();
    const buscar = (termo: string) =>
      cliente.pedir('GET', `${rotaCom(PUBLICO.busca, { slug })}?termo=${termo}`);

    const abobora = (await buscar('abobora')).json<RespostaBuscaPublica>();
    const vazia = (await buscar('lagosta')).json<RespostaBuscaPublica>();
    const respostas = [];
    for (let pedido = 0; pedido < 60; pedido += 1) {
      respostas.push((await buscar('costela')).statusCode);
    }

    expect(abobora.resultados.map((prato) => prato.nome)).toEqual(['Risoto de abóbora']);
    expect(vazia.resultados).toEqual([]);
    expect(respostas.filter((status) => status === 429).length).toBeGreaterThan(0);
  });
});
