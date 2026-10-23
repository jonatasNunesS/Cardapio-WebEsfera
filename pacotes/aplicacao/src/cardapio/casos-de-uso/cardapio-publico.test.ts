import { CODIGOS, type Derivados } from '@cardapio/dominio';
import { describe, expect, it } from 'vitest';
import { RelogioDeTeste } from '../../testes/dobles.ts';
import type {
  CacheDoCardapio,
  CardapioPublicado,
  DadosDoCardapioPublico,
  FonteDoCardapioPublico,
  ResolucaoDoCardapio,
} from '../portas/fonte-do-cardapio-publico.ts';
import { buscarPratos } from './buscar-pratos.ts';
import { obterCardapioPublicado } from './obter-cardapio-publicado.ts';

const RID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const ENDERECOS = { urlPublica: (caminho: string) => `https://midia.exemplo/${caminho}` };
const PREFIXO = `r/${RID}/midias/m1/`;

const VIDEO_PRONTO: Derivados = {
  tipo: 'video',
  capa: { caminho: `${PREFIXO}capa.jpg`, bytes: 1 },
  mp4: { caminho: `${PREFIXO}video.mp4`, bytes: 1 },
  webm: { caminho: `${PREFIXO}video.webm`, bytes: 1 },
  duracaoMs: 8000,
  imagem: {
    largura: 1280,
    altura: 720,
    variantes: [
      { caminho: `${PREFIXO}imagem-640.webp`, bytes: 1, formato: 'webp', largura: 640 },
      { caminho: `${PREFIXO}imagem-320.webp`, bytes: 1, formato: 'webp', largura: 320 },
      { caminho: `${PREFIXO}imagem-320.avif`, bytes: 1, formato: 'avif', largura: 320 },
    ],
  },
};

function dados(versao: number, midias: DadosDoCardapioPublico['midias'] = {}): DadosDoCardapioPublico {
  return {
    versao,
    restaurante: { nome: 'Brasa', slug: 'brasa', fusoHorario: 'America/Sao_Paulo' },
    personalizacao: null,
    horarios: [{ diaSemana: 4, abre: '16:00', fecha: '23:00' }],
    categorias: [{ id: 'c1', nome: 'Entradas', ordem: 1024, versao: 1 }],
    pratos: [
      {
        id: 'p1',
        categoriaId: 'c1',
        nome: 'Pão',
        descricao: '',
        precoCentavos: 2400,
        disponivel: true,
        destaque: true,
        ordem: 1024,
        versao: 1,
      },
    ],
    midias,
  };
}

class Fonte implements FonteDoCardapioPublico {
  leituras = 0;
  versao = 1;
  midias: DadosDoCardapioPublico['midias'] = {};
  buscas: (readonly string[])[] = [];
  private readonly resolucao: (slug: string) => ResolucaoDoCardapio;
  constructor(resolucao: (slug: string) => ResolucaoDoCardapio) {
    this.resolucao = resolucao;
  }
  resolver(slug: string) {
    return Promise.resolve(this.resolucao(slug));
  }
  ler() {
    this.leituras += 1;
    return Promise.resolve(dados(this.versao, this.midias));
  }
  buscar(_restauranteId: string, termos: readonly string[]) {
    this.buscas.push(termos);
    return Promise.resolve([]);
  }
}

class CacheEmMemoria implements CacheDoCardapio {
  readonly chaves = new Map<string, CardapioPublicado>();
  ler(restauranteId: string, versao: number) {
    return Promise.resolve(this.chaves.get(`${restauranteId}:${String(versao)}`) ?? null);
  }
  gravar(restauranteId: string, cardapio: CardapioPublicado) {
    this.chaves.set(`${restauranteId}:${String(cardapio.versao)}`, cardapio);
    return Promise.resolve();
  }
}

const valido = (versao: number): ResolucaoDoCardapio => ({
  situacao: 'valido',
  restauranteId: RID,
  slugAtual: 'brasa',
  versao,
});

