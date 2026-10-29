import {
  rotaCom,
  ROTAS_DA_MIDIA_NO_PAINEL as MIDIA,
  ROTAS_DO_CARDAPIO_NO_PAINEL as PAINEL,
  ROTAS_DO_CARDAPIO_PUBLICO as PUBLICO,
  type CategoriaNoPainel,
  type PratoNoPainel,
  type RespostaCardapioPublico,
  type RespostaMidiasDoPrato,
  type RespostaPedidoDeEnvio,
} from '@cardapio/contratos';
import { consultarComUrl, VARIAVEIS_DO_ARMAZENAMENTO_DE_TESTE } from '@cardapio/infraestrutura/testes';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { esquemaAmbienteApi } from '../../ambiente.ts';
import { comporApi } from '../index.ts';
import { donoComRestaurante, ipUnico, Navegador } from './navegador.ts';

const HOSTS = { painel: 'painel.localhost', cardapio: 'cardapio.localhost' };
const VIDEO = { tipoConteudo: 'video/mp4', tamanhoBytes: 15 };

function comoAdmin(texto: string, valores: unknown[]) {
  return consultarComUrl<Record<string, unknown>>(inject('bancoDeTeste').urlAdmin, texto, valores);
}

describe('mídia pela API', () => {
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
      }),
    );
    await servidor.ready();
  });

  afterAll(async () => {
    await servidor.close();
  });

  async function donoComPrato(nome: string) {
    const dono = await donoComRestaurante(servidor, HOSTS.painel, nome);
    const categoria = (
      await dono.navegador.pedir('POST', PAINEL.categorias, { nome: 'Principais' })
    ).json<CategoriaNoPainel>();
    const prato = (
      await dono.navegador.pedir('POST', PAINEL.pratos, {
        categoriaId: categoria.id,
        nome: 'Costela',
        descricao: '',
        precoCentavos: 8900,
        disponivel: true,
        destaque: false,
      })
    ).json<PratoNoPainel>();
    return { ...dono, prato };
  }

  it('pede a URL assinada, envia direto ao armazenamento e confirma; a mídia aparece processando', async () => {
    const { navegador, prato } = await donoComPrato('Mídia API');
    const pedido = await navegador.pedir('POST', rotaCom(MIDIA.midiasDoPrato, { id: prato.id }), VIDEO);
    const envio = pedido.json<RespostaPedidoDeEnvio>();
    const semArquivo = await navegador.pedir('POST', rotaCom(MIDIA.confirmacao, { id: envio.midiaId }));
    const enviado = await fetch(envio.url, {
      method: 'PUT',
      body: 'quinze bytes!!!',
      headers: envio.cabecalhos,
    });
    const confirmado = await navegador.pedir('POST', rotaCom(MIDIA.confirmacao, { id: envio.midiaId }));
    const consulta = (
      await navegador.pedir('GET', rotaCom(MIDIA.midiasDoPrato, { id: prato.id }))
    ).json<RespostaMidiasDoPrato>();

    expect(pedido.statusCode).toBe(201);
    expect(envio.metodo).toBe('PUT');
    expect(semArquivo.statusCode).toBe(409);
    expect(enviado.status).toBe(200);
    expect(confirmado.statusCode).toBe(204);
    expect(consulta).toEqual({
      atual: null,
      pendente: {
        id: envio.midiaId,
        tipo: 'video',
        situacao: 'processando',
        motivoFalha: null,
        publicada: null,
      },
    });
  });

  it('recusa tipo e tamanho fora do aceito, campo a mais (restauranteId) e pedido sem CSRF', async () => {
    const { navegador, prato } = await donoComPrato('Mídia recusas');
    const rota = rotaCom(MIDIA.midiasDoPrato, { id: prato.id });
    const tipo = await navegador.pedir('POST', rota, { ...VIDEO, tipoConteudo: 'image/gif' });
    const grande = await navegador.pedir('POST', rota, { ...VIDEO, tamanhoBytes: 200 * 1024 * 1024 });
    const intruso = await navegador.pedir('POST', rota, { ...VIDEO, restauranteId: prato.id });
    navegador.csrf = '';
    const semCsrf = await navegador.pedir('POST', rota, VIDEO);

    expect(tipo.statusCode).toBe(422);
    expect(grande.statusCode).toBe(400);
    expect(intruso.statusCode).toBe(400);
    expect(semCsrf.statusCode).toBe(403);
  });

  it('isolamento: B não envia para o prato de A, não confirma, não reprocessa e não remove a mídia de A', async () => {
    const a = await donoComPrato('Mídia A');
    const b = await donoComPrato('Mídia B');
    const envio = (
      await a.navegador.pedir('POST', rotaCom(MIDIA.midiasDoPrato, { id: a.prato.id }), VIDEO)
    ).json<RespostaPedidoDeEnvio>();

    const respostas = await Promise.all([
      b.navegador.pedir('POST', rotaCom(MIDIA.midiasDoPrato, { id: a.prato.id }), VIDEO),
      b.navegador.pedir('POST', rotaCom(MIDIA.confirmacao, { id: envio.midiaId })),
      b.navegador.pedir('POST', rotaCom(MIDIA.novaTentativa, { id: envio.midiaId })),
      b.navegador.pedir('DELETE', rotaCom(MIDIA.midiaDoPrato, { id: a.prato.id })),
      b.navegador.pedir('GET', rotaCom(MIDIA.midiasDoPrato, { id: a.prato.id })),
    ]);

    expect(respostas.map((resposta) => resposta.statusCode)).toEqual([404, 404, 404, 404, 404]);
    const [linha] = await comoAdmin('SELECT situacao, descartada_em FROM midias WHERE id = $1', [
      envio.midiaId,
    ]);
    expect(linha).toEqual({ situacao: 'enviando', descartada_em: null });
  });

  it('cardápio público: com vídeo pronto traz capa, mp4, webm e srcset; sem, traz nulo; B não vê a mídia de A', async () => {
    const a = await donoComPrato('Mídia pública A');
    const b = await donoComPrato('Mídia pública B');
    const envio = (
      await a.navegador.pedir('POST', rotaCom(MIDIA.midiasDoPrato, { id: a.prato.id }), VIDEO)
    ).json<RespostaPedidoDeEnvio>();
    const [restaurante] = await comoAdmin('SELECT restaurante_id FROM midias WHERE id = $1', [envio.midiaId]);
    const prefixo = `r/${String(restaurante?.restaurante_id)}/midias/${envio.midiaId}/`;
    const derivados = {
      tipo: 'video',
      capa: { caminho: `${prefixo}capa.jpg`, bytes: 1 },
      mp4: { caminho: `${prefixo}video.mp4`, bytes: 1 },
      webm: { caminho: `${prefixo}video.webm`, bytes: 1 },
      duracaoMs: 8000,
      imagem: {
        largura: 640,
        altura: 360,
        variantes: [{ caminho: `${prefixo}imagem-640.webp`, bytes: 1, formato: 'webp', largura: 640 }],
      },
    };
    await comoAdmin(
      `WITH m AS (UPDATE midias SET situacao = 'pronta', derivados = $2, pronta_em = now() WHERE id = $1 RETURNING prato_id)
       UPDATE pratos SET midia_id = $1 WHERE id = (SELECT prato_id FROM m)`,
      [envio.midiaId, JSON.stringify(derivados)],
    );
    const ler = async (slug: string) =>
      (
        await new Navegador(servidor, HOSTS.cardapio, ipUnico()).pedir(
          'GET',
          rotaCom(PUBLICO.cardapio, { slug }),
        )
      ).json<RespostaCardapioPublico>();
    const base = VARIAVEIS_DO_ARMAZENAMENTO_DE_TESTE.URL_PUBLICA_MIDIA;

    const deA = (await ler(a.slug)).secoes[0]?.pratos[0]?.midia;
    const deB = (await ler(b.slug)).secoes[0]?.pratos[0]?.midia;

    expect(deA).toEqual({
      tipo: 'video',
      imagem: {
        largura: 640,
        altura: 360,
        src: `${base}/${prefixo}imagem-640.webp`,
        avif: '',
        webp: `${base}/${prefixo}imagem-640.webp 640w`,
      },
      video: {
        capa: `${base}/${prefixo}capa.jpg`,
        mp4: `${base}/${prefixo}video.mp4`,
        webm: `${base}/${prefixo}video.webm`,
        duracaoMs: 8000,
      },
    });
    expect(deB).toBeNull();
  });
});
