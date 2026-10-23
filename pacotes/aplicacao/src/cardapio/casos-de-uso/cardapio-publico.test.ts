import { CODIGOS } from '@cardapio/dominio';
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

function dados(versao: number): DadosDoCardapioPublico {
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
  };
}

class Fonte implements FonteDoCardapioPublico {
  leituras = 0;
  versao = 1;
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
    return Promise.resolve(dados(this.versao));
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
    const dependencias = { fonte, cache, relogio: new RelogioDeTeste() };

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
      { fonte: redireciona, cache: new CacheEmMemoria(), relogio },
      'brasa',
    );
    const ausente = await obterCardapioPublicado({ fonte: some, cache: new CacheEmMemoria(), relogio }, 'x');

    expect(antigo.ok && antigo.valor).toEqual({ tipo: 'redirecionar', slug: 'brasa-nova' });
    expect(!ausente.ok && ausente.erro.codigo).toBe(CODIGOS.CARDAPIO_CONSULTAR_NAO_ENCONTRADO);
  });

  it('busca normaliza o termo e não consulta o banco com termo vazio', async () => {
    const fonte = new Fonte(() => valido(1));

    await buscarPratos({ fonte }, 'brasa', '  Abóbora ');
    const vazia = await buscarPratos({ fonte }, 'brasa', '!!!');

    expect(fonte.buscas).toEqual([['abobora']]);
    expect(vazia.ok && vazia.valor).toEqual({ tipo: 'resultados', pratos: [] });
  });

  it('busca em restaurante inexistente dá não encontrado, e slug antigo redireciona', async () => {
    const ausente = await buscarPratos({ fonte: new Fonte(() => ({ situacao: 'inexistente' })) }, 'x', 'pao');
    const antigo = await buscarPratos(
      {
        fonte: new Fonte(() => ({
          situacao: 'redirecionar',
          restauranteId: RID,
          slugAtual: 'novo',
          versao: 1,
        })),
      },
      'velho',
      'pao',
    );
    expect(ausente.ok).toBe(false);
    expect(antigo.ok && antigo.valor).toEqual({ tipo: 'redirecionar', slug: 'novo' });
  });
});