describe('cardápio público', () => {
  it('lê do banco uma vez por versão; a versão nova reflete a mudança', async () => {
    let versao = 1;
    const fonte = new Fonte(() => valido(versao));
    const cache = new CacheEmMemoria();
    const dependencias = { fonte, cache, relogio: new RelogioDeTeste(), enderecos: ENDERECOS };

    await obterCardapioPublicado(dependencias, 'brasa');
    await obterCardapioPublicado(dependencias, 'brasa');
    versao = 2;
    fonte.versao = 2;
    const depois = await obterCardapioPublicado(dependencias, 'brasa');

    expect(fonte.leituras).toBe(2);
    expect([...cache.chaves.keys()]).toEqual([`${RID}:1`, `${RID}:2`]);
    expect(depois.ok && depois.valor.tipo === 'cardapio' && depois.valor.cardapio.versao).toBe(2);
  });

  it('traz personalização padrão, destaques e a situação do horário no fuso do restaurante', async () => {
    const dependencias = {
      fonte: new Fonte(() => valido(1)),
      cache: new CacheEmMemoria(),
      relogio: new RelogioDeTeste(),
      enderecos: ENDERECOS,
    };
    const resultado = await obterCardapioPublicado(dependencias, 'brasa');

    expect(resultado.ok && resultado.valor).toMatchObject({
      tipo: 'cardapio',
      aberto: true,
      cardapio: { destaques: ['p1'], personalizacao: { corMarca: '#B4441F' } },
    });
  });

  it('slug do histórico redireciona; inexistente ou cancelado dá não encontrado', async () => {
    const redireciona = new Fonte(() => ({
      situacao: 'redirecionar',
      restauranteId: RID,
      slugAtual: 'brasa-nova',
      versao: 1,
    }));
    const some = new Fonte(() => ({ situacao: 'inexistente' }));
    const relogio = new RelogioDeTeste();

    const antigo = await obterCardapioPublicado(
      { fonte: redireciona, cache: new CacheEmMemoria(), relogio, enderecos: ENDERECOS },
      'brasa',
    );
    const ausente = await obterCardapioPublicado(
      { fonte: some, cache: new CacheEmMemoria(), relogio, enderecos: ENDERECOS },
      'x',
    );

    expect(antigo.ok && antigo.valor).toEqual({ tipo: 'redirecionar', slug: 'brasa-nova' });
    expect(!ausente.ok && ausente.erro.codigo).toBe(CODIGOS.CARDAPIO_CONSULTAR_NAO_ENCONTRADO);
  });

  it('busca normaliza o termo e não consulta o banco com termo vazio', async () => {
    const fonte = new Fonte(() => valido(1));

    await buscarPratos({ fonte, enderecos: ENDERECOS }, 'brasa', '  Abóbora ');
    const vazia = await buscarPratos({ fonte, enderecos: ENDERECOS }, 'brasa', '!!!');

    expect(fonte.buscas).toEqual([['abobora']]);
    expect(vazia.ok && vazia.valor).toEqual({ tipo: 'resultados', pratos: [] });
  });

  it('busca em restaurante inexistente dá não encontrado, e slug antigo redireciona', async () => {
    const ausente = await buscarPratos(
      { fonte: new Fonte(() => ({ situacao: 'inexistente' })), enderecos: ENDERECOS },
      'x',
      'pao',
    );
    const antigo = await buscarPratos(
      {
        fonte: new Fonte(() => ({
          situacao: 'redirecionar',
          restauranteId: RID,
          slugAtual: 'novo',
          versao: 1,
        })),
        enderecos: ENDERECOS,
      },
      'velho',
      'pao',
    );
    expect(ausente.ok).toBe(false);
    expect(antigo.ok && antigo.valor).toEqual({ tipo: 'redirecionar', slug: 'novo' });
  });

  it('prato com vídeo pronto traz capa, mp4, webm e os srcset; sem mídia, traz nulo', async () => {
    const fonte = new Fonte(() => valido(1));
    fonte.midias = { p1: VIDEO_PRONTO };
    const dependencias = {
      fonte,
      cache: new CacheEmMemoria(),
      relogio: new RelogioDeTeste(),
      enderecos: ENDERECOS,
    };
    const comVideo = await obterCardapioPublicado(dependencias, 'brasa');
    const prato =
      comVideo.ok && comVideo.valor.tipo === 'cardapio'
        ? comVideo.valor.cardapio.secoes[0]?.pratos[0]
        : undefined;

    expect(prato?.midia).toEqual({
      tipo: 'video',
      imagem: {
        largura: 1280,
        altura: 720,
        src: `https://midia.exemplo/${PREFIXO}imagem-640.webp`,
        avif: `https://midia.exemplo/${PREFIXO}imagem-320.avif 320w`,
        webp: `https://midia.exemplo/${PREFIXO}imagem-320.webp 320w, https://midia.exemplo/${PREFIXO}imagem-640.webp 640w`,
      },
      video: {
        capa: `https://midia.exemplo/${PREFIXO}capa.jpg`,
        mp4: `https://midia.exemplo/${PREFIXO}video.mp4`,
        webm: `https://midia.exemplo/${PREFIXO}video.webm`,
        duracaoMs: 8000,
      },
    });

    const semMidia = await obterCardapioPublicado(
      { ...dependencias, fonte: new Fonte(() => valido(1)), cache: new CacheEmMemoria() },
      'brasa',
    );
    expect(
      semMidia.ok &&
        semMidia.valor.tipo === 'cardapio' &&
        semMidia.valor.cardapio.secoes[0]?.pratos[0]?.midia,
    ).toBeNull();
  });
});
