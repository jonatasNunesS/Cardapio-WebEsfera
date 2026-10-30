import type { RespostaCardapioPublico } from '@cardapio/contratos';
import { describe, expect, it } from 'vitest';
import { carregarMesa, type Buscar } from './carregar-mesa.ts';
import { criarLembranca } from './lembranca.ts';

const CARDAPIO = {
  restaurante: { nome: 'Brasa', slug: 'brasa' },
  personalizacao: null,
  aberto: true,
  proximaAbertura: null,
  secoes: [],
  destaques: [],
  versao: 1,
} satisfies RespostaCardapioPublico;

const AGORA = new Date('2026-10-29T20:00:00Z');
const EXPIRA = '2026-10-30T00:00:00.000Z';
const PEDIDO = { slug: 'brasa', numero: 12, codigo: 'Zm9vYmFyX2Jhei1xdXV4MTI', agora: AGORA };

function armazenamentoEmMemoria(): Storage {
  const dados = new Map<string, string>();
  return {
    get length() {
      return dados.size;
    },
    clear: () => {
      dados.clear();
    },
    getItem: (chave) => dados.get(chave) ?? null,
    key: (indice) => [...dados.keys()][indice] ?? null,
    removeItem: (chave) => {
      dados.delete(chave);
    },
    setItem: (chave, valor) => {
      dados.set(chave, valor);
    },
  };
}

function servidor(rotas: Readonly<Record<string, () => Response>>) {
  const chamadas: string[] = [];
  const buscar: Buscar = (endereco) => {
    chamadas.push(endereco);
    const responder = rotas[endereco.split('?')[0] ?? ''];
    return responder === undefined
      ? Promise.reject(new TypeError('Failed to fetch'))
      : Promise.resolve(responder());
  };
  return { buscar, chamadas };
}

function lembrancaNova() {
  const armazenamento = armazenamentoEmMemoria();
  return criarLembranca(() => armazenamento);
}

const MESA = '/api/v1/cardapios/brasa/mesa/12';
const sessao =
  (slug = 'brasa', numero = 12) =>
  () =>
    Response.json({ slug, numero, expiraEm: EXPIRA });
const cardapio = () => Response.json(CARDAPIO);

describe('carregar a mesa', () => {
  it('código válido: abre a sessão e carrega o cardápio pelo slug em paralelo; guarda a mesa sem o código', async () => {
    const armazenamento = armazenamentoEmMemoria();
    const { buscar, chamadas } = servidor({ [MESA]: sessao(), '/api/v1/cardapios/brasa': cardapio });

    const carregada = await carregarMesa(
      buscar,
      criarLembranca(() => armazenamento),
      PEDIDO,
    );

    expect(carregada).toEqual({
      tipo: 'pronta',
      mesa: { slug: 'brasa', numero: 12, expiraEm: EXPIRA },
      cardapio: CARDAPIO,
      offline: false,
    });
    expect([...chamadas].sort()).toEqual(['/api/v1/cardapios/brasa', `${MESA}?c=${PEDIDO.codigo}`]);
    expect(
      JSON.stringify(
        [...Array(armazenamento.length).keys()].map((i) => armazenamento.getItem(armazenamento.key(i) ?? '')),
      ),
    ).not.toContain(PEDIDO.codigo);
  });

  it('slug ou número antigos: pede o redirecionamento para o link atual', async () => {
    const { buscar } = servidor({ [MESA]: sessao('brasa-nova', 40) });

    expect(await carregarMesa(buscar, lembrancaNova(), PEDIDO)).toEqual({
      tipo: 'redirecionar',
      slug: 'brasa-nova',
      numero: 40,
    });
  });

  it('404 da rota da mesa: QR inválido, e esquece a mesa lembrada', async () => {
    const armazenamento = armazenamentoEmMemoria();
    const lembranca = criarLembranca(() => armazenamento);
    lembranca.guardarMesa({ slug: 'brasa', numero: 12, expiraEm: EXPIRA });
    const { buscar } = servidor({
      [MESA]: () => Response.json({ codigo: 'MESA_ABRIR_QR_INVALIDO' }, { status: 404 }),
    });

    expect(await carregarMesa(buscar, lembranca, PEDIDO)).toEqual({ tipo: 'qr-invalido' });
    expect(lembranca.lerMesa('brasa', 12)).toBeUndefined();
  });

  it('sem rede, com a mesa lembrada e o cardápio no cache: mostra o cardápio offline', async () => {
    const lembranca = lembrancaNova();
    lembranca.guardarMesa({ slug: 'brasa', numero: 12, expiraEm: EXPIRA });
    const { buscar } = servidor({ '/api/v1/cardapios/brasa': cardapio });

    expect(await carregarMesa(buscar, lembranca, PEDIDO)).toMatchObject({ tipo: 'pronta', offline: true });
  });

  it('sem rede: sem mesa lembrada, sem conexão; mesa de outro restaurante não serve', async () => {
    const lembranca = lembrancaNova();
    lembranca.guardarMesa({ slug: 'outro', numero: 12, expiraEm: EXPIRA });
    const { buscar } = servidor({});

    expect(await carregarMesa(buscar, lembranca, PEDIDO)).toEqual({ tipo: 'sem-conexao' });
  });

  it('sem rede, com a sessão lembrada já vencida: sessão expirada', async () => {
    const lembranca = lembrancaNova();
    lembranca.guardarMesa({ slug: 'brasa', numero: 12, expiraEm: '2026-10-29T19:00:00.000Z' });
    const { buscar } = servidor({});

    expect(await carregarMesa(buscar, lembranca, PEDIDO)).toEqual({ tipo: 'expirada' });
  });

  it('erro do servidor na rota da mesa não vira QR inválido', async () => {
    const { buscar } = servidor({ [MESA]: () => new Response(null, { status: 503 }) });

    expect(await carregarMesa(buscar, lembrancaNova(), PEDIDO)).toEqual({
      tipo: 'sem-conexao',
    });
  });

  it('abertura: vista uma vez por sessão de mesa; sessão nova mostra de novo', () => {
    const lembranca = lembrancaNova();
    const mesa = { slug: 'brasa', numero: 12, expiraEm: EXPIRA };

    expect(lembranca.aberturaVista(mesa)).toBe(false);
    lembranca.marcarAberturaVista(mesa);
    expect(lembranca.aberturaVista(mesa)).toBe(true);
    expect(lembranca.aberturaVista({ ...mesa, expiraEm: '2026-10-30T04:00:00.000Z' })).toBe(false);
    expect(lembranca.aberturaVista({ ...mesa, numero: 13 })).toBe(false);
    expect(criarLembranca(() => undefined).aberturaVista(mesa)).toBe(false);
  });
});
